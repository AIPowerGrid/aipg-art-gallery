package aipg

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSignAssertionMatchesCoreContract(t *testing.T) {
	key := "grid_test_bridge"
	token, err := SignAssertion(key, "google", "google-sub")
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("expected three token parts, got %d", len(parts))
	}
	mac := hmac.New(sha256.New, []byte(key))
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || !hmac.Equal(signature, mac.Sum(nil)) {
		t.Fatal("assertion signature did not verify")
	}
	payloadJSON, _ := base64.RawURLEncoding.DecodeString(parts[1])
	var payload map[string]any
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		t.Fatal(err)
	}
	issuer := sha256.Sum256([]byte(key))
	if payload["iss"] != hex.EncodeToString(issuer[:])[:24] || payload["aud"] != "grid-core" {
		t.Fatalf("wrong issuer/audience: %#v", payload)
	}
	if payload["provider"] != "google" || payload["sub"] != "google-sub" {
		t.Fatalf("wrong identity: %#v", payload)
	}
}

func TestCreditsSendsBridgeAssertion(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/account/credits" || r.Header.Get("apikey") != "bridge" || r.Header.Get("X-Grid-User-Assertion") != "assertion" {
			http.Error(w, "unexpected request", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"promotional":{},"free":{},"paid":{}}`))
	}))
	defer server.Close()
	client := NewClient(server.URL, "test")
	if _, err := client.Credits(context.Background(), "bridge", "assertion"); err != nil {
		t.Fatal(err)
	}
}
