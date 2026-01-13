package gallery

import (
	"database/sql"
	"strings"
	"time"
)

// User represents a user profile
type User struct {
	ID            int64     `json:"id"`
	WalletAddress string    `json:"walletAddress"`
	CreatedAt     time.Time `json:"createdAt"`
	LastSeenAt    time.Time `json:"lastSeenAt"`
}

// UserStore handles user-related database operations
type UserStore struct {
	db *sql.DB
}

// ConnectUser creates or updates a user when they connect their wallet
func (s *UserStore) ConnectUser(walletAddress string) (*User, error) {
	wallet := strings.ToLower(walletAddress)
	now := time.Now()

	query := `
		INSERT INTO users (wallet_address, created_at, last_seen_at)
		VALUES ($1, $2, $2)
		ON CONFLICT (wallet_address) DO UPDATE SET last_seen_at = $2
		RETURNING id, wallet_address, created_at, last_seen_at
	`

	var user User
	err := s.db.QueryRow(query, wallet, now).Scan(
		&user.ID,
		&user.WalletAddress,
		&user.CreatedAt,
		&user.LastSeenAt,
	)

	if err != nil {
		return nil, err
	}

	return &user, nil
}

// GetUserByWallet retrieves a user by their wallet address
func (s *UserStore) GetUserByWallet(walletAddress string) (*User, error) {
	wallet := strings.ToLower(walletAddress)

	query := `
		SELECT id, wallet_address, created_at, last_seen_at
		FROM users
		WHERE wallet_address = $1
	`

	var user User
	err := s.db.QueryRow(query, wallet).Scan(
		&user.ID,
		&user.WalletAddress,
		&user.CreatedAt,
		&user.LastSeenAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &user, nil
}
