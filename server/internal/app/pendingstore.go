package app

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
)

// pendingStore bridges the gallery's async POST /jobs + poll GET /jobs/{id}
// contract onto the new grid's *synchronous* /v1 generation endpoints.
//
// handleCreateJob creates an entry, returns its id immediately, and runs the
// (blocking) grid call in a goroutine. handleJobStatus reads the entry back.
// Entries are kept in memory only — they exist just long enough for the
// frontend to poll the result, then a TTL sweep drops them. Persisting a
// finished generation to the gallery is a separate, frontend-driven call
// (handleAddToGallery), so nothing important is lost when an entry expires.
type pendingStore struct {
	mu   sync.RWMutex
	jobs map[string]*pendingJob
	ttl  time.Duration
}

type pendingJob struct {
	Status    string // "processing" | "completed" | "faulted"
	Kind      string // "image" | "video" | "3d"
	Prompt    string
	Owner     string
	Err       string
	Items     []aipg.GeneratedItem
	Grid      *aipg.GridMeta // per-job provenance (worker, gen time) from the grid
	CreatedAt time.Time
	UpdatedAt time.Time
}

func newPendingStore(ttl time.Duration) *pendingStore {
	return &pendingStore{
		jobs: make(map[string]*pendingJob),
		ttl:  ttl,
	}
}

// create registers a new in-flight job and returns its opaque id.
func (s *pendingStore) create(kind, prompt, owner string) string {
	id := newJobID()
	now := time.Now()
	s.mu.Lock()
	s.gcLocked(now)
	s.jobs[id] = &pendingJob{
		Status:    "processing",
		Kind:      kind,
		Prompt:    prompt,
		Owner:     owner,
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.mu.Unlock()
	return id
}

func (s *pendingStore) complete(id string, items []aipg.GeneratedItem, grid *aipg.GridMeta) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if j, ok := s.jobs[id]; ok {
		j.Status = "completed"
		j.Items = items
		j.Grid = grid
		j.UpdatedAt = time.Now()
	}
}

func (s *pendingStore) fail(id, errMsg string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if j, ok := s.jobs[id]; ok {
		j.Status = "faulted"
		j.Err = errMsg
		j.UpdatedAt = time.Now()
	}
}

// get returns a copy of the job state so callers never touch the live struct.
func (s *pendingStore) get(id string) (pendingJob, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	j, ok := s.jobs[id]
	if !ok {
		return pendingJob{}, false
	}
	return *j, true
}

// gcLocked drops entries older than the TTL. Caller must hold the write lock.
func (s *pendingStore) gcLocked(now time.Time) {
	for id, j := range s.jobs {
		if now.Sub(j.UpdatedAt) > s.ttl {
			delete(s.jobs, id)
		}
	}
}

// newJobID returns a random 128-bit hex id. crypto/rand never realistically
// fails on these platforms; if it ever did, a zeroed id is still unique enough
// for a short-lived in-memory map and the generation result is unaffected.
func newJobID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
