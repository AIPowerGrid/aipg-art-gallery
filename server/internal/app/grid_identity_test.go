package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/config"
)

func TestGridUserIdentityRequiresSessionAccountParity(t *testing.T) {
	for _, test := range []struct {
		name        string
		coreAccount string
		wantError   string
	}{
		{name: "matching account", coreAccount: "canonical-account"},
		{
			name:        "mismatched account",
			coreAccount: "different-account",
			wantError:   "identity mismatch",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/auth/service/exchange" {
					t.Fatalf("unexpected path: %s", r.URL.Path)
				}
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string]string{
					"access_token": "delegated-token",
					"account_id":   test.coreAccount,
				})
			}))
			defer core.Close()

			app := &App{
				cfg:    config.Config{DefaultAPIKey: "service-key"},
				client: aipg.NewClient(core.URL, "gallery-test"),
			}
			request := requestWithClaims(&auth.Claims{
				GoogleID:      "gallery-user",
				GridAccountID: "canonical-account",
			})
			identity, err := app.gridUserIdentity(request.Context(), request)
			if test.wantError != "" {
				if err == nil || !strings.Contains(err.Error(), test.wantError) {
					t.Fatalf("expected %q error, got %v", test.wantError, err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if identity.AccountID != "canonical-account" ||
				identity.AccessToken != "delegated-token" {
				t.Fatalf("unexpected identity: %+v", identity)
			}
		})
	}
}
