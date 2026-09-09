// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/config"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/models"
)

// The test executable supplies a separate process with the real router and journal.
func TestGalleryRecoveryProcess(t *testing.T) {
	if os.Getenv("GALLERY_CRASH_TEST_CHILD") != "1" {
		return
	}
	db, err := sql.Open("postgres", os.Getenv("GALLERY_CRASH_TEST_DSN"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	catalog, err := models.LoadCatalog("../../config/model_presets.json")
	if err != nil {
		t.Fatal(err)
	}
	app := &App{cfg: config.Config{DefaultAPIKey: "local-crash-test-key"},
		client:  aipg.NewClient(os.Getenv("GALLERY_CRASH_TEST_CORE"), "test"),
		catalog: catalog, pending: persistentPending(db)}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	if err := os.WriteFile(os.Getenv("GALLERY_CRASH_TEST_READY"), []byte("http://"+listener.Addr().String()), 0600); err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: app.Router(), ReadHeaderTimeout: 5 * time.Second}
	if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
		t.Fatal(err)
	}
}

func startRecoveryProcess(t *testing.T, dsn, coreURL string) (string, func()) {
	t.Helper()
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	ready := filepath.Join(t.TempDir(), "ready")
	cmd := exec.Command(executable, "-test.run=^TestGalleryRecoveryProcess$", "-test.timeout=60s")
	cmd.Env = append(os.Environ(), "GALLERY_CRASH_TEST_CHILD=1", "GALLERY_CRASH_TEST_DSN="+dsn,
		"GALLERY_CRASH_TEST_CORE="+coreURL, "GALLERY_CRASH_TEST_READY="+ready)
	var output bytes.Buffer
	cmd.Stdout, cmd.Stderr = &output, &output
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	exited := make(chan struct{})
	go func() {
		// SIGKILL is the intended nonzero exit; unexpected early exits are reported below.
		_ = cmd.Wait()
		close(exited)
	}()
	var once sync.Once
	stop := func() {
		once.Do(func() {
			select {
			case <-exited:
				return
			default:
			}
			if err := cmd.Process.Kill(); err != nil && err != os.ErrProcessDone {
				t.Error(err)
			}
			select {
			case <-exited:
			case <-time.After(10 * time.Second):
				t.Error("crashed Gallery process did not exit")
			}
		})
	}
	t.Cleanup(stop)
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case <-exited:
			t.Fatalf("Gallery test process exited before ready: %s", output.String())
		default:
		}
		if data, err := os.ReadFile(ready); err == nil && len(data) > 0 {
			return string(data), stop
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("Gallery test process did not become ready")
	return "", stop
}

func TestInFlightJobSurvivesProcessCrash(t *testing.T) {
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
			owner := "00000000-0000-4000-8000-000000000123"
			var token string
			if method == "google" {
				token, err = auth.GenerateGoogleJWT("test-google", "test@example.test", "Test", "", owner)
			} else {
				token, err = auth.GenerateWalletJWT("0x"+strings.Repeat("1", 40), "", owner)
			}
			if err != nil {
				t.Fatal(err)
			}
			var generates, quotes atomic.Int32
			var completed atomic.Bool
			var clientRef atomic.Value
			received := make(chan string, 2)
			shutdown := make(chan struct{})
			core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("apikey") != "local-crash-test-key" {
					t.Error("missing service credential")
				}
				if r.URL.Path == "/auth/service/exchange" {
					writeJSON(w, 200, map[string]string{"access_token": "delegated-test-token", "account_id": owner})
					return
				}
				if r.Header.Get("X-Grid-User-Token") != "delegated-test-token" {
					t.Error("missing delegated identity")
				}
				switch r.URL.Path {
				case "/account/ownership":
					writeJSON(w, 200, map[string]any{"account_id": owner, "account_aliases": []string{}})
				case "/account/credits/quote":
					quotes.Add(1)
					writeJSON(w, 200, map[string]any{"account_id": owner, "charging_enabled": true,
						"estimate": map[string]any{"priced": true, "balance_sufficient": true}})
				case "/images/generations":
					generates.Add(1)
					var body struct {
						ClientRef string `json:"progress_token"`
					}
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ClientRef == "" {
						t.Error("missing generation correlation")
					}
					clientRef.Store(body.ClientRef)
					received <- body.ClientRef
					select {
					case <-r.Context().Done():
					case <-shutdown:
					}
				case "/media/results":
					if r.Method != http.MethodGet || r.URL.Query().Get("client_ref") != clientRef.Load() {
						t.Error("recovery did not use the original request reference")
					}
					if !completed.Load() {
						writeJSON(w, 404, map[string]string{"detail": "not yet complete"})
						return
					}
					writeJSON(w, 200, map[string]any{"job_id": "00000000-0000-4000-8000-000000000456", "state": "completed", "actual_micro": 5000,
						"result": map[string]any{"model": "Z-Image Turbo", "worker": "test-worker", "gen_time": 1,
							"media": []map[string]any{{"url": "https://images.example/recovered.webp", "seed": 12}}}})
				default:
					t.Errorf("unexpected Core request %s", r.URL.Path)
					writeJSON(w, 500, map[string]string{"detail": "unexpected request"})
				}
			}))
			defer core.Close()
			defer close(shutdown)
			origin, crash := startRecoveryProcess(t, dsn.String(), core.URL)
			client := &http.Client{Timeout: 10 * time.Second}
			requestID := newJobID()
			body := fmt.Sprintf(`{"requestId":%q,"modelId":"z-image-turbo","prompt":"test image","params":{"n":1}}`, requestID)
			call := func(method, path, payload string) (int, string) {
				t.Helper()
				req, err := http.NewRequest(method, origin+path, strings.NewReader(payload))
				if err != nil {
					t.Fatal(err)
				}
				req.Header.Set("Authorization", "Bearer "+token)
				req.Header.Set("Content-Type", "application/json")
				response, err := client.Do(req)
				if err != nil {
					t.Fatal(err)
				}
				defer response.Body.Close()
				data, err := io.ReadAll(response.Body)
				if err != nil {
					t.Fatal(err)
				}
				return response.StatusCode, string(data)
			}
			status, data := call("POST", "/api/jobs", body)
			if status != 202 {
				t.Fatalf("submit: %d %s", status, data)
			}
			var accepted struct {
				JobID string `json:"jobId"`
			}
			if err := json.Unmarshal([]byte(data), &accepted); err != nil {
				t.Fatal(err)
			}
			select {
			case ref := <-received:
				if ref != accepted.JobID {
					t.Fatal("Core reference differs from journal ID")
				}
			case <-time.After(10 * time.Second):
				t.Fatal("no upstream generation before crash")
			}
			crash()
			origin, _ = startRecoveryProcess(t, dsn.String(), core.URL)
			status, data = call("POST", "/api/jobs", body)
			var replay struct {
				JobID string `json:"jobId"`
			}
			if err := json.Unmarshal([]byte(data), &replay); err != nil {
				t.Fatal(err)
			}
			if status != 202 || replay.JobID != accepted.JobID {
				t.Fatalf("replay: %d %s", status, data)
			}
			status, data = call("GET", "/api/jobs/requests/"+requestID, "")
			var view JobView
			if err := json.Unmarshal([]byte(data), &view); err != nil {
				t.Fatal(err)
			}
			if status != 200 || view.Status != "processing" || view.JobID != accepted.JobID || !strings.Contains(view.Error, "outcome is unknown") || len(view.Generations) != 0 {
				t.Fatalf("pending recovery: %d %s", status, data)
			}
			pending, found, err := persistentPending(db).get(context.Background(), accepted.JobID, owner)
			if err != nil || !found || pending.Status != "uncertain" {
				t.Fatal("unknown outcome not durable")
			}
			if generates.Load() != 1 || quotes.Load() != 1 {
				t.Fatal("restart replay requoted or redispatched")
			}
			completed.Store(true)
			status, data = call("GET", "/api/jobs/requests/"+requestID, "")
			if err := json.Unmarshal([]byte(data), &view); err != nil {
				t.Fatal(err)
			}
			if status != 200 || view.Status != "completed" || view.GridJobID != "00000000-0000-4000-8000-000000000456" || len(view.Generations) != 1 || view.Generations[0].URL != "https://images.example/recovered.webp" {
				t.Fatalf("completed recovery: %d %s", status, data)
			}
			job, found, err := persistentPending(db).get(context.Background(), accepted.JobID, owner)
			if err != nil || !found || job.Status != "completed" {
				t.Fatalf("result not durable: %v", err)
			}
			if status, _ := call("POST", "/api/jobs", body); status != 202 {
				t.Fatal("completed replay failed")
			}
			if generates.Load() != 1 || quotes.Load() != 1 {
				t.Fatal("completed replay redispatched")
			}
		})
	}
}
