package gallery

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

// PostgresStore implements GalleryStore using PostgreSQL
type PostgresStore struct {
	db        *sql.DB
	UserStore *UserStore
	JobStore  *JobStore
}

// NewPostgresStore creates a new PostgreSQL-backed gallery store
func NewPostgresStore(connStr string) (*PostgresStore, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open postgres connection: %w", err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping postgres: %w", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	store := &PostgresStore{
		db:        db,
		UserStore: &UserStore{db: db},
		JobStore:  &JobStore{db: db},
	}

	return store, nil
}

// Add inserts a new gallery item
func (s *PostgresStore) Add(item GalleryItem) error {
	paramsJSON, err := json.Marshal(item.Params)
	if err != nil {
		paramsJSON = []byte("{}")
	}

	mediaURLsJSON, err := json.Marshal(item.MediaURLs)
	if err != nil {
		mediaURLsJSON = []byte("[]")
	}

	query := `
		INSERT INTO gallery_items (
			job_id, model_id, model_name, prompt, negative_prompt,
			type, is_nsfw, is_public, wallet_address, params, media_urls, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (job_id) DO UPDATE SET
			media_urls = EXCLUDED.media_urls,
			is_public = EXCLUDED.is_public
	`

	createdAt := time.UnixMilli(item.CreatedAt)
	if item.CreatedAt == 0 {
		createdAt = time.Now()
	}

	_, err = s.db.Exec(query,
		item.JobID,
		item.ModelID,
		item.ModelName,
		item.Prompt,
		item.NegativePrompt,
		item.Type,
		item.IsNSFW,
		item.IsPublic,
		strings.ToLower(item.WalletAddress),
		paramsJSON,
		mediaURLsJSON,
		createdAt,
	)

	return err
}

// Get retrieves a single gallery item by job ID
func (s *PostgresStore) Get(jobID string) *GalleryItem {
	query := `
		SELECT job_id, model_id, model_name, prompt, negative_prompt,
			   type, is_nsfw, is_public, wallet_address, params, media_urls, created_at
		FROM gallery_items
		WHERE job_id = $1
	`

	var item GalleryItem
	var paramsJSON, mediaURLsJSON []byte
	var walletAddr sql.NullString
	var createdAt time.Time

	err := s.db.QueryRow(query, jobID).Scan(
		&item.JobID,
		&item.ModelID,
		&item.ModelName,
		&item.Prompt,
		&item.NegativePrompt,
		&item.Type,
		&item.IsNSFW,
		&item.IsPublic,
		&walletAddr,
		&paramsJSON,
		&mediaURLsJSON,
		&createdAt,
	)

	if err != nil {
		return nil
	}

	item.CreatedAt = createdAt.UnixMilli()
	if walletAddr.Valid {
		item.WalletAddress = walletAddr.String
	}

	json.Unmarshal(paramsJSON, &item.Params)
	json.Unmarshal(mediaURLsJSON, &item.MediaURLs)

	return &item
}

// List returns paginated gallery items with optional filtering
func (s *PostgresStore) List(typeFilter string, limit, offset int, searchQuery string) ListResult {
	var items []GalleryItem
	var args []interface{}
	argNum := 1

	// Build WHERE clause
	whereClauses := []string{"is_public = true"}

	if typeFilter != "" && typeFilter != "all" {
		whereClauses = append(whereClauses, fmt.Sprintf("type = $%d", argNum))
		args = append(args, typeFilter)
		argNum++
	}

	if searchQuery != "" {
		// Use word boundary regex for better matching
		whereClauses = append(whereClauses, fmt.Sprintf("prompt ~* $%d", argNum))
		// Match word boundaries: \m = start of word, \M = end of word
		pattern := fmt.Sprintf("\\m%s", strings.ToLower(searchQuery))
		args = append(args, pattern)
		argNum++
	}

	whereClause := strings.Join(whereClauses, " AND ")

	// Get total count
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM gallery_items WHERE %s", whereClause)
	var total int
	s.db.QueryRow(countQuery, args...).Scan(&total)

	// Get items with random ordering
	query := fmt.Sprintf(`
		SELECT job_id, model_id, model_name, prompt, negative_prompt,
			   type, is_nsfw, is_public, wallet_address, params, media_urls, created_at
		FROM gallery_items
		WHERE %s
		ORDER BY RANDOM()
		LIMIT $%d OFFSET $%d
	`, whereClause, argNum, argNum+1)

	args = append(args, limit, offset)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		log.Printf("Error querying gallery items: %v", err)
		return ListResult{Items: items, Total: total}
	}
	defer rows.Close()

	for rows.Next() {
		var item GalleryItem
		var paramsJSON, mediaURLsJSON []byte
		var walletAddr sql.NullString
		var createdAt time.Time

		err := rows.Scan(
			&item.JobID,
			&item.ModelID,
			&item.ModelName,
			&item.Prompt,
			&item.NegativePrompt,
			&item.Type,
			&item.IsNSFW,
			&item.IsPublic,
			&walletAddr,
			&paramsJSON,
			&mediaURLsJSON,
			&createdAt,
		)

		if err != nil {
			log.Printf("Error scanning gallery item: %v", err)
			continue
		}

		item.CreatedAt = createdAt.UnixMilli()
		if walletAddr.Valid {
			item.WalletAddress = walletAddr.String
		}

		json.Unmarshal(paramsJSON, &item.Params)
		json.Unmarshal(mediaURLsJSON, &item.MediaURLs)

		items = append(items, item)
	}

	return ListResult{
		Items:      items,
		Total:      total,
		HasMore:    offset+len(items) < total,
		NextOffset: offset + len(items),
	}
}

// ListByWallet returns gallery items for a specific wallet address
func (s *PostgresStore) ListByWallet(wallet string, limit int) []GalleryItem {
	var items []GalleryItem

	query := `
		SELECT job_id, model_id, model_name, prompt, negative_prompt,
			   type, is_nsfw, is_public, wallet_address, params, media_urls, created_at
		FROM gallery_items
		WHERE LOWER(wallet_address) = LOWER($1)
		ORDER BY created_at DESC
		LIMIT $2
	`

	rows, err := s.db.Query(query, wallet, limit)
	if err != nil {
		log.Printf("Error querying wallet gallery items: %v", err)
		return items
	}
	defer rows.Close()

	for rows.Next() {
		var item GalleryItem
		var paramsJSON, mediaURLsJSON []byte
		var walletAddr sql.NullString
		var createdAt time.Time

		err := rows.Scan(
			&item.JobID,
			&item.ModelID,
			&item.ModelName,
			&item.Prompt,
			&item.NegativePrompt,
			&item.Type,
			&item.IsNSFW,
			&item.IsPublic,
			&walletAddr,
			&paramsJSON,
			&mediaURLsJSON,
			&createdAt,
		)

		if err != nil {
			continue
		}

		item.CreatedAt = createdAt.UnixMilli()
		if walletAddr.Valid {
			item.WalletAddress = walletAddr.String
		}

		json.Unmarshal(paramsJSON, &item.Params)
		json.Unmarshal(mediaURLsJSON, &item.MediaURLs)

		items = append(items, item)
	}

	return items
}

// Delete removes a gallery item
func (s *PostgresStore) Delete(jobID string) error {
	_, err := s.db.Exec("DELETE FROM gallery_items WHERE job_id = $1", jobID)
	return err
}

// Count returns the total number of gallery items
func (s *PostgresStore) Count() int {
	var count int
	s.db.QueryRow("SELECT COUNT(*) FROM gallery_items").Scan(&count)
	return count
}

// Close closes the database connection
func (s *PostgresStore) Close() error {
	return s.db.Close()
}
