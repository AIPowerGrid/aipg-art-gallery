package auth

import (
	"errors"
	"strings"
	"time"
)

// SiweFields is the subset of an EIP-4361 (Sign-In with Ethereum) message that
// we validate server-side. The frontend builds the message with the `siwe` JS
// library; this parser only needs the fields that gate authentication.
type SiweFields struct {
	Domain   string
	Address  string
	URI      string
	Nonce    string
	IssuedAt time.Time
}

const siwePreambleSuffix = " wants you to sign in with your Ethereum account:"

// ParseSiweMessage extracts and lightly validates the structure of an EIP-4361
// message. It is intentionally strict about the preamble and required fields so
// that an attacker cannot pass an arbitrary blob through to signature recovery.
func ParseSiweMessage(message string) (SiweFields, error) {
	var f SiweFields

	lines := strings.Split(message, "\n")
	if len(lines) < 2 {
		return f, errors.New("malformed SIWE message")
	}

	// Line 0: "{domain} wants you to sign in with your Ethereum account:"
	if !strings.HasSuffix(lines[0], siwePreambleSuffix) {
		return f, errors.New("missing SIWE preamble")
	}
	f.Domain = strings.TrimSpace(strings.TrimSuffix(lines[0], siwePreambleSuffix))

	// Line 1: the address.
	f.Address = strings.TrimSpace(lines[1])

	for _, line := range lines[2:] {
		switch {
		case strings.HasPrefix(line, "URI: "):
			f.URI = strings.TrimSpace(strings.TrimPrefix(line, "URI: "))
		case strings.HasPrefix(line, "Nonce: "):
			f.Nonce = strings.TrimSpace(strings.TrimPrefix(line, "Nonce: "))
		case strings.HasPrefix(line, "Issued At: "):
			raw := strings.TrimSpace(strings.TrimPrefix(line, "Issued At: "))
			t, err := time.Parse(time.RFC3339, raw)
			if err != nil {
				return f, errors.New("invalid Issued At timestamp")
			}
			f.IssuedAt = t
		}
	}

	if f.Domain == "" {
		return f, errors.New("SIWE message missing domain")
	}
	if f.Address == "" {
		return f, errors.New("SIWE message missing address")
	}
	if f.Nonce == "" {
		return f, errors.New("SIWE message missing nonce")
	}
	if f.IssuedAt.IsZero() {
		return f, errors.New("SIWE message missing Issued At")
	}

	return f, nil
}
