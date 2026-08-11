package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
)

func requestWithClaims(claims *auth.Claims) *http.Request {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	return req.WithContext(context.WithValue(req.Context(), claimsContextKey, claims))
}

func TestGalleryOwnerIdentifierWallet(t *testing.T) {
	req := requestWithClaims(&auth.Claims{WalletAddress: "  0xAbC123  "})
	if got := getGalleryOwnerIdentifier(req); got != "0xabc123" {
		t.Fatalf("owner = %q, want normalized wallet", got)
	}
}

func TestGalleryOwnerIdentifierPrefersCanonicalAccount(t *testing.T) {
	req := requestWithClaims(&auth.Claims{
		GridAccountID: "  ACCOUNT-123  ",
		GoogleID:      "google-subject-123",
		WalletAddress: "0xAbC123",
	})
	if got := getGalleryOwnerIdentifier(req); got != "account-123" {
		t.Fatalf("owner = %q, want canonical account", got)
	}
}

func TestGalleryOwnerIdentifierGoogleIsOpaqueAndStable(t *testing.T) {
	first := getGalleryOwnerIdentifier(requestWithClaims(&auth.Claims{GoogleID: "google-subject-123"}))
	second := getGalleryOwnerIdentifier(requestWithClaims(&auth.Claims{GoogleID: "google-subject-123"}))
	other := getGalleryOwnerIdentifier(requestWithClaims(&auth.Claims{GoogleID: "google-subject-456"}))

	if first == "" || first != second || first == other {
		t.Fatal("google owner identifiers are not stable and distinct")
	}
	if strings.Contains(first, "google-subject-123") {
		t.Fatalf("google subject leaked in owner identifier: %q", first)
	}
}

func TestLegacyOwnerKeysOnlyUseProvenClaims(t *testing.T) {
	google := googleGalleryOwnerIdentifier("google-subject-123")
	wallet := "0x1111111111111111111111111111111111111111"

	tests := []struct {
		name   string
		claims *auth.Claims
		want   []string
	}{
		{"fresh Google", &auth.Claims{GoogleID: "google-subject-123"}, []string{google}},
		{"fresh wallet", &auth.Claims{WalletAddress: wallet}, []string{wallet}},
		{"linked", &auth.Claims{GoogleID: "google-subject-123", WalletAddress: wallet}, []string{google, wallet}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := legacyGalleryOwnerIdentifiers(test.claims)
			if len(got) != len(test.want) {
				t.Fatalf("legacy keys = %q, want %q", got, test.want)
			}
			for i := range got {
				if got[i] != test.want[i] {
					t.Fatalf("legacy keys = %q, want %q", got, test.want)
				}
			}
		})
	}
}

func TestPendingJobsCarryOwner(t *testing.T) {
	store := newPendingStore(time.Minute)
	id := store.create("image", "prompt", "owner-1")
	job, ok := store.get(id)
	if !ok || job.Owner != "owner-1" {
		t.Fatalf("pending job owner was not retained: %#v", job)
	}
}

func TestGalleryOwnerIdentifierRequiresClaims(t *testing.T) {
	if got := getGalleryOwnerIdentifier(httptest.NewRequest(http.MethodGet, "/", nil)); got != "" {
		t.Fatalf("owner = %q, want empty", got)
	}
}
