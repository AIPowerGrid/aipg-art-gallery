// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/config"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/gallery"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/models"
	"github.com/go-chi/chi/v5"
	"github.com/lib/pq"
)

func recoveryDatabase(t *testing.T) *sql.DB {
	t.Helper()
	raw := os.Getenv("GALLERY_TEST_POSTGRES_URL")
	if raw == "" {
		t.Skip("set GALLERY_TEST_POSTGRES_URL to a disposable PostgreSQL database")
	}
	admin, err := sql.Open("postgres", raw)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = admin.Close() })
	schema := "gallery_recovery_" + newJobID()
	if _, err := admin.Exec("CREATE SCHEMA " + pq.QuoteIdentifier(schema)); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := admin.Exec("DROP SCHEMA " + pq.QuoteIdentifier(schema) + " CASCADE"); err != nil {
			t.Error(err)
		}
	})
	parsed, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	store, err := gallery.NewPostgresStore(parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.DB().Close() })
	return store.DB()
}

func persistentPending(db *sql.DB) *pendingStore {
	s := newPendingStore(time.Minute)
	s.journal = gallery.NewPendingJobStore(db)
	return s
}

func TestJobRecoveryRoutesRequireSession(t *testing.T) {
	app := &App{}
	for _, path := range []string{"/api/jobs/saved-job", "/api/jobs/requests/known-before-submission"} {
		response := httptest.NewRecorder()
		app.Router().ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("anonymous %s: %d", path, response.Code)
		}
	}
}

func TestPendingPostgresConcurrentRequestsAndTerminalMonotonicity(t *testing.T) {
	db := recoveryDatabase(t)
	ctx := context.Background()
	stores := []*pendingStore{persistentPending(db), persistentPending(db)}
	var dispatched atomic.Int32
	ids := make(chan string, 12)
	var wg sync.WaitGroup
	for i := range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			id, created, err := stores[i%2].create(ctx, "same-request-id", "digest", "image", "owner", 1)
			if err != nil {
				t.Error(err)
				return
			}
			if created {
				dispatched.Add(1)
			}
			ids <- id
		}()
	}
	wg.Wait()
	close(ids)
	id := ""
	for got := range ids {
		if id != "" && got != id {
			t.Fatal("duplicate request created another job")
		}
		id = got
	}
	if dispatched.Load() != 1 {
		t.Fatalf("dispatch owners = %d", dispatched.Load())
	}
	reloaded := persistentPending(db)
	if reloaded.isRunning(id) {
		t.Fatal("restart pretended to own a running goroutine")
	}
	job, found, err := reloaded.get(ctx, id, "owner")
	if err != nil || !found {
		t.Fatalf("reload: %v found=%v", err, found)
	}
	job.Status, job.Items = "completed", []aipg.GeneratedItem{{URL: "https://images.example/recovered.webp"}}
	if err := reloaded.update(ctx, id, job); err != nil {
		t.Fatal(err)
	}
	job.Status, job.Items = "uncertain", nil
	if err := stores[0].update(ctx, id, job); err != nil {
		t.Fatal(err)
	}
	winner, _, err := reloaded.get(ctx, id, "owner")
	if err != nil || winner.Status != "completed" || len(winner.Items) != 1 {
		t.Fatal("late error overwrote completion")
	}
	if _, found, err := reloaded.get(ctx, id, "stranger"); err != nil || found {
		t.Fatal("foreign owner read job")
	}
	if _, _, err := reloaded.create(ctx, "same-request-id", "changed", "image", "owner", 1); err != errRequestConflict {
		t.Fatalf("conflicting replay: %v", err)
	}
	if other, fresh, err := reloaded.create(ctx, "same-request-id", "changed", "image", "stranger", 1); err != nil || !fresh || other == id {
		t.Fatalf("request IDs are not account-scoped: %v", err)
	}
	var rls bool
	if err := db.QueryRow(`SELECT relrowsecurity FROM pg_class WHERE oid='gallery_pending_jobs'::regclass`).Scan(&rls); err != nil || !rls {
		t.Fatalf("private job table must have RLS enabled: %v", err)
	}
}

func TestPendingPostgresRestartRecoversWithoutAnotherGeneration(t *testing.T) {
	db := recoveryDatabase(t)
	var generates, quotes, recoveries atomic.Int32
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("apikey") != "service-key" {
			t.Error("service key missing")
		}
		if r.URL.Path == "/auth/service/exchange" {
			writeJSON(w, 200, map[string]string{"access_token": "delegated-token", "account_id": "owner"})
			return
		}
		if r.Header.Get("X-Grid-User-Token") != "delegated-token" {
			t.Error("delegation missing")
		}
		switch r.URL.Path {
		case "/account/credits/quote":
			quotes.Add(1)
			writeJSON(w, 200, map[string]any{"account_id": "owner", "charging_enabled": true,
				"estimate": map[string]any{"priced": true, "balance_sufficient": true}})
		case "/images/generations":
			generates.Add(1)
			http.Error(w, "lost response", 504)
		case "/media/results":
			recoveries.Add(1)
			if r.Method != "GET" || r.URL.Query().Get("client_ref") == "" {
				t.Error("invalid recovery request")
			}
			writeJSON(w, 200, map[string]any{"job_id": "00000000-0000-4000-8000-000000000001", "state": "completed",
				"result": map[string]any{"model": "Z-Image Turbo", "worker": "image-test", "gen_time": 2.0,
					"media": []map[string]any{{"url": "https://images.example/recovered.webp", "seed": 10}}}})
		default:
			t.Errorf("unexpected Core route %s", r.URL.Path)
			http.Error(w, "unexpected", 500)
		}
	}))
	defer core.Close()
	catalog, err := models.LoadCatalog("../../config/model_presets.json")
	if err != nil {
		t.Fatal(err)
	}
	app := &App{cfg: config.Config{DefaultAPIKey: "service-key"}, client: aipg.NewClient(core.URL, "test"),
		catalog: catalog, pending: persistentPending(db)}
	submit := func(prompt string) *httptest.ResponseRecorder {
		request := requestWithClaims(&auth.Claims{GoogleID: "test-google", GridAccountID: "owner"})
		request.Body = io.NopCloser(strings.NewReader(fmt.Sprintf(
			`{"requestId":"one-request-before-post","modelId":"z-image-turbo","prompt":%q,"params":{"n":1}}`, prompt)))
		response := httptest.NewRecorder()
		app.handleCreateJob(response, request)
		return response
	}
	response := submit("a test image")
	if response.Code != 202 {
		t.Fatalf("create: %d %s", response.Code, response.Body.String())
	}
	var accepted struct {
		JobID string `json:"jobId"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &accepted); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for app.pending.isRunning(accepted.JobID) && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if app.pending.isRunning(accepted.JobID) {
		t.Fatal("generation goroutine did not finish")
	}
	// A new process has no in-memory job, but can replay the existing receipt.
	app.pending = persistentPending(db)
	// A retired model must not prevent reading an already accepted request.
	app.catalog = models.Catalog{}
	replay := submit("a test image")
	if replay.Code != 202 || !strings.Contains(replay.Body.String(), accepted.JobID) {
		t.Fatal("lost 202 replay failed")
	}
	if conflict := submit("changed prompt"); conflict.Code != 409 {
		t.Fatalf("conflict = %d", conflict.Code)
	}
	if generates.Load() != 1 || quotes.Load() != 1 {
		t.Fatal("replay requoted or dispatched another paid job")
	}
	status := func(owner string) *httptest.ResponseRecorder {
		request := requestWithClaims(&auth.Claims{GoogleID: "test-google", GridAccountID: owner})
		route := chi.NewRouteContext()
		route.URLParams.Add("id", accepted.JobID)
		request = request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, route))
		response := httptest.NewRecorder()
		app.handleJobStatus(response, request)
		return response
	}
	if got := status("stranger"); got.Code != 404 || recoveries.Load() != 0 {
		t.Fatal("foreign owner reached Core recovery")
	}
	byRequest := func(owner, requestID string) *httptest.ResponseRecorder {
		request := requestWithClaims(&auth.Claims{GoogleID: "test-google", GridAccountID: owner})
		route := chi.NewRouteContext()
		route.URLParams.Add("requestID", requestID)
		request = request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, route))
		response := httptest.NewRecorder()
		app.handleJobRequestStatus(response, request)
		return response
	}
	if got := byRequest("stranger", "one-request-before-post"); got.Code != 404 || recoveries.Load() != 0 {
		t.Fatal("request correlation bypassed owner isolation")
	}
	if got := byRequest("owner", "unknown-request-before-post"); got.Code != 404 || recoveries.Load() != 0 {
		t.Fatal("unknown request dispatched work")
	}
	if got := byRequest("owner", "short"); got.Code != 400 {
		t.Fatal("invalid request ID accepted")
	}
	if got := byRequest("owner", "one-request-before-post"); got.Code != 200 || !strings.Contains(got.Body.String(), "recovered.webp") || !strings.Contains(got.Body.String(), accepted.JobID) {
		t.Fatalf("lost 202 read-only recovery failed: %d %s", got.Code, got.Body.String())
	}
	got := status("owner")
	if got.Code != 200 || !strings.Contains(got.Body.String(), "recovered.webp") {
		t.Fatalf("recover: %d %s", got.Code, got.Body.String())
	}
	if got.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("private response may be cached")
	}
	app.pending = persistentPending(db)
	if got := status("owner"); got.Code != 200 || !strings.Contains(got.Body.String(), "recovered.webp") {
		t.Fatal("recovered output was not durable")
	}
	if recoveries.Load() != 1 || generates.Load() != 1 {
		t.Fatal("completed reload did remote work")
	}
}

func TestPaidGenerationRequiresWorkingJournal(t *testing.T) {
	for _, brokenDB := range []bool{false, true} {
		t.Run(fmt.Sprintf("closed_database_%v", brokenDB), func(t *testing.T) {
			var generations atomic.Int32
			core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/auth/service/exchange":
					writeJSON(w, 200, map[string]string{"access_token": "test-delegation", "account_id": "owner"})
				case "/account/credits/quote":
					writeJSON(w, 200, map[string]any{"account_id": "owner", "charging_enabled": true,
						"estimate": map[string]any{"priced": true, "balance_sufficient": true}})
				default:
					generations.Add(1)
					http.Error(w, "must not dispatch", 500)
				}
			}))
			defer core.Close()
			catalog, err := models.LoadCatalog("../../config/model_presets.json")
			if err != nil {
				t.Fatal(err)
			}
			pending := newPendingStore(time.Minute)
			if brokenDB {
				db, err := sql.Open("postgres", "")
				if err != nil {
					t.Fatal(err)
				}
				if err := db.Close(); err != nil {
					t.Fatal(err)
				}
				pending.journal = gallery.NewPendingJobStore(db)
			}
			app := &App{cfg: config.Config{DefaultAPIKey: "test-service"}, client: aipg.NewClient(core.URL, "test"), catalog: catalog, pending: pending}
			request := requestWithClaims(&auth.Claims{GoogleID: "test-google", GridAccountID: "owner"})
			request.Body = io.NopCloser(strings.NewReader(`{"requestId":"known-before-submission","modelId":"z-image-turbo","prompt":"test","params":{"n":1}}`))
			response := httptest.NewRecorder()
			app.handleCreateJob(response, request)
			if response.Code != 503 || generations.Load() != 0 || len(pending.running) != 0 {
				t.Fatalf("storage outage dispatched: status=%d generations=%d", response.Code, generations.Load())
			}
		})
	}
}
