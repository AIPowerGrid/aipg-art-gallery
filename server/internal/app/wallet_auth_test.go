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
	"github.com/aipowergrid/aipg-art-gallery/server/internal/gallery"
)

func TestWalletAuthUsesServerDerivedSubjectAndCanonicalCoreIdentity(t *testing.T) {
	t.Setenv("JWT_SECRET", "gallery-wallet-auth-test-secret-at-least-32-bytes")
	const (
		wallet    = "0x0000000000000000000000000000000000000001"
		account   = "4b542669-6c7d-4eb3-8dde-a94e47795404"
		gridToken = "gridu_wallet_step_up"
	)

	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("apikey") != "gallery-service-key" {
			t.Fatal("Gallery service key missing from Core request")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["app_subject"] != "wallet:"+wallet {
			t.Fatalf("untrusted app subject reached Core: %#v", body["app_subject"])
		}
		switch r.URL.Path {
		case "/auth/wallet/challenge":
			if body["domain"] != "aipg.art" || body["uri"] != "https://aipg.art" {
				t.Fatalf("unexpected SIWE origin: %#v", body)
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"nonce": "nonce-1", "message": "core-issued-siwe",
				"expires_in": 600, "chain_id": 8453,
			})
		case "/auth/wallet/exchange":
			writeJSON(w, http.StatusOK, map[string]string{
				"access_token": gridToken,
				"account_id":   account,
				"wallet":       wallet,
			})
		default:
			t.Fatalf("unexpected Core path: %s", r.URL.Path)
		}
	}))
	defer core.Close()

	app := &App{
		cfg: config.Config{
			DefaultAPIKey:  "gallery-service-key",
			AllowedOrigins: []string{"https://aipg.art"},
		},
		client: aipg.NewClient(core.URL, "gallery-test"),
		galleryStore: &gallery.FileStoreAdapter{
			Store: gallery.NewStore("", 10),
		},
	}
	router := app.Router()

	challengeRequest := httptest.NewRequest(
		http.MethodPost,
		"/api/auth/wallet/challenge",
		strings.NewReader(`{"address":"`+wallet+`","app_subject":"victim"}`),
	)
	challengeRequest.Header.Set("Content-Type", "application/json")
	challengeRequest.Header.Set("Origin", "https://aipg.art")
	challengeResponse := httptest.NewRecorder()
	router.ServeHTTP(challengeResponse, challengeRequest)
	if challengeResponse.Code != http.StatusOK {
		t.Fatalf("challenge failed: %d %s", challengeResponse.Code, challengeResponse.Body.String())
	}

	exchangeRequest := httptest.NewRequest(
		http.MethodPost,
		"/api/auth/wallet/exchange",
		strings.NewReader(
			`{"address":"`+wallet+`","message":"core-issued-siwe","signature":"0xsigned","app_subject":"victim"}`,
		),
	)
	exchangeRequest.Header.Set("Content-Type", "application/json")
	exchangeRequest.Header.Set("Origin", "https://aipg.art")
	exchangeResponse := httptest.NewRecorder()
	router.ServeHTTP(exchangeResponse, exchangeRequest)
	if exchangeResponse.Code != http.StatusOK {
		t.Fatalf("exchange failed: %d %s", exchangeResponse.Code, exchangeResponse.Body.String())
	}
	cookies := exchangeResponse.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != authCookieName || !cookies[0].HttpOnly {
		t.Fatalf("canonical session cookie missing: %#v", cookies)
	}
	claims, err := auth.VerifyJWTClaims(cookies[0].Value)
	if err != nil {
		t.Fatal(err)
	}
	if claims.GridAccountID != account || claims.GridAccessToken != gridToken {
		t.Fatalf("canonical Core identity missing from session: %#v", claims)
	}
}

func TestWalletChallengeRequiresAllowedBrowserOrigin(t *testing.T) {
	app := &App{
		cfg: config.Config{
			DefaultAPIKey:  "gallery-service-key",
			AllowedOrigins: []string{"https://aipg.art"},
		},
		client: aipg.NewClient("https://grid.invalid", "gallery-test"),
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/auth/wallet/challenge",
		strings.NewReader(`{"address":"0x0000000000000000000000000000000000000001"}`),
	)
	request.Header.Set("Origin", "https://phishing.example")
	response := httptest.NewRecorder()
	app.Router().ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("foreign origin was not rejected: %d", response.Code)
	}
}
