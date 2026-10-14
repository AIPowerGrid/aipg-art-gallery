// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
	"github.com/google/uuid"
)

func TestDurableVideoSurvivesActualProcessCrash(t *testing.T) {
	for _, method := range []string{"google", "wallet"} {
		t.Run(method, func(t *testing.T) {
			db := recoveryDatabase(t)
			var schema string
			if err := db.QueryRow("SELECT current_schema()").Scan(&schema); err != nil {
				t.Fatal(err)
			}
			dsn, err := url.Parse(os.Getenv("GALLERY_TEST_POSTGRES_URL"))
			if err != nil {
				t.Fatal(err)
			}
			query := dsn.Query()
			query.Set("search_path", schema)
			dsn.RawQuery = query.Encode()
			t.Setenv("JWT_SECRET", newJobID()+newJobID())
			t.Setenv("GALLERY_CRASH_TEST_VIDEO", "1")
			t.Setenv("GALLERY_CRASH_TEST_VIDEO_UNTIL", time.Now().Add(time.Hour).UTC().Format(time.RFC3339))
			var token string
			if method == "google" {
				token, err = auth.GenerateGoogleJWT("fixture-google", "fixture@example.test", "Fixture", "", brokerOwner)
			} else {
				token, err = auth.GenerateWalletJWT("0x"+strings.Repeat("1", 40), "", brokerOwner)
			}
			if err != nil {
				t.Fatal(err)
			}
			var posts, quotes atomic.Int32
			var completed atomic.Bool
			var key atomic.Value
			key.Store("")
			received := make(chan struct{}, 2)
			shutdown := make(chan struct{})
			core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("apikey") != "local-crash-test-key" {
					t.Error("missing service credential")
				}
				if r.URL.Path == "/auth/service/exchange" {
					writeJSON(w, 200, map[string]string{"access_token": "fixture-user", "account_id": brokerOwner})
					return
				}
				if r.Header.Get("X-Grid-User-Token") != "fixture-user" {
					t.Error("missing delegated user")
				}
				switch r.URL.Path {
				case "/account/ownership":
					writeJSON(w, 200, map[string]any{"account_id": brokerOwner, "account_aliases": []string{}})
				case "/account/credits/quote":
					quotes.Add(1)
					writeJSON(w, 200, validBrokerQuote())
				case "/videos/jobs":
					if r.Method == http.MethodPost {
						posts.Add(1)
						key.Store(r.Header.Get("Idempotency-Key"))
						received <- struct{}{}
						select {
						case <-r.Context().Done():
						case <-shutdown:
						}
						return
					}
					if r.Method != http.MethodGet || r.Header.Get("Idempotency-Key") != key.Load() {
						t.Error("crash recovery changed key or method")
					}
					if !completed.Load() {
						writeJSON(w, 404, map[string]string{"detail": "unknown"})
					} else {
						writeJSON(w, 200, brokerReceipt(t, "completed"))
					}
				default:
					t.Errorf("unexpected path %s", r.URL.Path)
					writeJSON(w, 500, map[string]string{"detail": "unexpected"})
				}
			}))
			defer core.Close()
			defer close(shutdown)
			origin, crash := startRecoveryProcess(t, dsn.String(), core.URL)
			client := &http.Client{Timeout: 10 * time.Second}
			requestID := uuid.NewString()
			encoded, err := json.Marshal(durableVideoRequest{RequestID: requestID, Video: brokerVideoRequest()})
			if err != nil {
				t.Fatal(err)
			}
			call := func(method, path, body string) (int, []byte) {
				t.Helper()
				r, err := http.NewRequest(method, origin+path, strings.NewReader(body))
				if err != nil {
					t.Fatal(err)
				}
				r.Header.Set("Authorization", "Bearer "+token)
				r.Header.Set("Content-Type", "application/json")
				response, err := client.Do(r)
				if err != nil {
					t.Fatal(err)
				}
				defer response.Body.Close()
				data, err := io.ReadAll(response.Body)
				if err != nil {
					t.Fatal(err)
				}
				return response.StatusCode, data
			}
			status, data := call("POST", "/api/videos/jobs", string(encoded))
			var accepted struct {
				JobID string `json:"jobId"`
			}
			if json.Unmarshal(data, &accepted) != nil || status != 202 || accepted.JobID == "" {
				t.Fatalf("submit: %d %s", status, data)
			}
			select {
			case <-received:
			case <-time.After(10 * time.Second):
				t.Fatal("no original Core POST")
			}
			crash()
			origin, _ = startRecoveryProcess(t, dsn.String(), core.URL)
			status, data = call("POST", "/api/videos/jobs", string(encoded))
			var replay struct {
				JobID string `json:"jobId"`
			}
			if json.Unmarshal(data, &replay) != nil || status != 202 || replay.JobID != accepted.JobID {
				t.Fatalf("crash replay: %d %s", status, data)
			}
			status, data = call("GET", "/api/videos/requests/"+requestID, "")
			var view JobView
			if json.Unmarshal(data, &view) != nil || status != 200 || !strings.Contains(view.Error, "outcome is unknown") || len(view.Generations) != 0 {
				t.Fatalf("unknown crash recovery: %d %s", status, data)
			}
			completed.Store(true)
			status, data = call("GET", "/api/videos/requests/"+requestID, "")
			if json.Unmarshal(data, &view) != nil || status != 200 || view.Status != "completed" ||
				view.VideoReceipt == nil || view.GridJobID != brokerCoreID || len(view.Generations) != 1 {
				t.Fatalf("completed crash recovery: %d %s", status, data)
			}
			persisted, found, err := persistentPending(db).get(context.Background(), accepted.JobID, brokerOwner)
			if err != nil || !found || persisted.Status != "completed" || persisted.Video.Receipt.State != "completed" {
				t.Fatal("recovered Core receipt was not durable")
			}
			if posts.Load() != 1 || quotes.Load() != 1 {
				t.Fatal("process crash caused another POST or quote")
			}
		})
	}
}
