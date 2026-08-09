package gallery

import (
	"database/sql"
	"os"
	"testing"

	_ "github.com/lib/pq"
)

// TestFavoritesStoreOwnerKeys verifies favorites are keyed on an opaque owner id
// (not specifically a wallet), so Google users — stored as "google:<hash>" — get
// their own isolated favorites. Runs only when TEST_DB_URL points at Postgres.
func TestFavoritesStoreOwnerKeys(t *testing.T) {
	dsn := os.Getenv("TEST_DB_URL")
	if dsn == "" {
		t.Skip("TEST_DB_URL not set; skipping DB-backed favorites test")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		t.Skipf("cannot reach TEST_DB_URL: %v", err)
	}

	for _, q := range []string{
		`CREATE TABLE IF NOT EXISTS gallery_items (job_id TEXT PRIMARY KEY, model TEXT, prompt TEXT,
			negative_prompt TEXT, media_url TEXT, is_public BOOLEAN DEFAULT false, wallet_address TEXT,
			width INT, height INT, steps INT, cfg_scale DOUBLE PRECISION, sampler TEXT, scheduler TEXT,
			seed TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
		`CREATE TABLE IF NOT EXISTS favorites (id SERIAL PRIMARY KEY, wallet_address TEXT NOT NULL,
			job_id TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (wallet_address, job_id))`,
		`INSERT INTO gallery_items (job_id, model, media_url, is_public, wallet_address)
			VALUES ('fav-test-job', 'z-image-turbo', '["https://x/y.webp"]', true, '0xowner')
			ON CONFLICT (job_id) DO NOTHING`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("setup: %v", err)
		}
	}

	const googleOwner = "google:deadbeef-test-owner"
	const walletOwner = "0xwallet-test-owner"
	t.Cleanup(func() {
		db.Exec(`DELETE FROM favorites WHERE wallet_address IN ($1,$2)`, googleOwner, walletOwner)
	})

	s := NewFavoritesStore(db)

	// A Google-style owner can favorite and read it back.
	if err := s.Add(googleOwner, "fav-test-job"); err != nil {
		t.Fatalf("Add(google): %v", err)
	}
	if !s.IsFavorited(googleOwner, "fav-test-job") {
		t.Fatal("google owner's favorite not found")
	}
	items := s.GetFavoritedItems(googleOwner, 100)
	if len(items) != 1 || items[0].JobID != "fav-test-job" {
		t.Fatalf("expected 1 favorited item for google owner, got %d", len(items))
	}

	// Isolation: a different owner does not see it.
	if s.IsFavorited(walletOwner, "fav-test-job") {
		t.Fatal("favorite leaked across owners")
	}
	if got := s.GetFavoritedItems(walletOwner, 100); len(got) != 0 {
		t.Fatalf("expected 0 items for other owner, got %d", len(got))
	}

	// Remove works.
	if err := s.Remove(googleOwner, "fav-test-job"); err != nil {
		t.Fatalf("Remove: %v", err)
	}
	if s.IsFavorited(googleOwner, "fav-test-job") {
		t.Fatal("favorite still present after remove")
	}
}
