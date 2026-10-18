// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
package app

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
)

func quoteRequest(body string) *http.Request {
	r := requestWithClaims(&auth.Claims{GoogleID: "fixture-google", GridAccountID: brokerOwner})
	r.Body = io.NopCloser(strings.NewReader(body))
	return r
}

func TestDurableVideoQuoteDefaultOffAndAuthenticated(t *testing.T) {
	app := &App{}
	w := httptest.NewRecorder()
	app.Router().ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/videos/quote", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatal("anonymous video quote accepted")
	}
	w = httptest.NewRecorder()
	app.handleDurableVideoQuote(w, quoteRequest(`{"model":"LTX-2.5 Distilled BF16","frames":81,"fps":24}`))
	if w.Code != http.StatusServiceUnavailable || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("disabled quote was exposed or cacheable")
	}
}

func TestDurableVideoQuoteRejectsBeforeUpstream(t *testing.T) {
	var calls atomic.Int32
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(500) }))
	defer core.Close()
	app := &App{cfg: brokerPilotConfig("fixture-service"), client: aipg.NewClient(core.URL, "fixture")}
	for _, body := range []string{
		`{}`, `null`, `[]`,
		`{"model":"LTX-2.3","frames":81,"fps":24}`,
		`{"model":"LTX-2.5 Distilled BF16","frames":0,"fps":24}`,
		`{"model":"LTX-2.5 Distilled BF16","frames":80,"fps":24}`,
		`{"model":"LTX-2.5 Distilled BF16","frames":633,"fps":24}`,
		`{"model":"LTX-2.5 Distilled NVFP4","frames":345,"fps":24}`,
		`{"model":"LTX-2.5 Distilled BF16","frames":81,"fps":30}`,
		`{"model":"LTX-2.5 Distilled BF16","frames":81.5,"fps":24}`,
		`{"model":"LTX-2.5 Distilled BF16","frames":81,"fps":24,"reference_video":"private"}`,
		`{"model":"LTX-2.5 Distilled BF16","frames":81,"fps":24} {}`,
		`{"model":"` + strings.Repeat("x", 5000) + `","frames":81,"fps":24}`,
	} {
		w := httptest.NewRecorder()
		app.handleDurableVideoQuote(w, quoteRequest(body))
		if w.Code != 400 {
			t.Fatalf("invalid quote returned %d", w.Code)
		}
	}
	if calls.Load() != 0 {
		t.Fatal("invalid quote contacted Core")
	}
}

func TestPublicVideoQuoteRejectsNVFP4BeforeUpstream(t *testing.T) {
	var calls atomic.Int32
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(500) }))
	defer core.Close()
	cfg := brokerPilotConfig("fixture-service")
	cfg.DurableVideoAdmissionMode = "open"
	cfg.DurableVideoPilotAccounts = nil
	cfg.DurableVideoPilotUntil = ""
	app := &App{cfg: cfg, client: aipg.NewClient(core.URL, "fixture")}
	w := httptest.NewRecorder()
	app.handleDurableVideoQuote(w, quoteRequest(`{"model":"LTX-2.5 Distilled NVFP4","frames":81,"fps":24}`))
	if w.Code != 403 || calls.Load() != 0 {
		t.Fatal("public NVFP4 quote reached upstream")
	}
}

func TestPublicVideoQuoteStillRequiresPaidPriceAndAuthentication(t *testing.T) {
	for _, failure := range []string{"preview", "unpriced", "zero"} {
		t.Run(failure, func(t *testing.T) {
			core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/auth/service/exchange":
					writeJSON(w, 200, map[string]string{"access_token": "fixture-user", "account_id": brokerOwner})
				case "/account/ownership":
					writeJSON(w, 200, map[string]any{"account_id": brokerOwner, "account_aliases": []string{}})
				case "/account/credits/quote":
					q := validBrokerQuote()
					frames := 81
					q.Estimate.Frames = &frames
					switch failure {
					case "preview":
						q.ChargingEnabled = false
					case "unpriced":
						q.Estimate.Priced = false
					case "zero":
						zero := int64(0)
						q.Estimate.CostMicro = &zero
					}
					writeJSON(w, 200, q)
				default:
					t.Fatal("public quote unexpectedly reached generation")
				}
			}))
			defer core.Close()
			cfg := brokerPilotConfig("fixture-service")
			cfg.DurableVideoAdmissionMode = "open"
			cfg.DurableVideoPilotAccounts = nil
			cfg.DurableVideoPilotUntil = ""
			app := &App{cfg: cfg, client: aipg.NewClient(core.URL, "fixture")}
			w := httptest.NewRecorder()
			app.Router().ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/videos/quote", nil))
			if w.Code != http.StatusUnauthorized {
				t.Fatal("public mode bypassed authentication")
			}
			w = httptest.NewRecorder()
			app.handleDurableVideoQuote(w, quoteRequest(`{"model":"LTX-2.5 Distilled BF16","frames":81,"fps":24}`))
			if w.Code != http.StatusServiceUnavailable {
				t.Fatal("public mode accepted preview, unpriced or zero-cost work")
			}
		})
	}
}

func TestDurableVideoQuoteBoundToAccountModelAndFrames(t *testing.T) {
	for _, timing := range []struct {
		model  string
		frames int
	}{{durableVideoModel, 81}, {durableVideoModel, 481}, {durableVideoModel, 625}, {"LTX-2.5 Distilled NVFP4", 81}} {
		model, requestedFrames := timing.model, timing.frames
		for _, failure := range []string{"", "owner", "model", "frames", "fps", "modality", "unpriced", "preview", "zero", "missing-cost", "exchange"} {
			t.Run(model+"/"+failure, func(t *testing.T) {
				var quotes, unexpected atomic.Int32
				core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.Header.Get("apikey") != "fixture-service" {
						t.Error("missing server credential")
					}
					if r.URL.Path == "/auth/service/exchange" {
						owner := brokerOwner
						if failure == "exchange" {
							owner = brokerCoreID
						}
						writeJSON(w, 200, map[string]string{"access_token": "fixture-user", "account_id": owner})
						return
					}
					if r.Header.Get("X-Grid-User-Token") != "fixture-user" {
						t.Error("missing delegated identity")
					}
					switch r.URL.Path {
					case "/account/ownership":
						writeJSON(w, 200, map[string]any{"account_id": brokerOwner, "account_aliases": []string{}})
					case "/account/credits/quote":
						quotes.Add(1)
						var input aipg.CreditQuoteRequest
						if json.NewDecoder(r.Body).Decode(&input) != nil || input.Model != model || input.Frames != requestedFrames || input.N != 1 || input.Seconds != 0 {
							t.Error("quote timing or model changed")
						}
						q := validBrokerQuote()
						q.Estimate.Model = model
						frames := requestedFrames
						q.Estimate.Frames = &frames
						q.Estimate.BalanceSufficient = false
						switch failure {
						case "owner":
							q.AccountID = brokerCoreID
						case "model":
							q.Estimate.Model = "LTX-2.3"
						case "frames":
							frames = 80
						case "fps":
							q.Estimate.FPS = nil
						case "modality":
							q.Estimate.Modality = "image"
						case "unpriced":
							q.Estimate.Priced = false
						case "preview":
							q.ChargingEnabled = false
						case "zero":
							v := int64(0)
							q.Estimate.CostMicro = &v
						case "missing-cost":
							q.Estimate.CostMicro = nil
						}
						writeJSON(w, 200, q)
					default:
						unexpected.Add(1)
						w.WriteHeader(500)
					}
				}))
				defer core.Close()
				app := &App{cfg: brokerPilotConfig("fixture-service"), client: aipg.NewClient(core.URL, "fixture")}
				body, _ := json.Marshal(durableVideoQuoteRequest{Model: model, Frames: requestedFrames, FPS: 24})
				w := httptest.NewRecorder()
				app.handleDurableVideoQuote(w, quoteRequest(string(body)))
				want := 502
				if failure == "" {
					want = 200
				}
				if failure == "unpriced" || failure == "preview" || failure == "zero" || failure == "missing-cost" || failure == "exchange" {
					want = 503
				}
				if w.Code != want || unexpected.Load() != 0 {
					t.Fatalf("quote status %d, want %d; unexpected calls %d", w.Code, want, unexpected.Load())
				}
				if failure == "exchange" && quotes.Load() != 0 {
					t.Fatal("foreign identity reached quote")
				}
				if failure == "" {
					var q aipg.CreditQuote
					if json.Unmarshal(w.Body.Bytes(), &q) != nil || q.Estimate.BalanceSufficient || *q.Estimate.Frames != requestedFrames {
						t.Fatal("insufficient balance estimate hidden or changed")
					}
				}
			})
		}
	}
}
