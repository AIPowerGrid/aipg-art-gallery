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

func TestLinkedSessionKeepsGoogleGalleryOwner(t *testing.T) {
	googleOnly := getGalleryOwnerIdentifier(requestWithClaims(&auth.Claims{GoogleID: "google-subject-123"}))
	linked := getGalleryOwnerIdentifier(requestWithClaims(&auth.Claims{
		GoogleID: "google-subject-123", WalletAddress: "0x1111111111111111111111111111111111111111",
	}))
	if linked != googleOnly {
		t.Fatalf("linked owner = %q, want existing Google owner %q", linked, googleOnly)
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
