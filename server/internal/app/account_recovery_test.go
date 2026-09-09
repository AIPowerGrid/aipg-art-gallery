// SPDX-License-Identifier: AGPL-3.0-or-later
package app

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/config"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/gallery"
	"github.com/go-chi/chi/v5"
)

const mergedOwner = "11111111-1111-4111-8111-111111111111"
const retiredOwner = "22222222-2222-4222-8222-222222222222"
const foreignOwner = "33333333-3333-4333-8333-333333333333"

func TestRecoveryIdentityOutagePreservesPendingJob(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/service/exchange" {
			t.Errorf("identity outage reached another route: %s", r.URL.Path)
		}
		http.Error(w, "private upstream diagnostic", http.StatusServiceUnavailable)
	}))
	defer core.Close()
	pending := newPendingStore(time.Minute)
	id, _, err := pending.create(context.Background(), "existing-request-handle", "digest", "image", mergedOwner, 1)
	if err != nil {
		t.Fatal(err)
	}
	pending.finish(id)
	app := &App{cfg: config.Config{DefaultAPIKey: "service"}, client: aipg.NewClient(core.URL, "test"), pending: pending}
	w := httptest.NewRecorder()
	app.serveJobStatus(w, requestWithClaims(&auth.Claims{GridAccountID: mergedOwner, GoogleID: "user"}), id)
	if w.Code != http.StatusServiceUnavailable || strings.Contains(w.Body.String(), "private upstream") || len(w.Result().Cookies()) != 0 {
		t.Fatalf("outage changed authentication or leaked diagnostics: %d %s", w.Code, w.Body.String())
	}
	job, found, err := pending.get(context.Background(), id, mergedOwner)
	if err != nil || !found || job.Status != "processing" {
		t.Fatalf("outage destroyed recovery state: %+v %v", job, err)
	}
}

type ownershipGallery struct {
	gallery.GalleryStore
	owner   string
	aliases []string
	err     error
}

func (s *ownershipGallery) CanonicalizeOwner(owner string, aliases []string) error {
	s.owner, s.aliases = owner, aliases
	return s.err
}

func ownershipCore(t *testing.T, reads *atomic.Int32) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("apikey") != "service" {
			t.Error("service credential missing")
		}
		if r.URL.Path == "/auth/service/exchange" {
			var body struct {
				Subject string `json:"subject"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			id := mergedOwner
			if body.Subject == "google:foreign" {
				id = foreignOwner
			}
			writeJSON(w, 200, map[string]string{"account_id": id, "access_token": id})
			return
		}
		if r.URL.Path == "/account/ownership" {
			id := r.Header.Get("X-Grid-User-Token")
			aliases := []string{}
			if id == mergedOwner {
				aliases = []string{retiredOwner}
			}
			writeJSON(w, 200, map[string]any{"account_id": id, "account_aliases": aliases})
			return
		}
		if r.URL.Path == "/media/results" && r.Method == "GET" {
			reads.Add(1)
			writeJSON(w, 200, map[string]any{"job_id": "44444444-4444-4444-8444-444444444444", "state": "completed",
				"result": map[string]any{"model": "Z-Image Turbo", "media": []map[string]any{{"url": "https://images.example/original.webp"}}}})
			return
		}
		t.Errorf("unexpected route or redispatch %s %s", r.Method, r.URL.Path)
		http.Error(w, "unexpected", 500)
	}))
}

func TestMergedSessionRenewsOnlyWithCoreOwnership(t *testing.T) {
	t.Setenv("JWT_SECRET", newJobID()+newJobID())
	var reads atomic.Int32
	core := ownershipCore(t, &reads)
	defer core.Close()
	for _, mode := range []string{"google", "wallet", "foreign", "storage-error"} {
		t.Run(mode, func(t *testing.T) {
			store := &ownershipGallery{}
			app := &App{cfg: config.Config{DefaultAPIKey: "service"}, client: aipg.NewClient(core.URL, "test"), galleryStore: store}
			claims := &auth.Claims{GoogleID: "user", GridAccountID: retiredOwner}
			if mode == "wallet" {
				claims.GoogleID = ""
				claims.WalletAddress = "0x" + strings.Repeat("1", 40)
			}
			if mode == "foreign" {
				claims.GridAccountID = foreignOwner
			}
			if mode == "storage-error" {
				store.err = errors.New("unavailable")
			}
			response := httptest.NewRecorder()
			app.handleMe(response, requestWithClaims(claims))
			if mode == "foreign" || mode == "storage-error" {
				if response.Code != 503 || len(response.Result().Cookies()) != 0 {
					t.Fatal("unproved handoff issued a session")
				}
				if mode == "foreign" && store.owner != "" {
					t.Fatal("foreign identity reached ownership migration")
				}
				return
			}
			if response.Code != 200 {
				t.Fatalf("renewal: %d %s", response.Code, response.Body.String())
			}
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("session response cacheable")
			}
			cookies := response.Result().Cookies()
			if len(cookies) != 1 {
				t.Fatal("no renewed cookie")
			}
			updated, err := auth.VerifyJWTClaims(cookies[0].Value)
			if err != nil || updated.GridAccountID != mergedOwner {
				t.Fatalf("wrong cookie identity: %v", err)
			}
			if store.owner != mergedOwner || !slices.Contains(store.aliases, retiredOwner) {
				t.Fatal("proved alias not migrated")
			}
			if claims.GridAccountID != retiredOwner {
				t.Fatal("mutated the original request claims")
			}
			var body struct {
				AccountID string   `json:"accountId"`
				Aliases   []string `json:"accountAliases"`
			}
			_ = json.Unmarshal(response.Body.Bytes(), &body)
			if body.AccountID != mergedOwner || !slices.Contains(body.Aliases, retiredOwner) {
				t.Fatal("browser handoff absent")
			}
		})
	}
}

func TestMergedJournalRecoveryPreservesOriginalOwnerAndRejectsAmbiguity(t *testing.T) {
	db := recoveryDatabase(t)
	var reads atomic.Int32
	core := ownershipCore(t, &reads)
	defer core.Close()
	app := &App{cfg: config.Config{DefaultAPIKey: "service"}, client: aipg.NewClient(core.URL, "test"), pending: persistentPending(db)}
	id, _, err := app.pending.create(context.Background(), "original-request-handle", "digest", "image", retiredOwner, 1)
	if err != nil {
		t.Fatal(err)
	}
	app.pending = persistentPending(db)
	byRequest := func(owner, google string) *httptest.ResponseRecorder {
		r := requestWithClaims(&auth.Claims{GridAccountID: owner, GoogleID: google})
		route := chi.NewRouteContext()
		route.URLParams.Add("requestID", "original-request-handle")
		r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, route))
		w := httptest.NewRecorder()
		app.handleJobRequestStatus(w, r)
		return w
	}
	if got := byRequest(foreignOwner, "foreign"); got.Code != 404 || reads.Load() != 0 {
		t.Fatal("foreign account recovered another owner's result")
	}
	if got := byRequest(mergedOwner, "user"); got.Code != 200 || !strings.Contains(got.Body.String(), "original.webp") {
		t.Fatalf("merge recovery: %d %s", got.Code, got.Body.String())
	}
	if reads.Load() != 1 {
		t.Fatal("wrong remote recovery count")
	}
	app.pending = persistentPending(db)
	if got := byRequest(mergedOwner, "user"); got.Code != 200 || reads.Load() != 1 {
		t.Fatal("completed reload repeated remote work")
	}
	job, found, err := app.pending.get(context.Background(), id, retiredOwner)
	if err != nil || !found || job.Owner != retiredOwner || job.Grid == nil {
		t.Fatal("original journal owner or receipt was rewritten")
	}
	_, _, err = app.pending.create(context.Background(), "original-request-handle", "other", "image", mergedOwner, 1)
	if err != nil {
		t.Fatal(err)
	}
	if got := byRequest(mergedOwner, "user"); got.Code != 409 || reads.Load() != 1 {
		t.Fatal("ambiguous recovery picked a job")
	}
	r := requestWithClaims(&auth.Claims{GridAccountID: mergedOwner, GoogleID: "user"})
	w := httptest.NewRecorder()
	app.serveJobStatus(w, r, id)
	if w.Code != 200 || !strings.Contains(w.Body.String(), "original.webp") {
		t.Fatal("original job ID could not disambiguate recovery")
	}
}

func TestExplicitSubmissionReplayAfterMergeDoesNotDispatchAgain(t *testing.T) {
	db := recoveryDatabase(t)
	var reads atomic.Int32
	core := ownershipCore(t, &reads)
	defer core.Close()
	app := &App{cfg: config.Config{DefaultAPIKey: "service"}, client: aipg.NewClient(core.URL, "test"), pending: persistentPending(db)}
	var original CreateJobRequest
	if err := json.Unmarshal([]byte(`{"modelId":"z-image-turbo","prompt":"original","params":{"n":1}}`), &original); err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(original)
	id, _, err := app.pending.create(context.Background(), "original-request-handle", fmt.Sprintf("%x", sha256.Sum256(encoded)), "image", retiredOwner, 1)
	if err != nil {
		t.Fatal(err)
	}
	for _, prompt := range []string{"original", "different"} {
		r := requestWithClaims(&auth.Claims{GridAccountID: mergedOwner, GoogleID: "user"})
		r.Body = io.NopCloser(strings.NewReader(fmt.Sprintf(`{"requestId":"original-request-handle","modelId":"z-image-turbo","prompt":%q,"params":{"n":1}}`, prompt)))
		w := httptest.NewRecorder()
		app.handleCreateJob(w, r)
		if prompt == "original" {
			if w.Code != 202 || !strings.Contains(w.Body.String(), id) {
				t.Fatalf("replay: %d %s", w.Code, w.Body.String())
			}
		} else if w.Code != 409 {
			t.Fatalf("changed replay: %d", w.Code)
		}
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM gallery_pending_jobs`).Scan(&count); err != nil || count != 1 {
		t.Fatal("replay added a journal row")
	}
}
