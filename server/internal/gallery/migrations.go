package gallery

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const migrationLockID int64 = 0x41495047414c

//go:embed migrations/*.sql
var migrationFiles embed.FS

type schemaMigration struct {
	version  string
	checksum string
	sql      string
}

func loadMigrations() ([]schemaMigration, error) {
	entries, err := fs.ReadDir(migrationFiles, "migrations")
	if err != nil {
		return nil, fmt.Errorf("read embedded migrations: %w", err)
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	migrations := make([]schemaMigration, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}

		body, err := migrationFiles.ReadFile("migrations/" + entry.Name())
		if err != nil {
			return nil, fmt.Errorf("read migration %s: %w", entry.Name(), err)
		}
		sum := sha256.Sum256(body)
		migrations = append(migrations, schemaMigration{
			version:  strings.TrimSuffix(entry.Name(), ".sql"),
			checksum: hex.EncodeToString(sum[:]),
			sql:      string(body),
		})
	}

	if len(migrations) == 0 {
		return nil, fmt.Errorf("no embedded gallery migrations")
	}
	return migrations, nil
}

func runMigrations(db *sql.DB) error {
	migrations, err := loadMigrations()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	conn, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("acquire migration connection: %w", err)
	}
	defer conn.Close()

	if _, err := conn.ExecContext(ctx, `SELECT pg_advisory_lock($1)`, migrationLockID); err != nil {
		return fmt.Errorf("acquire migration lock: %w", err)
	}
	defer func() {
		_, _ = conn.ExecContext(context.Background(), `SELECT pg_advisory_unlock($1)`, migrationLockID)
	}()

	if _, err := conn.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS gallery_schema_migrations (
			version TEXT PRIMARY KEY,
			checksum TEXT NOT NULL,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`); err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}

	for _, migration := range migrations {
		if err := applyMigration(ctx, conn, migration); err != nil {
			return err
		}
	}
	return nil
}

func applyMigration(ctx context.Context, conn *sql.Conn, migration schemaMigration) error {
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin migration %s: %w", migration.version, err)
	}
	defer tx.Rollback()

	var recordedChecksum string
	err = tx.QueryRowContext(ctx,
		`SELECT checksum FROM gallery_schema_migrations WHERE version = $1`,
		migration.version,
	).Scan(&recordedChecksum)
	switch {
	case err == nil:
		if recordedChecksum != migration.checksum {
			return fmt.Errorf("migration %s checksum changed after application", migration.version)
		}
		return tx.Commit()
	case err != sql.ErrNoRows:
		return fmt.Errorf("read migration %s state: %w", migration.version, err)
	}

	if _, err := tx.ExecContext(ctx, migration.sql); err != nil {
		return fmt.Errorf("apply migration %s: %w", migration.version, err)
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO gallery_schema_migrations (version, checksum) VALUES ($1, $2)`,
		migration.version,
		migration.checksum,
	); err != nil {
		return fmt.Errorf("record migration %s: %w", migration.version, err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit migration %s: %w", migration.version, err)
	}
	return nil
}
