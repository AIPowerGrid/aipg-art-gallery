package gallery

import (
	"database/sql"
	"log"
	"strings"
	"time"
)

type Favorite struct {
	ID            int       `json:"id"`
	WalletAddress string    `json:"walletAddress"`
	JobID         string    `json:"jobId"`
	CreatedAt     time.Time `json:"createdAt"`
}

type FavoritesStore struct {
	db *sql.DB
}

func NewFavoritesStore(db *sql.DB) *FavoritesStore {
	return &FavoritesStore{db: db}
}

// AddFavorite adds a job to user's favorites
func (s *FavoritesStore) Add(wallet, jobID string) error {
	query := `
		INSERT INTO favorites (wallet_address, job_id)
		VALUES ($1, $2)
		ON CONFLICT (wallet_address, job_id) DO NOTHING
	`
	_, err := s.db.Exec(query, strings.ToLower(wallet), jobID)
	return err
}

// RemoveFavorite removes a job from user's favorites
func (s *FavoritesStore) Remove(wallet, jobID string) error {
	query := `DELETE FROM favorites WHERE LOWER(wallet_address) = LOWER($1) AND job_id = $2`
	_, err := s.db.Exec(query, wallet, jobID)
	return err
}

// IsFavorited checks if a job is favorited by a user
func (s *FavoritesStore) IsFavorited(wallet, jobID string) bool {
	query := `SELECT 1 FROM favorites WHERE LOWER(wallet_address) = LOWER($1) AND job_id = $2`
	var exists int
	err := s.db.QueryRow(query, wallet, jobID).Scan(&exists)
	return err == nil
}

// GetFavoriteJobIDs returns all job IDs favorited by a user
func (s *FavoritesStore) GetFavoriteJobIDs(wallet string) []string {
	query := `SELECT job_id FROM favorites WHERE LOWER(wallet_address) = LOWER($1) ORDER BY created_at DESC`
	rows, err := s.db.Query(query, wallet)
	if err != nil {
		log.Printf("Error getting favorites: %v", err)
		return []string{}
	}
	defer rows.Close()

	var jobIDs []string
	for rows.Next() {
		var jobID string
		if err := rows.Scan(&jobID); err == nil {
			jobIDs = append(jobIDs, jobID)
		}
	}
	return jobIDs
}

// GetFavoritedItems returns full gallery items that are favorited by a user
func (s *FavoritesStore) GetFavoritedItems(wallet string, limit int) []GalleryItem {
	query := `
		SELECT g.job_id, g.model, g.prompt, g.negative_prompt,
			   g.media_url, g.is_public, g.wallet_address,
			   g.width, g.height, g.steps, g.cfg_scale, g.sampler, g.scheduler, g.seed,
			   g.created_at
		FROM gallery_items g
		INNER JOIN favorites f ON g.job_id = f.job_id
		WHERE LOWER(f.wallet_address) = LOWER($1)
		ORDER BY f.created_at DESC
		LIMIT $2
	`

	rows, err := s.db.Query(query, wallet, limit)
	if err != nil {
		log.Printf("Error getting favorited items: %v", err)
		return []GalleryItem{}
	}
	defer rows.Close()

	items := make([]GalleryItem, 0)
	for rows.Next() {
		var item GalleryItem
		var mediaURL string
		var walletAddr, model, prompt, negPrompt sql.NullString
		var width, height, steps sql.NullInt64
		var cfgScale sql.NullFloat64
		var sampler, scheduler, seed sql.NullString
		var createdAt time.Time

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
		}
		if prompt.Valid {
			item.Prompt = prompt.String
		}
		if negPrompt.Valid {
			item.NegativePrompt = negPrompt.String
		}
		if walletAddr.Valid {
			item.WalletAddress = walletAddr.String
		}

		// Parse media URLs
		if mediaURL != "" {
			item.MediaURLs = strings.Split(mediaURL, ",")
		}

		// Set params
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
			cfg := cfgScale.Float64
			item.Params.CfgScale = &cfg
		}
		if sampler.Valid {
			s := sampler.String
			item.Params.Sampler = &s
		}
		if scheduler.Valid {
			sch := scheduler.String
			item.Params.Scheduler = &sch
		}
		if seed.Valid {
			sd := seed.String
			item.Params.Seed = &sd
		}

		item.CreatedAt = createdAt.UnixMilli()
		item.Type = "image"

		items = append(items, item)
	}

	return items
}
