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

// DB returns the underlying database connection
func (s *PostgresStore) DB() *sql.DB {
	return s.db
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

	// Set connection pool settings (scaled for production)
	db.SetMaxOpenConns(100)      // Max connections (up from 25)
	db.SetMaxIdleConns(25)       // Keep 25 ready to go (up from 5)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute) // Close idle connections after 2 min

	store := &PostgresStore{
		db:        db,
		UserStore: &UserStore{db: db},
		JobStore:  &JobStore{db: db},
	}

	return store, nil
}

// parseMediaURLs parses the media_url field which can be either:
// - A single URL string (legacy format)
// - A JSON array of URLs (batch format)
func parseMediaURLs(mediaURL string) []string {
	if mediaURL == "" {
		return []string{}
	}
	
	// Try parsing as JSON array first
	if strings.HasPrefix(mediaURL, "[") {
		var urls []string
		if err := json.Unmarshal([]byte(mediaURL), &urls); err == nil {
			return urls
		}
	}
	
	// Fall back to single URL (legacy format)
	return []string{mediaURL}
}

// encodeMediaURLs encodes media URLs for storage
func encodeMediaURLs(urls []string) string {
	if len(urls) == 0 {
		return ""
	}
	if len(urls) == 1 {
		return urls[0] // Single URL stored as-is for backwards compat
	}
	// Multiple URLs stored as JSON array
	data, _ := json.Marshal(urls)
	return string(data)
}

// Add inserts a new gallery item
func (s *PostgresStore) Add(item GalleryItem) error {
	// Encode media URLs (single or multiple)
	mediaURL := encodeMediaURLs(item.MediaURLs)

	// Extract params
	var width, height, steps *int
	var cfgScale *float64
	var sampler, scheduler, seed *string

	if item.Params != nil {
		width = item.Params.Width
		height = item.Params.Height
		steps = item.Params.Steps
		cfgScale = item.Params.CfgScale
		sampler = item.Params.Sampler
		scheduler = item.Params.Scheduler
		seed = item.Params.Seed
	}

	query := `
		INSERT INTO gallery_items (
			job_id, model, prompt, negative_prompt,
			media_url, is_public, wallet_address,
			width, height, steps, cfg_scale, sampler, scheduler, seed,
			type, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
		ON CONFLICT (job_id) DO UPDATE SET
			media_url = EXCLUDED.media_url,
			is_public = EXCLUDED.is_public,
			type = EXCLUDED.type
	`

	createdAt := time.UnixMilli(item.CreatedAt)
	if item.CreatedAt == 0 {
		createdAt = time.Now()
	}

	itemType := item.Type
	if itemType == "" {
		itemType = "image"
	}

	_, err := s.db.Exec(query,
		item.JobID,
		item.ModelName, // Use ModelName as 'model'
		item.Prompt,
		item.NegativePrompt,
		mediaURL,
		item.IsPublic,
		strings.ToLower(item.WalletAddress),
		width, height, steps, cfgScale, sampler, scheduler, seed,
		itemType,
		createdAt,
	)

	return err
}

// Get retrieves a single gallery item by job ID
func (s *PostgresStore) Get(jobID string) *GalleryItem {
	query := `
		SELECT job_id, model, prompt, negative_prompt,
			   media_url, is_public, wallet_address,
			   width, height, steps, cfg_scale, sampler, scheduler, seed,
			   created_at
		FROM gallery_items
		WHERE job_id = $1
	`

	var item GalleryItem
	var mediaURL string
	var walletAddr, model, prompt, negPrompt sql.NullString
	var createdAt time.Time
	var width, height, steps sql.NullInt64
	var cfgScale sql.NullFloat64
	var sampler, scheduler, seed sql.NullString

	err := s.db.QueryRow(query, jobID).Scan(
		&item.JobID,
		&model,
		&prompt,
		&negPrompt,
		&mediaURL,
		&item.IsPublic,
		&walletAddr,
		&width, &height, &steps, &cfgScale, &sampler, &scheduler, &seed,
		&createdAt,
	)

	if err != nil {
		return nil
	}

	if model.Valid {
		item.ModelName = model.String
		item.ModelID = model.String
	}
	if prompt.Valid {
		item.Prompt = prompt.String
	}
	if negPrompt.Valid {
		item.NegativePrompt = negPrompt.String
	}
	item.MediaURLs = parseMediaURLs(mediaURL)
	item.CreatedAt = createdAt.UnixMilli()
	item.Type = "image" // Default to image

	if walletAddr.Valid {
		item.WalletAddress = walletAddr.String
	}

	// Build params struct
	item.Params = &JobParams{}
	if width.Valid {
		w := int(width.Int64)
		item.Params.Width = &w
	}
	if height.Valid {
		h := int(height.Int64)
		item.Params.Height = &h
	}
	if steps.Valid {
		st := int(steps.Int64)
		item.Params.Steps = &st
	}
	if cfgScale.Valid {
		item.Params.CfgScale = &cfgScale.Float64
	}
	if sampler.Valid {
		item.Params.Sampler = &sampler.String
	}
	if scheduler.Valid {
		item.Params.Scheduler = &scheduler.String
	}
	if seed.Valid {
		item.Params.Seed = &seed.String
	}

	return &item
}

// ListModels returns unique model names from the gallery
func (s *PostgresStore) ListModels() []string {
	models := make([]string, 0)
	rows, err := s.db.Query(`
		SELECT DISTINCT model 
		FROM gallery_items 
		WHERE is_public = true AND model IS NOT NULL AND model != ''
		ORDER BY model
	`)
	if err != nil {
		log.Printf("Error querying models: %v", err)
		return models
	}
	defer rows.Close()

	for rows.Next() {
		var model string
		if err := rows.Scan(&model); err == nil {
			models = append(models, model)
		}
	}
	return models
}

// List returns paginated gallery items with optional filtering
func (s *PostgresStore) List(typeFilter string, limit, offset int, searchQuery string) ListResult {
	return s.ListAdvanced(typeFilter, limit, offset, searchQuery, nil, "", "")
}

// ListAdvanced returns paginated gallery items with advanced filtering options
func (s *PostgresStore) ListAdvanced(typeFilter string, limit, offset int, searchQuery string, models []string, aspectRatio string, nsfwFilter string) ListResult {
	items := make([]GalleryItem, 0) // Initialize to empty array, not nil
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
		// Split search query into words and match each with word boundaries
		// This allows "man woman" to match prompts containing either "man" OR "woman"
		words := strings.Fields(strings.ToLower(searchQuery))
		if len(words) > 0 {
			// Create OR pattern: \m(word1|word2|word3)\M
			escapedWords := make([]string, len(words))
			for i, word := range words {
				// Escape special regex characters
				escapedWords[i] = strings.ReplaceAll(word, ".", "\\.")
			}
			pattern := fmt.Sprintf("\\m(%s)\\M", strings.Join(escapedWords, "|"))
			whereClauses = append(whereClauses, fmt.Sprintf("prompt ~* $%d", argNum))
			args = append(args, pattern)
			argNum++
		}
	}

	// Model filter (multi-select)
	if len(models) > 0 {
		placeholders := make([]string, len(models))
		for i, model := range models {
			placeholders[i] = fmt.Sprintf("$%d", argNum)
			args = append(args, model)
			argNum++
		}
		whereClauses = append(whereClauses, fmt.Sprintf("model IN (%s)", strings.Join(placeholders, ", ")))
	}

	// Aspect ratio filter
	if aspectRatio != "" {
		switch aspectRatio {
		case "square":
			whereClauses = append(whereClauses, "width = height")
		case "landscape":
			whereClauses = append(whereClauses, "width > height")
		case "portrait":
			whereClauses = append(whereClauses, "width < height")
		}
	}

	// NSFW filter
	if nsfwFilter != "" {
		switch nsfwFilter {
		case "sfw":
			whereClauses = append(whereClauses, "(is_nsfw = false OR is_nsfw IS NULL)")
		case "nsfw":
			whereClauses = append(whereClauses, "is_nsfw = true")
		}
	}

	whereClause := strings.Join(whereClauses, " AND ")

	// Get total count
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM gallery_items WHERE %s", whereClause)
	var total int
	s.db.QueryRow(countQuery, args...).Scan(&total)

	// Get items ordered by pre-computed random sort (shuffled every 5 min via cron)
	query := fmt.Sprintf(`
		SELECT job_id, model, prompt, negative_prompt,
			   media_url, is_public, wallet_address,
			   width, height, steps, cfg_scale, sampler, scheduler, seed,
			   type, created_at
		FROM gallery_items
		WHERE %s
		ORDER BY random_sort
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
		var mediaURL string
		var walletAddr, prompt, negPrompt, model sql.NullString
		var itemType sql.NullString
		var createdAt time.Time
		var width, height, steps sql.NullInt64
		var cfgScale sql.NullFloat64
		var sampler, scheduler, seed sql.NullString

		err := rows.Scan(
			&item.JobID,
			&model,
			&prompt,
			&negPrompt,
			&mediaURL,
			&item.IsPublic,
			&walletAddr,
			&width, &height, &steps, &cfgScale, &sampler, &scheduler, &seed,
			&itemType,
			&createdAt,
		)

		if err != nil {
			log.Printf("Error scanning gallery item: %v", err)
			continue
		}

		if model.Valid {
			item.ModelName = model.String
			item.ModelID = model.String
		}
		if prompt.Valid {
			item.Prompt = prompt.String
		}
		if negPrompt.Valid {
			item.NegativePrompt = negPrompt.String
		}
		item.MediaURLs = parseMediaURLs(mediaURL)
		item.CreatedAt = createdAt.UnixMilli()
		
		// Set type from database, defaulting to "image" if not set
		if itemType.Valid && itemType.String != "" {
			item.Type = itemType.String
		} else {
			item.Type = "image"
		}

		if walletAddr.Valid {
			item.WalletAddress = walletAddr.String
		}

		// Build params struct
		item.Params = &JobParams{}
		if width.Valid {
			w := int(width.Int64)
			item.Params.Width = &w
		}
		if height.Valid {
			h := int(height.Int64)
			item.Params.Height = &h
		}
		if steps.Valid {
			st := int(steps.Int64)
			item.Params.Steps = &st
		}
		if cfgScale.Valid {
			item.Params.CfgScale = &cfgScale.Float64
		}
		if sampler.Valid {
			item.Params.Sampler = &sampler.String
		}
		if scheduler.Valid {
			item.Params.Scheduler = &scheduler.String
		}
		if seed.Valid {
			item.Params.Seed = &seed.String
		}

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
	items := make([]GalleryItem, 0) // Initialize to empty array, not nil

	query := `
		SELECT job_id, model, prompt, negative_prompt,
			   media_url, is_public, wallet_address,
			   width, height, steps, cfg_scale, sampler, scheduler, seed,
			   created_at
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
		var mediaURL string
		var walletAddr, model, prompt, negPrompt sql.NullString
		var createdAt time.Time
		var width, height, steps sql.NullInt64
		var cfgScale sql.NullFloat64
		var sampler, scheduler, seed sql.NullString

		err := rows.Scan(
			&item.JobID,
			&model,
			&prompt,
			&negPrompt,
			&mediaURL,
			&item.IsPublic,
			&walletAddr,
			&width, &height, &steps, &cfgScale, &sampler, &scheduler, &seed,
			&createdAt,
		)

		if err != nil {
			continue
		}

		if model.Valid {
			item.ModelName = model.String
			item.ModelID = model.String
		}
		if prompt.Valid {
			item.Prompt = prompt.String
		}
		if negPrompt.Valid {
			item.NegativePrompt = negPrompt.String
		}
		item.MediaURLs = parseMediaURLs(mediaURL)
		item.CreatedAt = createdAt.UnixMilli()
		item.Type = "image"

		if walletAddr.Valid {
			item.WalletAddress = walletAddr.String
		}

		// Build params struct
		item.Params = &JobParams{}
		if width.Valid {
			w := int(width.Int64)
			item.Params.Width = &w
		}
		if height.Valid {
			h := int(height.Int64)
			item.Params.Height = &h
		}
		if steps.Valid {
			st := int(steps.Int64)
			item.Params.Steps = &st
		}
		if cfgScale.Valid {
			item.Params.CfgScale = &cfgScale.Float64
		}
		if sampler.Valid {
			item.Params.Sampler = &sampler.String
		}
		if scheduler.Valid {
			item.Params.Scheduler = &scheduler.String
		}
		if seed.Valid {
			item.Params.Seed = &seed.String
		}

		items = append(items, item)
	}

	return items
}

// Delete removes a gallery item
func (s *PostgresStore) Delete(jobID string) error {
	_, err := s.db.Exec("DELETE FROM gallery_items WHERE job_id = $1", jobID)
	return err
}

// SetPublic updates the is_public flag for a gallery item
func (s *PostgresStore) SetPublic(jobID string, isPublic bool) error {
	_, err := s.db.Exec("UPDATE gallery_items SET is_public = $1 WHERE job_id = $2", isPublic, jobID)
	return err
}

// UpdateMediaURLs updates the media URLs for a gallery item (stores as JSON array)
func (s *PostgresStore) UpdateMediaURLs(jobID string, mediaURLs []string) error {
	if len(mediaURLs) == 0 {
		return nil // Nothing to update
	}
	// Store multiple URLs as JSON array for batch support
	urlsJSON, err := json.Marshal(mediaURLs)
	if err != nil {
		return fmt.Errorf("failed to marshal media URLs: %w", err)
	}
	_, err = s.db.Exec("UPDATE gallery_items SET media_url = $1 WHERE job_id = $2", string(urlsJSON), jobID)
	return err
}

// UpdateGalleryItemMedia updates media URLs, seeds, and other settings for a gallery item
func (s *PostgresStore) UpdateGalleryItemMedia(jobID string, mediaURLs, seeds []string, sampler, scheduler string) error {
	if len(mediaURLs) == 0 {
		return nil // Nothing to update
	}

	// Store multiple URLs as JSON array for batch support
	urlsJSON, err := json.Marshal(mediaURLs)
	if err != nil {
		return fmt.Errorf("failed to marshal media URLs: %w", err)
	}

	// Store seeds: JSON array for multiple, single string for one
	var seedStr string
	if len(seeds) > 1 {
		seedJSON, err := json.Marshal(seeds)
		if err != nil {
			return fmt.Errorf("failed to marshal seeds: %w", err)
		}
		seedStr = string(seedJSON)
	} else if len(seeds) == 1 {
		seedStr = seeds[0]
	}

	// Build the query dynamically based on what we have
	query := "UPDATE gallery_items SET media_url = $1"
	args := []any{string(urlsJSON)}
	argNum := 2

	if seedStr != "" {
		query += fmt.Sprintf(", seed = $%d", argNum)
		args = append(args, seedStr)
		argNum++
	}
	if sampler != "" {
		query += fmt.Sprintf(", sampler = $%d", argNum)
		args = append(args, sampler)
		argNum++
	}
	if scheduler != "" {
		query += fmt.Sprintf(", scheduler = $%d", argNum)
		args = append(args, scheduler)
		argNum++
	}

	query += fmt.Sprintf(" WHERE job_id = $%d", argNum)
	args = append(args, jobID)

	_, err = s.db.Exec(query, args...)
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
