package aipg

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
)

func SignAssertion(apiKey, provider, subject string) (string, error) {
	if apiKey == "" || subject == "" {
		return "", errors.New("grid bridge key and authenticated subject are required")
	}
	now := time.Now().Unix()
	issuer := sha256.Sum256([]byte(apiKey))
	nonce, err := randomID()
	if err != nil {
		return "", err
	}
	header := map[string]any{"alg": "HS256", "typ": "JWT"}
	payload := map[string]any{
		"aud": "grid-core", "exp": now + 45, "iat": now,
		"iss":   hex.EncodeToString(issuer[:])[:24],
		"nonce": nonce, "provider": provider, "sub": subject,
	}
	encode := func(value any) (string, error) {
		raw, err := json.Marshal(value)
		if err != nil {
			return "", err
		}
		return base64.RawURLEncoding.EncodeToString(raw), nil
	}
	head, err := encode(header)
	if err != nil {
		return "", err
	}
	body, err := encode(payload)
	if err != nil {
		return "", err
	}
	encoded := head + "." + body
	mac := hmac.New(sha256.New, []byte(apiKey))
	_, _ = mac.Write([]byte(encoded))
	return encoded + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func randomID() (string, error) {
	var value [24]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value[:]), nil
}
