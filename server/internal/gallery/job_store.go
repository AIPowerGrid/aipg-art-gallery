package gallery

import (
	"database/sql"
	"strings"
	"time"
)

// GenerationJob represents a generation job in the database
type GenerationJob struct {
	ID            int64     `json:"id"`
	JobID         string    `json:"jobId"`
	WalletAddress string    `json:"walletAddress"`
	Status        string    `json:"status"` // queued, processing, completed, faulted
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
	Error         string    `json:"error,omitempty"`
}

// JobStore handles generation job database operations
type JobStore struct {
	db *sql.DB
}

// AddJob creates a new generation job record
func (s *JobStore) AddJob(walletAddress, jobID string) (*GenerationJob, error) {
	wallet := strings.ToLower(walletAddress)
	now := time.Now()

	query := `
		INSERT INTO generation_jobs (job_id, wallet_address, status, created_at, updated_at)
		VALUES ($1, $2, 'queued', $3, $3)
		RETURNING id, job_id, wallet_address, status, created_at, updated_at
	`

	var job GenerationJob
	err := s.db.QueryRow(query, jobID, wallet, now).Scan(
		&job.ID,
		&job.JobID,
		&job.WalletAddress,
		&job.Status,
		&job.CreatedAt,
		&job.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &job, nil
}

// UpdateJobStatus updates the status of a job
func (s *JobStore) UpdateJobStatus(jobID, status, errorMsg string) error {
	query := `
		UPDATE generation_jobs
		SET status = $1, error = $2, updated_at = $3
		WHERE job_id = $4
	`

	_, err := s.db.Exec(query, status, errorMsg, time.Now(), jobID)
	return err
}

// GetJobsByWallet retrieves all jobs for a wallet address
func (s *JobStore) GetJobsByWallet(walletAddress string, limit int) ([]GenerationJob, error) {
	wallet := strings.ToLower(walletAddress)

	query := `
		SELECT id, job_id, wallet_address, status, created_at, updated_at, COALESCE(error, '')
		FROM generation_jobs
		WHERE wallet_address = $1
		ORDER BY created_at DESC
		LIMIT $2
	`

	rows, err := s.db.Query(query, wallet, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []GenerationJob
	for rows.Next() {
		var job GenerationJob
		err := rows.Scan(
			&job.ID,
			&job.JobID,
			&job.WalletAddress,
			&job.Status,
			&job.CreatedAt,
			&job.UpdatedAt,
			&job.Error,
		)
		if err != nil {
			continue
		}
		jobs = append(jobs, job)
	}

	return jobs, nil
}

// GetPendingJobsByWallet retrieves pending (queued/processing) jobs for a wallet
func (s *JobStore) GetPendingJobsByWallet(walletAddress string) ([]GenerationJob, error) {
	wallet := strings.ToLower(walletAddress)

	query := `
		SELECT id, job_id, wallet_address, status, created_at, updated_at, COALESCE(error, '')
		FROM generation_jobs
		WHERE wallet_address = $1 AND status IN ('queued', 'processing')
		ORDER BY created_at DESC
	`

	rows, err := s.db.Query(query, wallet)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []GenerationJob
	for rows.Next() {
		var job GenerationJob
		err := rows.Scan(
			&job.ID,
			&job.JobID,
			&job.WalletAddress,
			&job.Status,
			&job.CreatedAt,
			&job.UpdatedAt,
			&job.Error,
		)
		if err != nil {
			continue
		}
		jobs = append(jobs, job)
	}

	return jobs, nil
}

// GetJob retrieves a single job by job ID
func (s *JobStore) GetJob(jobID string) (*GenerationJob, error) {
	query := `
		SELECT id, job_id, wallet_address, status, created_at, updated_at, COALESCE(error, '')
		FROM generation_jobs
		WHERE job_id = $1
	`

	var job GenerationJob
	err := s.db.QueryRow(query, jobID).Scan(
		&job.ID,
		&job.JobID,
		&job.WalletAddress,
		&job.Status,
		&job.CreatedAt,
		&job.UpdatedAt,
		&job.Error,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &job, nil
}
