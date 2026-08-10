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

func TestOwnerKeysUnifyLinkedIdentities(t *testing.T) {
	linked := requestWithClaims(&auth.Claims{
		GoogleID: "g-123", WalletAddress: "0xAbC", GridAccountID: "acct-1",
	})

	// The canonical account id is the write key.
	if got := accountKey(linked); got != "acct-1" {
		t.Fatalf("accountKey = %q, want acct-1", got)
	}

	// A linked user's key set contains all three identities.
	if keys := ownerKeys(linked); len(keys) != 3 {
		t.Fatalf("ownerKeys = %v, want 3 keys", keys)
	}
	googleKey := getGalleryOwnerIdentifier(requestWithClaims(&auth.Claims{GoogleID: "g-123"}))

	// Items stored under ANY of the user's identities are recognized as theirs.
	if !ownsOwnerKey(linked, "0xABC") {
		t.Fatal("linked user should own their wallet items")
	}
	if !ownsOwnerKey(linked, googleKey) {
		t.Fatal("linked user should own their google-hashed items")
	}
	if !ownsOwnerKey(linked, "acct-1") {
		t.Fatal("linked user should own account-id items")
	}
	if ownsOwnerKey(linked, "0xstranger") {
		t.Fatal("must not own a stranger's items")
	}

	// A google-only session (wallet not yet linked) does NOT own the wallet items.
	gOnly := requestWithClaims(&auth.Claims{GoogleID: "g-123", GridAccountID: "acct-1"})
	if ownsOwnerKey(gOnly, "0xabc") {
		t.Fatal("unlinked google session must not own wallet items until linked")
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
