// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package gallery

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
)

// JobRecord is private broker state. It contains no request body or credential.
type JobRecord struct {
	ID, Owner, RequestID, RequestHash, Status string
	Payload                                   json.RawMessage
}

type PendingJobStore struct{ db *sql.DB }

func NewPendingJobStore(db *sql.DB) *PendingJobStore { return &PendingJobStore{db: db} }

func (s *PendingJobStore) FindRequest(ctx context.Context, owner, requestID string) (JobRecord, bool, error) {
	return scanJob(s.db.QueryRowContext(ctx, `SELECT job_id, owner, request_id, request_hash, status, payload
        FROM gallery_pending_jobs WHERE owner=$1 AND request_id=$2`, owner, requestID))
}

func (s *PendingJobStore) Get(ctx context.Context, id, owner string) (JobRecord, bool, error) {
	return scanJob(s.db.QueryRowContext(ctx, `SELECT job_id, owner, request_id, request_hash, status, payload
        FROM gallery_pending_jobs WHERE job_id=$1 AND owner=$2`, id, owner))
}

func scanJob(row *sql.Row) (JobRecord, bool, error) {
	var result JobRecord
	err := row.Scan(&result.ID, &result.Owner, &result.RequestID, &result.RequestHash, &result.Status, &result.Payload)
	if errors.Is(err, sql.ErrNoRows) {
		return result, false, nil
	}
	return result, err == nil, err
}

// Create elects one submitting handler per owner/request ID. Losing handlers
// read the winner, never dispatch. The caller must compare the request hash.
func (s *PendingJobStore) Create(ctx context.Context, job JobRecord) (JobRecord, bool, error) {
	var id string
	err := s.db.QueryRowContext(ctx, `INSERT INTO gallery_pending_jobs
        (job_id, owner, request_id, request_hash, status, payload) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (owner, request_id) DO NOTHING RETURNING job_id`,
		job.ID, job.Owner, job.RequestID, job.RequestHash, job.Status, []byte(job.Payload)).Scan(&id)
	if err == nil {
		return job, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return JobRecord{}, false, err
	}
	existing, found, err := s.FindRequest(ctx, job.Owner, job.RequestID)
	if err == nil && !found {
		err = errors.New("job registration disappeared")
	}
	return existing, false, err
}

func (s *PendingJobStore) Update(ctx context.Context, id, owner, status string, payload json.RawMessage) error {
	// A late timeout/failure cannot overwrite a recovered successful result.
	_, err := s.db.ExecContext(ctx, `UPDATE gallery_pending_jobs SET status=$3, payload=$4, updated_at=now()
        WHERE job_id=$1 AND owner=$2 AND status IN ('processing','uncertain')`, id, owner, status, []byte(payload))
	return err
}
