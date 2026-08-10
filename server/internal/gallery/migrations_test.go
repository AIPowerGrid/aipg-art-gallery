package gallery

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

func TestLoadMigrations(t *testing.T) {
	migrations, err := loadMigrations()
	if err != nil {
		t.Fatalf("loadMigrations() error = %v", err)
	}
	if len(migrations) != 2 {
		t.Fatalf("migration count = %d, want 2", len(migrations))
	}
	if migrations[0].version != "0001_gallery_baseline" || migrations[1].version != "0002_identity_and_grid_receipts" {
		t.Fatalf("unexpected migration order: %q, %q", migrations[0].version, migrations[1].version)
	}
	for _, migration := range migrations {
		if len(migration.checksum) != 64 || strings.TrimSpace(migration.sql) == "" {
			t.Fatalf("invalid embedded migration %q", migration.version)
		}
	}
}

func TestMigrationsPostgres(t *testing.T) {
	adminURL := os.Getenv("GALLERY_TEST_POSTGRES_URL")
	if adminURL == "" {
		t.Skip("set GALLERY_TEST_POSTGRES_URL to run PostgreSQL migration tests")
	}

	adminDB, err := sql.Open("postgres", adminURL)
	if err != nil {
		t.Fatalf("open PostgreSQL: %v", err)
	}
	defer adminDB.Close()
	if err := adminDB.Ping(); err != nil {
		t.Fatalf("ping PostgreSQL: %v", err)
	}
	if _, err := adminDB.Exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto`); err != nil {
		t.Fatalf("create pgcrypto extension: %v", err)
	}

	t.Run("fresh database and concurrent startup", func(t *testing.T) {
		db := isolatedSchemaDB(t, adminDB, adminURL, "fresh")

		const starters = 6
		errs := make(chan error, starters)
		var wg sync.WaitGroup
		for range starters {
			wg.Add(1)
			go func() {
				defer wg.Done()
				errs <- runMigrations(db)
			}()
		}
		wg.Wait()
		close(errs)
		for err := range errs {
			if err != nil {
				t.Errorf("concurrent runMigrations() error = %v", err)
			}
		}

		assertMigrationState(t, db)
		if _, err := db.Exec(`INSERT INTO users (google_id, email) VALUES ('google-test', 'test@example.com')`); err != nil {
			t.Fatalf("insert Google-only user: %v", err)
		}
	})

	t.Run("legacy schema upgrade", func(t *testing.T) {
		db := isolatedSchemaDB(t, adminDB, adminURL, "legacy")
		if _, err := db.Exec(legacySchemaSQL); err != nil {
			t.Fatalf("create legacy schema: %v", err)
		}
		if err := runMigrations(db); err != nil {
			t.Fatalf("upgrade legacy schema: %v", err)
		}
		if err := runMigrations(db); err != nil {
			t.Fatalf("repeat migration run: %v", err)
		}

		assertMigrationState(t, db)
		var nullable string
		if err := db.QueryRow(`
			SELECT is_nullable
			FROM information_schema.columns
			WHERE table_schema = current_schema()
			  AND table_name = 'users'
			  AND column_name = 'wallet_address'
		`).Scan(&nullable); err != nil {
			t.Fatalf("read wallet nullability: %v", err)
		}
		if nullable != "YES" {
			t.Fatalf("users.wallet_address nullable = %q, want YES", nullable)
		}
	})

	t.Run("changed migration is rejected", func(t *testing.T) {
		db := isolatedSchemaDB(t, adminDB, adminURL, "checksum")
		if err := runMigrations(db); err != nil {
			t.Fatalf("initial migration run: %v", err)
		}
		if _, err := db.Exec(`
			UPDATE gallery_schema_migrations
			SET checksum = 'tampered'
			WHERE version = '0001_gallery_baseline'
		`); err != nil {
			t.Fatalf("tamper migration ledger: %v", err)
		}
		if err := runMigrations(db); err == nil || !strings.Contains(err.Error(), "checksum changed") {
			t.Fatalf("runMigrations() error = %v, want checksum rejection", err)
		}
	})
}

func isolatedSchemaDB(t *testing.T, adminDB *sql.DB, adminURL, suffix string) *sql.DB {
	t.Helper()
	schema := fmt.Sprintf("gallery_migration_%s_%d", suffix, time.Now().UnixNano())
	if _, err := adminDB.Exec(`CREATE SCHEMA ` + pqQuoteIdentifier(schema)); err != nil {
		t.Fatalf("create test schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = adminDB.Exec(`DROP SCHEMA IF EXISTS ` + pqQuoteIdentifier(schema) + ` CASCADE`)
	})

	scopedURL, err := postgresURLWithSearchPath(adminURL, schema)
	if err != nil {
		t.Fatalf("scope PostgreSQL URL: %v", err)
	}
	db, err := sql.Open("postgres", scopedURL)
	if err != nil {
		t.Fatalf("open scoped PostgreSQL: %v", err)
	}
	db.SetMaxOpenConns(12)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func postgresURLWithSearchPath(rawURL, schema string) (string, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	if u.Scheme != "postgres" && u.Scheme != "postgresql" {
		return "", fmt.Errorf("GALLERY_TEST_POSTGRES_URL must be a postgres URL")
	}
	query := u.Query()
	query.Set("search_path", schema)
	u.RawQuery = query.Encode()
	return u.String(), nil
}

func pqQuoteIdentifier(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}

func assertMigrationState(t *testing.T, db *sql.DB) {
	t.Helper()
	var migrationCount int
	if err := db.QueryRow(`SELECT count(*) FROM gallery_schema_migrations`).Scan(&migrationCount); err != nil {
		t.Fatalf("count migrations: %v", err)
	}
	if migrationCount != 2 {
		t.Fatalf("migration count = %d, want 2", migrationCount)
	}

	for _, table := range []string{"users", "gallery_items", "generation_jobs", "favorites"} {
		var exists bool
		if err := db.QueryRow(`SELECT to_regclass(current_schema() || '.' || $1) IS NOT NULL`, table).Scan(&exists); err != nil {
			t.Fatalf("look up table %s: %v", table, err)
		}
		if !exists {
			t.Errorf("table %s does not exist", table)
		}
	}

	for _, column := range []struct{ table, name string }{
		{"users", "google_id"},
		{"users", "picture_url"},
		{"gallery_items", "worker"},
		{"gallery_items", "gen_time"},
		{"gallery_items", "grid_job_id"},
	} {
		var exists bool
		if err := db.QueryRow(`
			SELECT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2
			)
		`, column.table, column.name).Scan(&exists); err != nil {
			t.Fatalf("look up column %s.%s: %v", column.table, column.name, err)
		}
		if !exists {
			t.Errorf("column %s.%s does not exist", column.table, column.name)
		}
	}
}

const legacySchemaSQL = `
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR NOT NULL UNIQUE,
    username VARCHAR,
    avatar_url TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    last_seen_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE TABLE gallery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id VARCHAR UNIQUE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    media_url TEXT NOT NULL,
    thumbnail_url TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    model VARCHAR,
    width INTEGER,
    height INTEGER,
    steps INTEGER,
    cfg_scale NUMERIC,
    sampler VARCHAR,
    scheduler VARCHAR,
    seed BIGINT,
    worker_id VARCHAR,
    wallet_address VARCHAR,
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
    sort_order INTEGER,
    type VARCHAR DEFAULT 'image',
    is_nsfw BOOLEAN DEFAULT false,
    random_sort DOUBLE PRECISION DEFAULT random(),
    seeds TEXT[]
);
`
