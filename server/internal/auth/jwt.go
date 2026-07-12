package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"time"
)

// Claims represents the JWT payload - supports both wallet and Google auth
type Claims struct {
	// For wallet auth (existing) - JSON field is "address" to match the
	// Next.js /auth-api/verify route which issues all wallet JWTs.
	WalletAddress string `json:"address,omitempty"`
	// For Google auth (new)
	GoogleID string `json:"google_id,omitempty"`
	Email    string `json:"email,omitempty"`
	Name     string `json:"name,omitempty"`
	// Common fields
	IssuedAt  int64 `json:"iat"`
	ExpiresAt int64 `json:"exp"`
}

// UserIdentifier returns the primary user identifier (wallet address or google ID)
func (c *Claims) UserIdentifier() string {
	if c.GoogleID != "" {
		return c.GoogleID
	}
	return c.WalletAddress
}

// AuthMethod returns "wallet" or "google" based on which auth was used
func (c *Claims) AuthMethod() string {
	if c.GoogleID != "" {
		return "google"
	}
	return "wallet"
}

// GenerateJWT creates a JWT token for a wallet address
func GenerateJWT(walletAddress string) (string, error) {
	claims := Claims{
		WalletAddress: strings.ToLower(walletAddress),
		IssuedAt:      time.Now().Unix(),
		ExpiresAt:     time.Now().Add(24 * time.Hour).Unix(),
	}
	return generateJWTFromClaims(claims)
}

// GenerateGoogleJWT creates a JWT token for a Google user
func GenerateGoogleJWT(googleID, email, name string) (string, error) {
	claims := Claims{
		GoogleID:  googleID,
		Email:     email,
		Name:      name,
		IssuedAt:  time.Now().Unix(),
		ExpiresAt: time.Now().Add(24 * time.Hour).Unix(),
	}
	return generateJWTFromClaims(claims)
}

func GenerateLinkedJWT(googleID, email, name, walletAddress string) (string, error) {
	claims := Claims{
		GoogleID: googleID, Email: email, Name: name,
		WalletAddress: strings.ToLower(walletAddress),
		IssuedAt:      time.Now().Unix(), ExpiresAt: time.Now().Add(24 * time.Hour).Unix(),
	}
	return generateJWTFromClaims(claims)
}

func generateJWTFromClaims(claims Claims) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "", errors.New("JWT_SECRET not configured")
	}

	// Create header
	header := map[string]string{
		"alg": "HS256",
		"typ": "JWT",
	}

	// Encode header and claims
	headerJSON, _ := json.Marshal(header)
	claimsJSON, _ := json.Marshal(claims)

	headerEncoded := base64.RawURLEncoding.EncodeToString(headerJSON)
	claimsEncoded := base64.RawURLEncoding.EncodeToString(claimsJSON)

	// Create signature
	message := headerEncoded + "." + claimsEncoded
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(message))
	signature := base64.RawURLEncoding.EncodeToString(h.Sum(nil))

	// Return JWT
	return message + "." + signature, nil
}

// VerifyJWT validates a JWT token and returns the wallet address (backward compatible)
func VerifyJWT(tokenString string) (string, error) {
	claims, err := VerifyJWTClaims(tokenString)
	if err != nil {
		return "", err
	}
	// Return wallet address for backward compatibility
	// For Google users, this returns empty string - use VerifyJWTClaims instead
	return claims.WalletAddress, nil
}

// VerifyJWTClaims validates a JWT token and returns the full claims
func VerifyJWTClaims(tokenString string) (*Claims, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return nil, errors.New("JWT_SECRET not configured")
	}

	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid token format")
	}

	// Reject any algorithm other than the HS256 we issue. This blocks "alg"
	// confusion / "none" attacks. (The Next.js /auth-api/verify route also signs
	// HS256 via jsonwebtoken, so both issuers are covered.)
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, errors.New("invalid header encoding")
	}
	var header struct {
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, errors.New("invalid header")
	}
	if header.Alg != "HS256" {
		return nil, errors.New("unexpected token algorithm")
	}

	// Verify signature with a constant-time comparison to avoid timing leaks.
	message := parts[0] + "." + parts[1]
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(message))
	expectedSignature := base64.RawURLEncoding.EncodeToString(h.Sum(nil))

	if !hmac.Equal([]byte(parts[2]), []byte(expectedSignature)) {
		return nil, errors.New("invalid signature")
	}

	// Decode claims
	claimsJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, errors.New("invalid claims encoding")
	}

	var claims Claims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, errors.New("invalid claims")
	}

	// Check expiry
	if time.Now().Unix() > claims.ExpiresAt {
		return nil, errors.New("token expired")
	}

	return &claims, nil
}
