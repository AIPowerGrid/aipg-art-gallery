// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package videosource

import (
	"context"
	"errors"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

const MaxSourceUploadBytes int64 = 512 * 1024 * 1024
const UploadChunkBytes int64 = 8 * 1024 * 1024
const uploadTTL = 15 * time.Minute
const uploadIdleTTL = 90 * time.Second
const uploadDiskFloor uint64 = 1024 * 1024 * 1024

var ErrUploadNotFound = errors.New("Source upload expired or is unavailable. Select the file again.")
var ErrUploadOrder = errors.New("Source upload is incomplete or out of order. Select the file again.")
var ErrUploadSize = errors.New("Choose one source file between 1 byte and 512 MiB.")

type upload struct {
	mu               sync.Mutex
	owner, directory string
	size, offset     int64
	options          Options
	expires          time.Time
	idleUntil        time.Time
	consumed         bool
	timer            *time.Timer
}

// Uploads is intentionally ephemeral: uploads never become generation receipts.
// Production's PrivateTmp removes crash leftovers when the service stops.
type Uploads struct {
	mu    sync.Mutex
	items map[string]*upload
	now   func() time.Time
	space func(string) (uint64, error)
}

func NewUploads() *Uploads {
	return &Uploads{items: make(map[string]*upload), now: time.Now, space: freeDiskBytes}
}

type UploadTicket struct {
	ID         string    `json:"uploadId"`
	ChunkBytes int64     `json:"chunkBytes"`
	Size       int64     `json:"size"`
	Expires    time.Time `json:"expiresAt"`
}

func (s *Uploads) Start(owner string, size int64, options Options) (UploadTicket, error) {
	if owner == "" || size <= 0 || size > MaxSourceUploadBytes || !options.Valid() {
		return UploadTicket{}, ErrUploadSize
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var reserved uint64
	for _, item := range s.items {
		if item.owner == owner {
			return UploadTicket{}, ErrBusy
		}
		reserved += uint64(item.size)
	}
	if len(s.items) >= 2 {
		return UploadTicket{}, ErrBusy
	}
	free, err := s.space(os.TempDir())
	if err != nil || free < uploadDiskFloor+reserved+uint64(size) {
		return UploadTicket{}, ErrBusy
	}
	directory, err := os.MkdirTemp("", "gallery-source-upload-")
	if err != nil {
		return UploadTicket{}, ErrBusy
	}
	file, err := os.OpenFile(filepath.Join(directory, "upload"), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		_ = os.RemoveAll(directory)
		return UploadTicket{}, ErrBusy
	}
	if err := file.Close(); err != nil {
		_ = os.RemoveAll(directory)
		return UploadTicket{}, ErrBusy
	}
	id := uuid.NewString()
	now := s.now()
	item := &upload{owner: owner, directory: directory, size: size, options: options, expires: now.Add(uploadTTL), idleUntil: now.Add(uploadIdleTTL)}
	s.items[id] = item
	item.timer = time.AfterFunc(uploadIdleTTL, func() { s.expire(id, item) })
	return UploadTicket{ID: id, ChunkBytes: UploadChunkBytes, Size: size, Expires: item.expires}, nil
}

// Acquire locks one upload without holding the global lock during network I/O.
func (s *Uploads) acquire(owner, id string) (*upload, error) {
	s.mu.Lock()
	item := s.items[id]
	s.mu.Unlock()
	if item == nil || owner == "" || item.owner != owner {
		return nil, ErrUploadNotFound
	}
	item.mu.Lock()
	s.mu.Lock()
	current := s.items[id] == item
	s.mu.Unlock()
	if !current || item.consumed || !s.now().Before(item.expires) || !s.now().Before(item.idleUntil) {
		item.mu.Unlock()
		return nil, ErrUploadNotFound
	}
	return item, nil
}

// A timer racing a successful chunk must recheck the refreshed idle deadline.
func (s *Uploads) expire(id string, item *upload) {
	item.mu.Lock()
	defer item.mu.Unlock()
	s.mu.Lock()
	current := s.items[id] == item
	s.mu.Unlock()
	if !current {
		return
	}
	deadline := item.idleUntil
	if item.expires.Before(deadline) {
		deadline = item.expires
	}
	remaining := deadline.Sub(s.now())
	if remaining > 0 {
		item.timer.Reset(remaining)
		return
	}
	s.discard(id, item)
}

func (s *Uploads) discard(id string, item *upload) {
	item.timer.Stop()
	if err := os.RemoveAll(item.directory); err != nil {
		log.Print("Source upload cleanup deferred; reservation retained")
		item.timer = time.AfterFunc(time.Minute, func() { s.Delete(item.owner, id) })
		return
	}
	s.mu.Lock()
	delete(s.items, id)
	s.mu.Unlock()
}

func (s *Uploads) Delete(owner, id string) {
	// Expired entries must also be removable by the timer.
	s.mu.Lock()
	item := s.items[id]
	s.mu.Unlock()
	if item == nil || item.owner != owner {
		return
	}
	item.mu.Lock()
	defer item.mu.Unlock()
	s.mu.Lock()
	current := s.items[id] == item
	s.mu.Unlock()
	if current {
		s.discard(id, item)
	}
}

func (s *Uploads) Append(owner, id string, offset int64, body io.Reader) (int64, error) {
	item, err := s.acquire(owner, id)
	if err != nil {
		return 0, err
	}
	defer item.mu.Unlock()
	if offset != item.offset || item.offset == item.size {
		return 0, ErrUploadOrder
	}
	want := min(UploadChunkBytes, item.size-item.offset)
	file, err := os.OpenFile(filepath.Join(item.directory, "upload"), os.O_WRONLY|os.O_APPEND, 0)
	if err != nil {
		s.discard(id, item)
		return 0, ErrUploadNotFound
	}
	n, copyErr := io.Copy(file, io.LimitReader(body, want+1))
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil || n != want {
		s.discard(id, item)
		return 0, ErrUploadOrder
	}
	item.offset += n
	item.idleUntil = s.now().Add(uploadIdleTTL)
	remaining := min(uploadIdleTTL, item.expires.Sub(s.now()))
	item.timer.Reset(max(time.Millisecond, remaining))
	return item.offset, nil
}

func (s *Uploads) Prepare(ctx context.Context, owner, id string) (Prepared, error) {
	item, err := s.acquire(owner, id)
	if err != nil {
		return Prepared{}, err
	}
	defer item.mu.Unlock()
	if item.offset != item.size {
		return Prepared{}, ErrUploadOrder
	}
	select {
	case slots <- struct{}{}:
		defer func() { <-slots }()
	default:
		return Prepared{}, ErrBusy
	}
	item.consumed = true
	defer s.discard(id, item)
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	return prepareFile(ctx, filepath.Join(item.directory, "upload"), item.options)
}
