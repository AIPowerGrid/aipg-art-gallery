package gallery

import (
	"database/sql"
	"os"
	"testing"
)

func TestPostgresMediaTypeReaders(t *testing.T) {
	url := os.Getenv("GALLERY_TEST_POSTGRES_URL")
	if url == "" {
		t.Skip("set GALLERY_TEST_POSTGRES_URL to a disposable PostgreSQL database")
	}
	admin, err := sql.Open("postgres", url)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close()
	if err := runMigrations(admin); err != nil {
		t.Fatal(err)
	}
	db := isolatedSchemaDB(t, admin, url, "media")
	if err := runMigrations(db); err != nil {
		t.Fatal(err)
	}
	store := &PostgresStore{db: db}
	favorites := NewFavoritesStore(db)
	for _, kind := range []string{"image", "video"} {
		t.Run(kind, func(t *testing.T) {
			owner := "owner-" + kind
			item := GalleryItem{JobID: "job-" + kind, Type: kind, WalletAddress: owner,
				ModelName: "Test model", Prompt: "Test prompt", IsPublic: true,
				MediaURLs: []string{"https://media.example.test/result"}}
			if err := store.Add(item); err != nil {
				t.Fatal(err)
			}
			if err := favorites.Add(owner, item.JobID); err != nil {
				t.Fatal(err)
			}
			check := func(t *testing.T, got *GalleryItem) {
				t.Helper()
				if got == nil || got.Type != kind || len(got.MediaURLs) != 1 || got.MediaURLs[0] != item.MediaURLs[0] {
					t.Fatalf("media reader returned %#v, want %s with original URL", got, kind)
				}
			}
			t.Run("single item", func(t *testing.T) { check(t, store.Get(item.JobID)) })
			for name, items := range map[string][]GalleryItem{
				"private history": store.ListByWallet(owner, 10),
				"favorites":       favorites.GetFavoritedItems(owner, 10),
			} {
				t.Run(name, func(t *testing.T) {
					if len(items) != 1 {
						t.Fatalf("got %d items, want 1", len(items))
					}
					check(t, &items[0])
				})
			}
			if got := store.ListByWallet("unrelated-owner", 10); len(got) != 0 {
				t.Fatal("history leaked to unrelated owner")
			}
		})
	}
}
