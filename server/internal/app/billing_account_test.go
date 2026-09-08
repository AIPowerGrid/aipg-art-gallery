// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid contributors

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

func TestBillingResponsesMustMatchAuthenticatedAccount(t *testing.T) {
	catalog, err := models.LoadCatalog("../../config/model_presets.json")
	if err != nil {
		t.Fatal(err)
	}
	for _, account := range []string{"canonical-account", "different-account", ""} {
		for _, endpoint := range []string{"credits", "quote", "image batch", "director segment"} {
			t.Run(account+"/"+endpoint, func(t *testing.T) {
				var generations atomic.Int32
				core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.Header.Get("apikey") != "service-key" {
						t.Error("missing service authentication")
					}
					if r.URL.Path == "/auth/service/exchange" {
						_ = json.NewEncoder(w).Encode(map[string]string{
							"access_token": "delegated-token", "account_id": "canonical-account",
						})
						return
					}
					if r.Header.Get("X-Grid-User-Token") != "delegated-token" {
						t.Error("missing delegated identity")
					}
					switch r.URL.Path {
					case "/account/credits", "/account/credits/quote":
						_ = json.NewEncoder(w).Encode(map[string]any{
							"account_id": account, "charging_enabled": true,
							// Even a matching account cannot dispatch with insufficient funds.
							"estimate": map[string]any{"priced": true, "balance_sufficient": false},
						})
					default:
						generations.Add(1)
						http.Error(w, "unexpected generation", http.StatusInternalServerError)
					}
				}))
				defer core.Close()
				app := &App{
					cfg:     config.Config{DefaultAPIKey: "service-key"},
					client:  aipg.NewClient(core.URL, "billing-test"),
					catalog: catalog, pending: newPendingStore(time.Minute),
				}
				var handler http.HandlerFunc
				var body string
				want := http.StatusOK
				switch endpoint {
				case "credits":
					handler = app.handleCredits
				case "quote":
					handler = app.handleCreditQuote
					body = `{"modelId":"z-image-turbo","n":1}`
				case "image batch":
					handler = app.handleCreateJob
					body = `{"modelId":"z-image-turbo","prompt":"test","params":{"n":4}}`
					want = http.StatusPaymentRequired
				case "director segment":
					handler = app.handleCreateJob
					body = `{"modelId":"LTX-2.3","mediaType":"video","prompt":"test","params":{"n":1,"length":96,"fps":24}}`
					want = http.StatusPaymentRequired
				}
				if account != "canonical-account" {
					want = http.StatusBadGateway
				}
				request := requestWithClaims(&auth.Claims{
					GoogleID: "gallery-user", GridAccountID: "canonical-account",
				})
				request.Body = io.NopCloser(strings.NewReader(body))
				response := httptest.NewRecorder()
				handler(response, request)
				if response.Code != want {
					t.Fatalf("status %d, want %d: %s", response.Code, want, response.Body.String())
				}
				if generations.Load() != 0 || len(app.pending.jobs) != 0 {
					t.Fatal("rejected billing preflight dispatched generation")
				}
			})
		}
	}
}
