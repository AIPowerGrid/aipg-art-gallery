package aipg

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExchangeServiceIdentityReturnsCanonicalAccount(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/service/exchange" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("apikey"); got != "service-key" {
			t.Fatalf("apikey = %q", got)
		}
		var request map[string]string
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if request["subject"] != "google:gallery-user" {
			t.Fatalf("subject = %q", request["subject"])
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"access_token":"delegated-token",
			"account_id":"canonical-account"
		}`))
	}))
	defer server.Close()

	identity, err := NewClient(server.URL, "gallery-test").ExchangeServiceIdentity(
		context.Background(),
		"service-key",
		"google:gallery-user",
	)
	if err != nil {
		t.Fatal(err)
	}
	if identity.AccessToken != "delegated-token" ||
		identity.AccountID != "canonical-account" {
		t.Fatalf("unexpected identity: %+v", identity)
	}
}

func TestExchangeServiceIdentityRejectsMissingCanonicalAccount(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"delegated-token"}`))
	}))
	defer server.Close()

	_, err := NewClient(server.URL, "gallery-test").ExchangeServiceIdentity(
		context.Background(),
		"service-key",
		"google:gallery-user",
	)
	if err == nil || !strings.Contains(err.Error(), "incomplete identity") {
		t.Fatalf("expected incomplete identity error, got %v", err)
	}
}
