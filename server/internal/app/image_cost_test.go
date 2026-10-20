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
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/config"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/models"
)

func TestImageCeilingValidationAndMapping(t *testing.T) {
	for _, value := range []int64{-1, 0, 1, 5000, 9007199254740992} {
		req := CreateJobRequest{ModelID: "z-image-turbo", Prompt: "test", MaxCostMicroUSD: &value}
		if (req.Validate() == nil) != (value > 0 && value <= 9007199254740991) {
			t.Fatalf("unsafe ceiling %d", value)
		}
	}
	value := int64(5000)
	gen := buildGenerateRequest(CreateJobRequest{ModelID: "z-image-turbo", Prompt: "test", MaxCostMicroUSD: &value}, models.ModelPreset{ID: "z-image-turbo", Type: "image"})
	if gen.MaxCostMicroUSD == nil || *gen.MaxCostMicroUSD != value {
		t.Fatal("ceiling not forwarded")
	}
	legacy, err := json.Marshal(CreateJobRequest{ModelID: "z-image-turbo", Prompt: "test"})
	if err != nil || strings.Contains(string(legacy), "maxCostMicroUSD") {
		t.Fatal("legacy request digest changed for omitted ceiling")
	}
}

func TestShotRouteRequiresPrivateSingleImageAndSavedCeiling(t *testing.T) {
	for _, change := range []string{"valid", "no handle", "no ceiling", "public", "batch", "video", "wrong source mode", "timeline", "lora"} {
		t.Run(change, func(t *testing.T) {
			req := map[string]any{"requestId": "saved-shot-request", "modelId": "z-image-turbo", "prompt": "fixture",
				"params": map[string]any{"n": 1}, "maxCostMicroUSD": 5000, "mediaType": "image", "sourceProcessing": "txt2img"}
			switch change {
			case "no handle":
				delete(req, "requestId")
			case "no ceiling":
				delete(req, "maxCostMicroUSD")
			case "public":
				req["public"] = true
			case "batch":
				req["params"] = map[string]any{"n": 2}
			case "video":
				req["mediaType"] = "video"
			case "wrong source mode":
				req["sourceProcessing"] = "img2img"
			case "timeline":
				req["timelineData"] = `{"segments":[]}`
			case "lora":
				req["loras"] = []map[string]string{{"name": "fixture"}}
			}
			body, err := json.Marshal(req)
			if err != nil {
				t.Fatal(err)
			}
			r := httptest.NewRequest(http.MethodPost, "/api/images/jobs", strings.NewReader(string(body)))
			w := httptest.NewRecorder()
			app := &App{}
			app.handleCreateShotImage(w, r)
			want := http.StatusBadRequest
			if change == "valid" {
				want = http.StatusServiceUnavailable
			}
			if w.Code != want {
				t.Fatalf("shot validation: %d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestShotEndpointIsAuthenticated(t *testing.T) {
	app := &App{}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/images/jobs", strings.NewReader(`{}`))
	app.Router().ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("shot endpoint bypassed authentication: %d", response.Code)
	}
}

func TestImageCeilingRejectsUnboundOrOverBudgetQuoteBeforeDispatch(t *testing.T) {
	catalog, err := models.LoadCatalog("../../config/model_presets.json")
	if err != nil {
		t.Fatal(err)
	}
	for _, change := range []string{"cost", "model", "modality", "count", "preview", "feature"} {
		t.Run(change, func(t *testing.T) {
			var dispatched atomic.Int32
			core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/auth/service/exchange":
					if err := json.NewEncoder(w).Encode(map[string]string{"access_token": "fixture-user", "account_id": "owner"}); err != nil {
						t.Error(err)
					}
				case "/account/credits/quote":
					estimate := map[string]any{"model": "z-image-turbo", "modality": "image", "n": 1, "priced": true, "cost_micro": 5000, "balance_sufficient": true}
					charging := true
					switch change {
					case "cost":
						estimate["cost_micro"] = 5001
					case "model":
						estimate["model"] = "foreign"
					case "modality":
						estimate["modality"] = "video"
					case "count":
						estimate["n"] = 2
					case "preview":
						charging = false
					}
					if err := json.NewEncoder(w).Encode(map[string]any{"account_id": "owner", "charging_enabled": charging, "estimate": estimate}); err != nil {
						t.Error(err)
					}
				case "/health":
					if _, err := w.Write([]byte(`{"features":[]}`)); err != nil {
						t.Error(err)
					}
				default:
					dispatched.Add(1)
					http.Error(w, "unexpected dispatch", 500)
				}
			}))
			defer core.Close()
			app := &App{cfg: config.Config{DefaultAPIKey: "fixture-service"}, client: aipg.NewClient(core.URL, "fixture"), catalog: catalog, pending: newPendingStore(time.Minute)}
			req := requestWithClaims(&auth.Claims{GoogleID: "fixture", GridAccountID: "owner"})
			req.Body = io.NopCloser(strings.NewReader(`{"modelId":"z-image-turbo","prompt":"fixture","params":{"n":1},"maxCostMicroUSD":5000}`))
			response := httptest.NewRecorder()
			app.handleCreateJob(response, req)
			want := http.StatusBadRequest
			if change == "feature" {
				want = http.StatusUnprocessableEntity
			}
			if response.Code != want || dispatched.Load() != 0 || len(app.pending.jobs) != 0 {
				t.Fatalf("invalid ceiling dispatched: %d %s", response.Code, response.Body.String())
			}
		})
	}
}
