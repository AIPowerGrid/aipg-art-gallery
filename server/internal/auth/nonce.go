package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

// NonceTTL is how long an issued SIWE nonce remains valid. A signed message
// must also be issued within this window (see Issued At validation in app).
const NonceTTL = 10 * time.Minute

const nonceBytes = 16

// NonceStore tracks the nonces this server has issued for SIWE sign-in.
// Nonces are single-use (consumed on first successful verification) and expire,
// which is what makes captured signatures non-replayable. In-memory is fine for
// a single instance; back it with Redis if the API is ever horizontally scaled.
type NonceStore struct {
	mu     sync.Mutex
	issued map[string]time.Time // nonce -> expiry
}

func NewNonceStore() *NonceStore {
	return &NonceStore{issued: make(map[string]time.Time)}
}

// Issue generates a fresh random nonce, records it with an expiry, and returns it.
func (s *NonceStore) Issue() (string, error) {
	b := make([]byte, nonceBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	nonce := hex.EncodeToString(b)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.gcLocked()
	s.issued[nonce] = time.Now().Add(NonceTTL)
	return nonce, nil
}

// Consume validates that a nonce was issued by us and not yet used, then removes
// it so it can never be used again. Returns an error for unknown, reused, or
// expired nonces.
func (s *NonceStore) Consume(nonce string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	expiry, ok := s.issued[nonce]
	if !ok {
		return errors.New("unknown or already-used nonce")
	}
	// One-time use: remove regardless of whether it had expired.
	delete(s.issued, nonce)
	if time.Now().After(expiry) {
		return errors.New("nonce expired")
	}
	return nil
}

// gcLocked drops expired entries. Caller must hold s.mu.
func (s *NonceStore) gcLocked() {
	now := time.Now()
	for n, exp := range s.issued {
		if now.After(exp) {
			delete(s.issued, n)
		}
	}
}
