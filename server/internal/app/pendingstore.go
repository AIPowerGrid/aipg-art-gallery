package app

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"slices"
	"sync"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/gallery"
)

// pendingStore owns the async broker lifecycle, not a scheduler. PostgreSQL
// persists production state; the local memory fallback permits preview only.
type pendingStore struct {
	mu      sync.RWMutex
	jobs    map[string]*pendingJob
	running map[string]bool
	ttl     time.Duration
	journal *gallery.PendingJobStore
}

type pendingJob struct {
	Status          string
	Kind            string
	ExpectedOutputs int
	Owner           string
	RequestID       string
	RequestHash     string
	Err             string
	Items           []aipg.GeneratedItem
	Grid            *aipg.GridMeta
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

var errRequestConflict = errors.New("request ID was already used with different generation settings")

func newPendingStore(ttl time.Duration) *pendingStore {
	return &pendingStore{jobs: make(map[string]*pendingJob), running: make(map[string]bool), ttl: ttl}
}

func (s *pendingStore) requestJobID(ctx context.Context, owner, requestID string, aliases ...string) (string, bool, error) {
	if s.journal != nil {
		row, found, err := s.journal.FindRequest(ctx, owner, requestID, aliases...)
		return row.ID, found, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	match := ""
	for id, job := range s.jobs {
		if (job.Owner == owner || slices.Contains(aliases, job.Owner)) && job.RequestID == requestID {
			if match != "" {
				return "", false, gallery.ErrAmbiguousRequest
			}
			match = id
		}
	}
	return match, match != "", nil
}

func (s *pendingStore) findRequest(ctx context.Context, owner, requestID, digest string, aliases ...string) (string, bool, error) {
	if s.journal != nil {
		row, found, err := s.journal.FindRequest(ctx, owner, requestID, aliases...)
		if err != nil || !found {
			return "", false, err
		}
		if row.RequestHash != digest {
			return "", false, errRequestConflict
		}
		return row.ID, true, nil
	}
	if len(aliases) > 0 {
		id, found, err := s.requestJobID(ctx, owner, requestID, aliases...)
		if err != nil || !found {
			return "", false, err
		}
		job, found, err := s.get(ctx, id, owner, aliases...)
		if err != nil || !found {
			return "", false, err
		}
		if job.RequestHash != digest {
			return "", false, errRequestConflict
		}
		return id, true, nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for id, job := range s.jobs {
		if job.Owner == owner && job.RequestID == requestID {
			if job.RequestHash != digest {
				return "", false, errRequestConflict
			}
			return id, true, nil
		}
	}
	return "", false, nil
}

func (s *pendingStore) create(ctx context.Context, requestID, digest, kind, owner string, outputs int) (string, bool, error) {
	id := newJobID()
	now := time.Now()
	job := pendingJob{Status: "processing", Kind: kind, Owner: owner,
		ExpectedOutputs: outputs, RequestID: requestID, RequestHash: digest, CreatedAt: now, UpdatedAt: now}
	if s.journal != nil {
		data, err := json.Marshal(job)
		if err != nil {
			return "", false, err
		}
		row, created, err := s.journal.Create(ctx, gallery.JobRecord{
			ID: id, Owner: owner, RequestID: requestID, RequestHash: digest, Status: job.Status, Payload: data})
		if err != nil {
			return "", false, err
		}
		if row.RequestHash != digest {
			return "", false, errRequestConflict
		}
		if created {
			s.mu.Lock()
			s.running[row.ID] = true
			s.mu.Unlock()
		}
		return row.ID, created, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for existingID, existing := range s.jobs {
		if existing.Owner == owner && existing.RequestID == requestID {
			if existing.RequestHash != digest {
				return "", false, errRequestConflict
			}
			return existingID, false, nil
		}
	}
	for oldID, old := range s.jobs {
		if now.Sub(old.UpdatedAt) > s.ttl {
			delete(s.jobs, oldID)
		}
	}
	s.jobs[id] = &job
	s.running[id] = true
	return id, true, nil
}

func (s *pendingStore) finish(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.running, id)
}

func (s *pendingStore) isRunning(id string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.running[id]
}

func (s *pendingStore) update(ctx context.Context, id string, job pendingJob) error {
	job.UpdatedAt = time.Now()
	if s.journal != nil {
		data, err := json.Marshal(job)
		if err != nil {
			return err
		}
		return s.journal.Update(ctx, id, job.Owner, job.Status, data)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if old, ok := s.jobs[id]; ok && old.Owner == job.Owner && (old.Status == "processing" || old.Status == "uncertain") {
		s.jobs[id] = &job
	}
	return nil
}

func (s *pendingStore) get(ctx context.Context, id, owner string, aliases ...string) (pendingJob, bool, error) {
	if s.journal != nil {
		row, found, err := s.journal.Get(ctx, id, owner, aliases...)
		if err != nil || !found {
			return pendingJob{}, false, err
		}
		var job pendingJob
		if err := json.Unmarshal(row.Payload, &job); err != nil {
			return job, false, err
		}
		// Indexed authority wins over mutable JSON metadata.
		job.Owner, job.Status = row.Owner, row.Status
		job.RequestID, job.RequestHash = row.RequestID, row.RequestHash
		return job, true, nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	job, ok := s.jobs[id]
	if !ok || (job.Owner != owner && !slices.Contains(aliases, job.Owner)) {
		return pendingJob{}, false, nil
	}
	return *job, true, nil
}

func newJobID() string {
	var b [16]byte
	// Go 1.25 crypto/rand.Read fills the buffer or terminates on entropy failure.
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
