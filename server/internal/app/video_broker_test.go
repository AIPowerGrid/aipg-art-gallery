// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/config"
	"github.com/google/uuid"
)

const brokerOwner = "00000000-0000-4000-8000-000000000123"
const brokerCoreID = "00000000-0000-4000-8000-000000000456"

func brokerPilotConfig(key string) config.Config {
	return config.Config{DefaultAPIKey: key, DurableVideoEnabled: true,
		DurableVideoPilotAccounts: []string{brokerOwner},
		DurableVideoPilotUntil:    time.Now().Add(time.Hour).UTC().Format(time.RFC3339)}
}

func TestDurableVideoExpiredPilotPreservesReplayAndRecovery(t *testing.T) {
	f := newBrokerFixture(t, false)
	requestID := uuid.NewString()
	code, id := postBrokerVideo(t, f.app, requestID, brokerVideoRequest())
	if code != 202 {
		t.Fatal("initial pilot submission failed")
	}
	deadline := time.Now().Add(3 * time.Second)
	for f.posts.Load() != 1 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if f.posts.Load() != 1 {
		t.Fatal("original POST not observed")
	}
	f.app.cfg.DurableVideoPilotUntil = time.Now().Add(-time.Second).UTC().Format(time.RFC3339)
	code, replay := postBrokerVideo(t, f.app, requestID, brokerVideoRequest())
	if code != 202 || replay != id {
		t.Fatal("expired pilot changed the existing request")
	}
	code, _ = postBrokerVideo(t, f.app, uuid.NewString(), brokerVideoRequest())
	if code != 403 || f.posts.Load() != 1 || f.quotes.Load() != 1 {
		t.Fatal("expired pilot authorized fresh pricing or dispatch")
	}
	f.state.Store(2)
	w := httptest.NewRecorder()
	f.app.serveJobStatus(w, requestWithClaims(&auth.Claims{GoogleID: "fixture-google", GridAccountID: brokerOwner}), id)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"completed"`) || f.posts.Load() != 1 {
		t.Fatal("expired pilot broke GET recovery")
	}
}

func brokerVideoRequest() aipg.VideoJobRequest {
	return aipg.VideoJobRequest{Prompt: "synthetic broker fixture", Model: durableVideoModel,
		N: 1, Size: "512x320", Frames: 33, FPS: 24, Audio: true, MaxCostMicroUSD: 100000}
}

func TestDurableVideoOmittedFieldsKeepCoreDefaults(t *testing.T) {
	request := newDurableVideoRequest()
	if err := json.Unmarshal([]byte(`{"video":{"prompt":"synthetic broker fixture","size":"512x320","frames":33,"max_cost_micro_usd":100000}}`), &request); err != nil {
		t.Fatal(err)
	}
	digest, err := aipg.VideoIntentHash(request.Video)
	expected, expectedErr := aipg.VideoIntentHash(brokerVideoRequest())
	if err != nil || expectedErr != nil || digest != expected || !request.Video.Audio {
		t.Fatal("omitted model/count/fps/audio changed native Core defaults")
	}
	if err := json.Unmarshal([]byte(`{"video":{"audio":false}}`), &request); err != nil || request.Video.Audio {
		t.Fatal("explicit disabled audio was overwritten by a default")
	}
}

func TestDurableVideoViewKeepsUnknownOutcomeExplicit(t *testing.T) {
	job := pendingJob{Status: "uncertain", Kind: "video", Video: &pendingVideo{}, Err: "Video outcome is unknown"}
	if view := buildJobView("fixture", job); view.Status != "uncertain" || view.Faulted || view.Finished != 0 {
		t.Fatal("unknown video outcome was presented as ordinary processing or final failure")
	}
	job.Video = nil
	if view := buildJobView("fixture", job); view.Status != "processing" {
		t.Fatal("legacy recovery view changed")
	}
}

func brokerReceipt(t *testing.T, state string) *aipg.VideoJob {
	t.Helper()
	digest, err := aipg.VideoIntentHash(brokerVideoRequest())
	if err != nil {
		t.Fatal(err)
	}
	job := &aipg.VideoJob{Schema: "aipg.video-job.v1", JobID: brokerCoreID, RequestHash: digest,
		Model: durableVideoModel, State: state, ReservedMicro: 27500, MaxCostMicro: 100000}
	if state == "completed" {
		charge := int64(27500)
		job.ActualMicro = &charge
		job.Result = &aipg.VideoJobResult{Model: durableVideoModel, Worker: "fixture-worker", GenTime: 1,
			RecipeRoot: "0x" + strings.Repeat("a", 64), Media: []aipg.VideoJobMedia{{
				URL: "https://media.example/synthetic.mp4", Key: "output/synthetic.mp4", SHA256: strings.Repeat("b", 64), Seed: 42}}}
	}
	return job
}

func validBrokerQuote() aipg.CreditQuote {
	frames, fps, cost := 33, 24, int64(27500)
	return aipg.CreditQuote{AccountID: brokerOwner, ChargingEnabled: true, ChargingMode: "on",
		Estimate: aipg.CreditEstimate{Model: durableVideoModel, Modality: "video", Priced: true,
			Frames: &frames, FPS: &fps, CostMicro: &cost, BalanceSufficient: true}}
}

func TestDurableVideoDefaultsAndAuthentication(t *testing.T) {
	app := &App{}
	for _, path := range []string{"/api/videos/jobs", "/api/videos/jobs/known", "/api/videos/requests/known"} {
		method := http.MethodGet
		if path == "/api/videos/jobs" {
			method = http.MethodPost
		}
		response := httptest.NewRecorder()
		app.Router().ServeHTTP(response, httptest.NewRequest(method, path, nil))
		if response.Code != 401 {
			t.Fatalf("anonymous route %s returned %d", path, response.Code)
		}
	}
	response := httptest.NewRecorder()
	app.handleCreateDurableVideo(response, requestWithClaims(&auth.Claims{GridAccountID: brokerOwner}))
	if response.Code != 503 {
		t.Fatal("default-off broker attempted submission")
	}
	if _, err := New(config.Config{DurableVideoEnabled: true}); err == nil {
		t.Fatal("enabled broker started without durable storage/bridge")
	}
}

func TestDurableVideoQuoteRequiresBoundPaidFrames(t *testing.T) {
	for name, mutate := range map[string]func(*aipg.CreditQuote){
		"owner":    func(q *aipg.CreditQuote) { q.AccountID = "other" },
		"model":    func(q *aipg.CreditQuote) { q.Estimate.Model = "other" },
		"frames":   func(q *aipg.CreditQuote) { v := 25; q.Estimate.Frames = &v },
		"fps":      func(q *aipg.CreditQuote) { q.Estimate.FPS = nil },
		"preview":  func(q *aipg.CreditQuote) { q.ChargingEnabled = false },
		"unpriced": func(q *aipg.CreditQuote) { q.Estimate.Priced = false },
		"free":     func(q *aipg.CreditQuote) { v := int64(0); q.Estimate.CostMicro = &v },
		"ceiling":  func(q *aipg.CreditQuote) { v := int64(100001); q.Estimate.CostMicro = &v },
		"balance":  func(q *aipg.CreditQuote) { q.Estimate.BalanceSufficient = false },
	} {
		t.Run(name, func(t *testing.T) {
			quote := validBrokerQuote()
			mutate(&quote)
			if _, err := validateDurableVideoQuote(quote, brokerVideoRequest(), brokerOwner); err == nil {
				t.Fatal("unbound or unpaid quote accepted")
			}
		})
	}
}

type brokerFixture struct {
	db        *sql.DB
	app       *App
	posts     atomic.Int32
	quotes    atomic.Int32
	gets      atomic.Int32
	state     atomic.Int32 // 0 missing, 1 queued, 2 completed.
	key       atomic.Value
	lostReply bool
}

func newBrokerFixture(t *testing.T, lostReply bool) *brokerFixture {
	t.Helper()
	db := recoveryDatabase(t)
	f := &brokerFixture{lostReply: lostReply, db: db}
	f.key.Store("")
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("apikey") != "fixture-service" {
			t.Error("missing service identity")
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
			f.quotes.Add(1)
			var quote aipg.CreditQuoteRequest
			if err := json.NewDecoder(r.Body).Decode(&quote); err != nil || quote.Frames != 33 || quote.Seconds != 0 {
				t.Error("quote lost exact-frame identity")
			}
			writeJSON(w, 200, validBrokerQuote())
		case "/videos/jobs":
			if r.Method == http.MethodPost {
				f.posts.Add(1)
				key := r.Header.Get("Idempotency-Key")
				var persisted int
				if err := db.QueryRow(`SELECT count(*) FROM gallery_pending_jobs WHERE payload->'Video'->>'Key'=$1`, key).Scan(&persisted); err != nil || persisted != 1 {
					t.Error("POST preceded its durable key/intent")
				}
				f.key.Store(key)
				if lostReply {
					conn, _, err := w.(http.Hijacker).Hijack()
					if err != nil {
						t.Error(err)
						return
					}
					if err := conn.Close(); err != nil {
						t.Error(err)
					}
					return
				}
				writeJSON(w, 202, brokerReceipt(t, "queued"))
				return
			}
			f.gets.Add(1)
			if r.Method != http.MethodGet || r.Header.Get("Idempotency-Key") != f.key.Load() {
				t.Error("recovery changed selector or method")
			}
			if body, err := io.ReadAll(r.Body); err != nil || len(body) != 0 {
				t.Error("recovery included source bytes")
			}
			switch f.state.Load() {
			case 0:
				writeJSON(w, 404, map[string]string{"detail": "unknown"})
			case 1:
				writeJSON(w, 200, brokerReceipt(t, "queued"))
			case 2:
				writeJSON(w, 200, brokerReceipt(t, "completed"))
			}
		default:
			t.Errorf("unexpected Core path %s", r.URL.Path)
			writeJSON(w, 500, map[string]string{"detail": "unexpected"})
		}
	}))
	t.Cleanup(core.Close)
	f.app = &App{cfg: brokerPilotConfig("fixture-service"),
		client: aipg.NewClient(core.URL, "fixture"), pending: persistentPending(db)}
	return f
}

func postBrokerVideo(t *testing.T, app *App, requestID string, video aipg.VideoJobRequest) (int, string) {
	t.Helper()
	body, err := json.Marshal(durableVideoRequest{RequestID: requestID, Video: video})
	if err != nil {
		t.Fatal(err)
	}
	request := requestWithClaims(&auth.Claims{GoogleID: "fixture-google", GridAccountID: brokerOwner})
	request.Body = io.NopCloser(strings.NewReader(string(body)))
	response := httptest.NewRecorder()
	app.handleCreateDurableVideo(response, request)
	var reply struct {
		JobID string `json:"jobId"`
	}
	if response.Code == 202 {
		if err := json.Unmarshal(response.Body.Bytes(), &reply); err != nil {
			t.Fatal(err)
		}
	}
	return response.Code, reply.JobID
}

func waitBrokerDispatch(t *testing.T, app *App, id string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if !app.pending.isRunning(id) {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("broker POST did not finish")
}

func TestDurableVideoLostReplyRestartAndDisabledRecovery(t *testing.T) {
	f := newBrokerFixture(t, true)
	requestID := uuid.NewString()
	status, id := postBrokerVideo(t, f.app, requestID, brokerVideoRequest())
	if status != 202 || id == "" {
		t.Fatal("submission did not journal")
	}
	waitBrokerDispatch(t, f.app, id)
	job, found, err := f.app.pending.get(context.Background(), id, brokerOwner)
	if err != nil || !found || job.Status != "uncertain" || job.Video == nil || job.Video.Receipt != nil {
		t.Fatal("lost reply not retained as unknown")
	}
	f.app.pending = persistentPending(f.db)
	if status, replayID := postBrokerVideo(t, f.app, requestID, brokerVideoRequest()); status != 202 || replayID != id {
		t.Fatal("restart changed the request identity")
	}
	f.app.cfg.DurableVideoEnabled = false
	request := requestWithClaims(&auth.Claims{GoogleID: "fixture-google", GridAccountID: brokerOwner})
	response := httptest.NewRecorder()
	f.app.serveJobStatus(response, request, id)
	if response.Code != 200 || !strings.Contains(response.Body.String(), "outcome is unknown") {
		t.Fatal("missing receipt became failure/refund instead of unknown")
	}
	f.state.Store(2)
	response = httptest.NewRecorder()
	f.app.serveJobStatus(response, request, id)
	var view JobView
	if err := json.Unmarshal(response.Body.Bytes(), &view); err != nil || response.Code != 200 ||
		view.Status != "completed" || view.GridJobID != brokerCoreID || view.VideoReceipt == nil || len(view.Generations) != 1 {
		t.Fatal("disabled admission prevented owner-bound result recovery")
	}
	if f.posts.Load() != 1 || f.quotes.Load() != 1 || f.gets.Load() != 2 {
		t.Fatalf("unexpected POST/quote/GET counts: %d/%d/%d", f.posts.Load(), f.quotes.Load(), f.gets.Load())
	}
	row, _, err := f.app.pending.journal.Get(context.Background(), id, brokerOwner)
	if err != nil || strings.Contains(string(row.Payload), brokerVideoRequest().Prompt) || strings.Contains(string(row.Payload), "fixture-user") {
		t.Fatal("journal retained source request or credential")
	}
	if _, found, err := f.app.pending.get(context.Background(), id, "stranger"); err != nil || found {
		t.Fatal("foreign account read durable video")
	}
}

func TestDurableVideoConcurrentSubmissionAndReceiptMonotonicity(t *testing.T) {
	f := newBrokerFixture(t, false)
	requestID := uuid.NewString()
	ids := make(chan string, 12)
	var workers sync.WaitGroup
	for range 12 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			status, id := postBrokerVideo(t, f.app, requestID, brokerVideoRequest())
			if status != 202 {
				t.Errorf("concurrent submit status %d", status)
			}
			ids <- id
		}()
	}
	workers.Wait()
	close(ids)
	id := ""
	for current := range ids {
		if id != "" && current != id {
			t.Fatal("duplicate request created a second journal row")
		}
		id = current
	}
	waitBrokerDispatch(t, f.app, id)
	if f.posts.Load() != 1 {
		t.Fatal("concurrent requests sent more than one POST")
	}
	changed := brokerVideoRequest()
	changed.Frames = 25
	if status, _ := postBrokerVideo(t, f.app, requestID, changed); status != 409 {
		t.Fatal("changed same-key intent did not conflict")
	}
	queued := brokerReceipt(t, "queued")
	queued.ReservedMicro++
	if err := f.app.pending.observeVideo(context.Background(), id, brokerOwner, queued, nil); err == nil {
		t.Fatal("changed held amount accepted")
	}
	completed := brokerReceipt(t, "completed")
	for range 12 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			store := persistentPending(f.db)
			if err := store.observeVideo(context.Background(), id, brokerOwner, completed, nil); err != nil {
				t.Error(err)
			}
		}()
	}
	workers.Wait()
	if err := f.app.pending.observeVideo(context.Background(), id, brokerOwner, brokerReceipt(t, "queued"), nil); err == nil {
		t.Fatal("completed receipt regressed to queued")
	}
	job, _, err := f.app.pending.get(context.Background(), id, brokerOwner)
	if err != nil || job.Status != "completed" || job.Video.Receipt.State != "completed" {
		t.Fatal("terminal result was overwritten")
	}
}

func TestDurableVideoHTTPRejectionPreservesLaterRecovery(t *testing.T) {
	f := newBrokerFixture(t, false)
	digest, err := aipg.VideoIntentHash(brokerVideoRequest())
	if err != nil {
		t.Fatal(err)
	}
	for _, status := range []int{401, 402, 409, 422, 429} {
		id, created, err := f.app.pending.createWithVideo(context.Background(), uuid.NewString(), digest, "video", brokerOwner, 1,
			&pendingVideo{Key: uuid.NewString(), Model: durableVideoModel, MaxCost: 100000})
		if err != nil || !created {
			t.Fatal("fixture intent not saved")
		}
		f.app.pending.finish(id)
		if err := f.app.pending.observeVideo(context.Background(), id, brokerOwner, nil, &aipg.VideoJobHTTPError{Status: status}); err != nil {
			t.Fatal(err)
		}
		job, _, err := f.app.pending.get(context.Background(), id, brokerOwner)
		if err != nil || job.Status != "uncertain" {
			t.Fatalf("HTTP %d closed recovery without a receipt", status)
		}
		if err := f.app.pending.observeVideo(context.Background(), id, brokerOwner, brokerReceipt(t, "completed"), nil); err != nil {
			t.Fatalf("HTTP %d blocked a later committed receipt: %v", status, err)
		}
	}
	if f.posts.Load() != 0 {
		t.Fatal("receipt observation submitted generation")
	}
}

func TestDurableVideoClosedReceiptDoesNotClaimRefund(t *testing.T) {
	f := newBrokerFixture(t, false)
	status, id := postBrokerVideo(t, f.app, uuid.NewString(), brokerVideoRequest())
	if status != 202 {
		t.Fatal("fixture submit failed")
	}
	waitBrokerDispatch(t, f.app, id)
	if err := f.app.pending.observeVideo(context.Background(), id, brokerOwner, brokerReceipt(t, "closed_without_result"), nil); err != nil {
		t.Fatal(err)
	}
	job, _, err := f.app.pending.get(context.Background(), id, brokerOwner)
	if err != nil || job.Status != "faulted" || strings.Contains(job.Err, "refunded") || job.Video.Receipt.ActualMicro != nil {
		t.Fatal("closed receipt was treated as a proven refund")
	}
	if err := f.app.pending.observeVideo(context.Background(), id, brokerOwner, brokerReceipt(t, "completed"), nil); err == nil {
		t.Fatal("closed job resurrected")
	}
}
