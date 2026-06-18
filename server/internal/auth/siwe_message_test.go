package auth

import (
	"fmt"
	"testing"
	"time"
)

func validSiweMessage(nonce string) string {
	return fmt.Sprintf(`gallery.aipg.art wants you to sign in with your Ethereum account:
0x1234567890abcdef1234567890abcdef12345678

Sign in to AIPG Art Gallery

URI: https://gallery.aipg.art
Version: 1
Chain ID: 8453
Nonce: %s
Issued At: %s`, nonce, time.Now().UTC().Format(time.RFC3339))
}

func TestParseSiweMessage(t *testing.T) {
	msg := validSiweMessage("abc123def456")
	f, err := ParseSiweMessage(msg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if f.Domain != "gallery.aipg.art" {
		t.Errorf("domain = %q, want gallery.aipg.art", f.Domain)
	}
	if f.Address != "0x1234567890abcdef1234567890abcdef12345678" {
		t.Errorf("address = %q", f.Address)
	}
	if f.Nonce != "abc123def456" {
		t.Errorf("nonce = %q", f.Nonce)
	}
	if f.IssuedAt.IsZero() {
		t.Error("issuedAt not parsed")
	}
}

func TestParseSiweMessageRejectsJunk(t *testing.T) {
	cases := map[string]string{
		"empty":          "",
		"no preamble":    "hello world\n0xabc",
		"missing nonce":  "x wants you to sign in with your Ethereum account:\n0xabc\n\nIssued At: 2026-01-01T00:00:00Z",
		"bad timestamp":  "x wants you to sign in with your Ethereum account:\n0xabc\n\nNonce: n\nIssued At: not-a-date",
	}
	for name, msg := range cases {
		if _, err := ParseSiweMessage(msg); err == nil {
			t.Errorf("%s: expected error, got nil", name)
		}
	}
}

func TestNonceStoreSingleUse(t *testing.T) {
	s := NewNonceStore()

	nonce, err := s.Issue()
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}

	// First consume succeeds.
	if err := s.Consume(nonce); err != nil {
		t.Fatalf("first Consume: %v", err)
	}
	// Replay is rejected.
	if err := s.Consume(nonce); err == nil {
		t.Error("replayed nonce should be rejected")
	}
	// Unknown nonce is rejected.
	if err := s.Consume("never-issued"); err == nil {
		t.Error("unknown nonce should be rejected")
	}
}
