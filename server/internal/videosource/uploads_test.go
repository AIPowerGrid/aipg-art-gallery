// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package videosource

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func uploadStore(t *testing.T) *Uploads {
	t.Helper()
	s := NewUploads()
	s.space = func(string) (uint64, error) { return 10 * uploadDiskFloor, nil }
	t.Cleanup(func() {
		for id, item := range s.items {
			s.Delete(item.owner, id)
		}
	})
	return s
}

func uploadOptions() Options { return Options{Mode: "audio", Frames: 33, Width: 512, Height: 512} }

func TestUploadOwnerOrderBoundsAndCleanup(t *testing.T) {
	s := uploadStore(t)
	ticket, err := s.Start("owner", 3, uploadOptions())
	if err != nil || ticket.ChunkBytes != UploadChunkBytes || ticket.Size != 3 {
		t.Fatal(ticket, err)
	}
	directory := s.items[ticket.ID].directory
	info, err := os.Stat(directory)
	if err != nil || info.Mode().Perm() != 0o700 {
		t.Fatal("upload directory not private")
	}
	info, err = os.Stat(filepath.Join(directory, "upload"))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatal("upload file not private")
	}
	if _, err := s.Append("stranger", ticket.ID, 0, bytes.NewReader([]byte("abc"))); err != ErrUploadNotFound {
		t.Fatal(err)
	}
	s.Delete("stranger", ticket.ID)
	if _, err := s.Append("owner", ticket.ID, 1, bytes.NewReader([]byte("abc"))); err != ErrUploadOrder {
		t.Fatal(err)
	}
	if n, err := s.Append("owner", ticket.ID, 0, bytes.NewReader([]byte("abc"))); err != nil || n != 3 {
		t.Fatal(n, err)
	}
	if _, err := s.Append("owner", ticket.ID, 0, bytes.NewReader([]byte("abc"))); err != ErrUploadOrder {
		t.Fatal("duplicate chunk appended")
	}
	data, _ := os.ReadFile(filepath.Join(directory, "upload"))
	if string(data) != "abc" {
		t.Fatal("wrong source bytes")
	}
	if _, err := s.Prepare(context.Background(), "stranger", ticket.ID); err != ErrUploadNotFound {
		t.Fatal(err)
	}
	s.Delete("owner", ticket.ID)
	if _, err := os.Stat(directory); !errors.Is(err, os.ErrNotExist) || len(s.items) != 0 {
		t.Fatal("source not removed")
	}
	s.Delete("owner", ticket.ID)
}

func TestUploadTruncationAndOverflowDiscardPrivateFiles(t *testing.T) {
	for _, data := range []string{"ab", "abcd"} {
		s := uploadStore(t)
		ticket, _ := s.Start("owner", 3, uploadOptions())
		dir := s.items[ticket.ID].directory
		if _, err := s.Append("owner", ticket.ID, 0, bytes.NewBufferString(data)); err != ErrUploadOrder {
			t.Fatal(err)
		}
		if _, err := os.Stat(dir); !errors.Is(err, os.ErrNotExist) || len(s.items) != 0 {
			t.Fatal("failed upload retained")
		}
	}
}

func TestUploadResourceReservationAndFixedExpiry(t *testing.T) {
	s := uploadStore(t)
	for _, size := range []int64{-1, 0, MaxSourceUploadBytes + 1} {
		if _, err := s.Start("owner", size, uploadOptions()); err != ErrUploadSize {
			t.Fatal(err)
		}
	}
	s.space = func(string) (uint64, error) { return uploadDiskFloor + uint64(MaxSourceUploadBytes) - 1, nil }
	if _, err := s.Start("owner", MaxSourceUploadBytes, uploadOptions()); err != ErrBusy {
		t.Fatal("disk floor ignored")
	}
	s.space = func(string) (uint64, error) { return uploadDiskFloor + uint64(MaxSourceUploadBytes), nil }
	ticket, err := s.Start("owner", MaxSourceUploadBytes, uploadOptions())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Start("other", 1, uploadOptions()); err != ErrBusy {
		t.Fatal("unwritten reservation ignored")
	}
	if _, err := s.Start("owner", 1, uploadOptions()); err != ErrBusy {
		t.Fatal("parallel uploads by one owner")
	}
	s.space = func(string) (uint64, error) { return 10 * uploadDiskFloor, nil }
	other, err := s.Start("other", 1, uploadOptions())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Start("third", 1, uploadOptions()); err != ErrBusy {
		t.Fatal("global slot limit ignored")
	}
	s.Delete("other", other.ID)
	s.now = func() time.Time { return ticket.Expires }
	if _, err := s.Append("owner", ticket.ID, 0, bytes.NewReader(nil)); err != ErrUploadNotFound {
		t.Fatal("expired upload accepted")
	}
	s.Delete("owner", ticket.ID)
	if len(s.items) != 0 {
		t.Fatal("expired upload not removable")
	}
}

func TestUploadConcurrentChunksNeverDuplicateBytes(t *testing.T) {
	s := uploadStore(t)
	ticket, _ := s.Start("owner", 3, uploadOptions())
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wg.Go(func() { _, err := s.Append("owner", ticket.ID, 0, bytes.NewBufferString("abc")); results <- err })
	}
	wg.Wait()
	close(results)
	accepted := 0
	for err := range results {
		if err == nil {
			accepted++
		} else if err != ErrUploadOrder {
			t.Fatal(err)
		}
	}
	if accepted != 1 {
		t.Fatal("duplicate concurrent chunk accepted")
	}
}

func TestUploadIdleTimeoutCannotBeExtendedPastAbsoluteDeadline(t *testing.T) {
	s := uploadStore(t)
	now := time.Now()
	s.now = func() time.Time { return now }
	ticket, _ := s.Start("owner", UploadChunkBytes+1, uploadOptions())
	item := s.items[ticket.ID]
	now = now.Add(80 * time.Second)
	if _, err := s.Append("owner", ticket.ID, 0, io.LimitReader(zeroReader{}, UploadChunkBytes)); err != nil {
		t.Fatal(err)
	}
	// An already-fired old timer cannot delete a recently extended upload.
	s.expire(ticket.ID, item)
	if s.items[ticket.ID] != item || !ticket.Expires.Equal(item.expires) {
		t.Fatal("timer lost active upload or extended fixed expiry")
	}
	now = now.Add(uploadIdleTTL)
	if _, err := s.Append("owner", ticket.ID, UploadChunkBytes, bytes.NewBufferString("x")); err != ErrUploadNotFound {
		t.Fatal("idle upload accepted")
	}
	s.expire(ticket.ID, item)
	if len(s.items) != 0 {
		t.Fatal("idle bytes retained")
	}
}

func TestLargeVideoUsesSameBoundedUploadAndCodecPath(t *testing.T) {
	s := uploadStore(t)
	video := fixture(t, true, true)
	padding := make([]byte, 8)
	binary.BigEndian.PutUint32(padding, 65*1024*1024+8)
	copy(padding[4:], "free")
	size := int64(len(video) + len(padding) + 65*1024*1024)
	options := uploadOptions()
	options.Mode = "video"
	ticket, err := s.Start("video-owner", size, options)
	if err != nil {
		t.Fatal(err)
	}
	source := io.MultiReader(bytes.NewReader(video), bytes.NewReader(padding), io.LimitReader(zeroReader{}, 65*1024*1024))
	for offset := int64(0); offset < size; {
		next, err := s.Append("video-owner", ticket.ID, offset, io.LimitReader(source, min(UploadChunkBytes, size-offset)))
		if err != nil {
			t.Fatal(err)
		}
		offset = next
	}
	result, err := s.Prepare(context.Background(), "video-owner", ticket.ID)
	if err != nil || result.Video == "" || result.Audio == "" || result.Frames != 33 {
		t.Fatal("large video normalization failed", err)
	}
	if len(s.items) != 0 {
		t.Fatal("original video retained")
	}
}

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) { clear(p); return len(p), nil }

func sourcePCMHeader(samples int) []byte {
	header := make([]byte, 44)
	copy(header, "RIFF")
	binary.LittleEndian.PutUint32(header[4:], uint32(36+samples*4))
	copy(header[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(header[16:], 16)
	binary.LittleEndian.PutUint16(header[20:], 1)
	binary.LittleEndian.PutUint16(header[22:], 2)
	binary.LittleEndian.PutUint32(header[24:], 48000)
	binary.LittleEndian.PutUint32(header[28:], 192000)
	binary.LittleEndian.PutUint16(header[32:], 4)
	binary.LittleEndian.PutUint16(header[34:], 16)
	copy(header[36:], "data")
	binary.LittleEndian.PutUint32(header[40:], uint32(samples*4))
	return header
}

func TestUploadBeyondLegacyLimitAndOneUsePreparation(t *testing.T) {
	s := uploadStore(t)
	// A real 65 MiB PCM WAV is uploaded in nine bounded requests. The GPU
	// receives only 33 frames of normalized audio, not the original long file.
	samples := (65 * 1024 * 1024) / 4
	size := int64(44 + samples*4)
	data := sourcePCMHeader(samples)
	ticket, err := s.Start("owner", size, uploadOptions())
	if err != nil {
		t.Fatal(err)
	}
	source := io.MultiReader(bytes.NewReader(data), io.LimitReader(zeroReader{}, int64(samples*4)))
	for offset := int64(0); offset < size; {
		next, err := s.Append("owner", ticket.ID, offset, io.LimitReader(source, min(UploadChunkBytes, size-offset)))
		if err != nil {
			t.Fatal(err)
		}
		offset = next
	}
	dir := s.items[ticket.ID].directory
	prepared, err := s.Prepare(context.Background(), "owner", ticket.ID)
	if err != nil || prepared.Frames != 33 || prepared.Audio == "" || prepared.Video != "" {
		t.Fatal(prepared.Frames, err)
	}
	if _, err := os.Stat(dir); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("prepared original retained")
	}
	if _, err := s.Prepare(context.Background(), "owner", ticket.ID); err != ErrUploadNotFound {
		t.Fatal("consumed source replayed")
	}
}
