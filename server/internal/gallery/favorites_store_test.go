package gallery

import (
	"path/filepath"
	"testing"
)

func TestFileStoreCanonicalizeOwner(t *testing.T) {
	store := NewStore(filepath.Join(t.TempDir(), "gallery.json"), 10)
	store.Add(GalleryItem{JobID: "legacy", WalletAddress: "Google:Legacy"})
	store.Add(GalleryItem{JobID: "other", WalletAddress: "other-account"})

	store.CanonicalizeOwner("ACCOUNT-123", []string{"google:legacy"})
	store.CanonicalizeOwner("account-123", []string{"google:legacy"})

	items := store.ListByWallet("account-123", 10)
	if len(items) != 1 || items[0].JobID != "legacy" {
		t.Fatalf("canonical items = %#v, want legacy item", items)
	}
	if got := store.ListByWallet("other-account", 10); len(got) != 1 {
		t.Fatalf("unrelated owner changed: %#v", got)
	}
}
