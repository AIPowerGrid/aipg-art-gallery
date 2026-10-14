package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
)

func TestVideoCapabilitiesAndQuoteRespectOwnerDeadline(t *testing.T) {
	for _, mode := range []string{"allowed", "outside", "expired", "disabled", "upstream"} {
		t.Run(mode, func(t *testing.T) {
			var statsCalls, quoteCalls atomic.Int32
			owner := brokerOwner
			if mode == "outside" {
				owner = brokerCoreID
			}
			core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/auth/service/exchange":
					writeJSON(w, 200, map[string]string{"access_token": "fixture-user", "account_id": owner})
				case "/account/ownership":
					writeJSON(w, 200, map[string]any{"account_id": owner, "account_aliases": []string{}})
				case "/status/models":
					statsCalls.Add(1)
					if mode == "upstream" {
						http.Error(w, "private-operator-detail", 500)
						return
					}
					writeJSON(w, 200, []map[string]any{
						{"name": durableVideoModel, "type": "video", "count": 2},
						{"name": durableVideoModel, "type": "video", "count": 2},
						{"name": "LTX-2.5 Distilled NVFP4", "type": "video", "count": 0},
						{"name": "LTX-2.3", "type": "video", "count": 1},
					})
				case "/account/credits/quote":
					quoteCalls.Add(1)
					q := validBrokerQuote()
					frames := 81
					q.Estimate.Frames = &frames
					writeJSON(w, 200, q)
				default:
					t.Error("unexpected request")
					w.WriteHeader(500)
				}
			}))
			defer core.Close()
			cfg := brokerPilotConfig("fixture-service")
			if mode == "expired" {
				cfg.DurableVideoPilotUntil = time.Now().Add(-time.Second).UTC().Format(time.RFC3339)
			}
			if mode == "disabled" {
				cfg.DurableVideoEnabled = false
			}
			app := &App{cfg: cfg, client: aipg.NewClient(core.URL, "fixture")}
			r := requestWithClaims(&auth.Claims{GoogleID: "fixture-google", GridAccountID: owner})
			w := httptest.NewRecorder()
			app.handleDurableVideoCapabilities(w, r)
			if mode == "upstream" {
				if w.Code != 502 || strings.Contains(w.Body.String(), "private-operator-detail") {
					t.Fatal("capacity error leaked upstream data")
				}
				return
			}
			if w.Code != 200 || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("capability read failed or cacheable")
			}
			var result struct {
				Enabled bool `json:"enabled"`
				Models  []struct {
					ID            string `json:"id"`
					OnlineWorkers int    `json:"onlineWorkers"`
				} `json:"models"`
			}
			if json.Unmarshal(w.Body.Bytes(), &result) != nil {
				t.Fatal("invalid capabilities")
			}
			if strings.Contains(w.Body.String(), brokerOwner) || strings.Contains(w.Body.String(), "fixture-user") {
				t.Fatal("private capability data exposed")
			}
			if mode == "allowed" {
				if !result.Enabled || len(result.Models) != 1 || result.Models[0].ID != durableVideoModel || result.Models[0].OnlineWorkers != 2 {
					t.Fatal("models misreported or duplicated")
				}
			} else if result.Enabled || len(result.Models) != 0 || statsCalls.Load() != 0 {
				t.Fatal("closed pilot queried or exposed capacity")
			}
			r = quoteRequest(`{"model":"LTX-2.5 Distilled BF16","frames":81,"fps":24}`)
			if mode == "outside" {
				r = r.WithContext(requestWithClaims(&auth.Claims{GoogleID: "fixture-google", GridAccountID: owner}).Context())
			}
			w = httptest.NewRecorder()
			app.handleDurableVideoQuote(w, r)
			want := 403
			if mode == "allowed" {
				want = 200
			}
			if mode == "disabled" {
				want = 503
			}
			if w.Code != want {
				t.Fatalf("quote status %d, want %d", w.Code, want)
			}
			if mode != "allowed" && quoteCalls.Load() != 0 {
				t.Fatal("closed pilot reached pricing")
			}
		})
	}
	app := &App{}
	w := httptest.NewRecorder()
	app.Router().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/videos/capabilities", nil))
	if w.Code != 401 {
		t.Fatal("anonymous capability read admitted")
	}
}
