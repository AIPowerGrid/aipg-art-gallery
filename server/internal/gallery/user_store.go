package gallery

import (
	"database/sql"
	"strings"
	"time"
)

// User represents a user profile with support for wallet and/or Google auth
type User struct {
	ID            int64      `json:"id"`
	WalletAddress *string    `json:"walletAddress,omitempty"`
	GoogleID      *string    `json:"googleId,omitempty"`
	Email         *string    `json:"email,omitempty"`
	Name          *string    `json:"name,omitempty"`
	PictureURL    *string    `json:"pictureUrl,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	LastSeenAt    time.Time  `json:"lastSeenAt"`
}

// UserStore handles user-related database operations
type UserStore struct {
	db *sql.DB
}

// NewUserStore creates a new UserStore
func NewUserStore(db *sql.DB) *UserStore {
	return &UserStore{db: db}
}

// EnsureSchema creates the users table with Google auth columns if they don't exist
func (s *UserStore) EnsureSchema() error {
	// Wallet and Google are independent login methods. Legacy schemas required
	// wallet_address, which prevents a Google-only user from being persisted.
	migrations := []string{
		`ALTER TABLE users ALTER COLUMN wallet_address DROP NOT NULL`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS picture_url TEXT`,
		`CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL`,
	}

	for _, migration := range migrations {
		if _, err := s.db.Exec(migration); err != nil {
			// Ignore errors for columns that may already exist in different DB versions
			continue
		}
	}

	return nil
}

// ConnectWallet creates or updates a user when they connect their wallet
func (s *UserStore) ConnectWallet(walletAddress string) (*User, error) {
	wallet := strings.ToLower(walletAddress)
	now := time.Now()

	query := `
		INSERT INTO users (wallet_address, created_at, last_seen_at)
		VALUES ($1, $2, $2)
		ON CONFLICT (wallet_address) DO UPDATE SET last_seen_at = $2
		RETURNING id, wallet_address, google_id, email, name, picture_url, created_at, last_seen_at
	`

	var user User
	err := s.db.QueryRow(query, wallet, now).Scan(
		&user.ID,
		&user.WalletAddress,
		&user.GoogleID,
		&user.Email,
		&user.Name,
		&user.PictureURL,
		&user.CreatedAt,
		&user.LastSeenAt,
	)

	if err != nil {
		return nil, err
	}

	return &user, nil
}

// ConnectGoogle creates or updates a user when they sign in with Google
func (s *UserStore) ConnectGoogle(googleID, email, name, pictureURL string) (*User, error) {
	now := time.Now()

	query := `
		INSERT INTO users (google_id, email, name, picture_url, created_at, last_seen_at)
		VALUES ($1, $2, $3, $4, $5, $5)
		ON CONFLICT (google_id) DO UPDATE SET 
			email = COALESCE(EXCLUDED.email, users.email),
			name = COALESCE(EXCLUDED.name, users.name),
			picture_url = COALESCE(EXCLUDED.picture_url, users.picture_url),
			last_seen_at = $5
		RETURNING id, wallet_address, google_id, email, name, picture_url, created_at, last_seen_at
	`

	var user User
	err := s.db.QueryRow(query, googleID, email, name, pictureURL, now).Scan(
		&user.ID,
		&user.WalletAddress,
		&user.GoogleID,
		&user.Email,
		&user.Name,
		&user.PictureURL,
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
		SELECT id, wallet_address, google_id, email, name, picture_url, created_at, last_seen_at
		FROM users
		WHERE wallet_address = $1
	`

	var user User
	err := s.db.QueryRow(query, wallet).Scan(
		&user.ID,
		&user.WalletAddress,
		&user.GoogleID,
		&user.Email,
		&user.Name,
		&user.PictureURL,
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

// GetUserByGoogleID retrieves a user by their Google ID
func (s *UserStore) GetUserByGoogleID(googleID string) (*User, error) {
	query := `
		SELECT id, wallet_address, google_id, email, name, picture_url, created_at, last_seen_at
		FROM users
		WHERE google_id = $1
	`

	var user User
	err := s.db.QueryRow(query, googleID).Scan(
		&user.ID,
		&user.WalletAddress,
		&user.GoogleID,
		&user.Email,
		&user.Name,
		&user.PictureURL,
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

// GetUserByID retrieves a user by their internal ID
func (s *UserStore) GetUserByID(id int64) (*User, error) {
	query := `
		SELECT id, wallet_address, google_id, email, name, picture_url, created_at, last_seen_at
		FROM users
		WHERE id = $1
	`

	var user User
	err := s.db.QueryRow(query, id).Scan(
		&user.ID,
		&user.WalletAddress,
		&user.GoogleID,
		&user.Email,
		&user.Name,
		&user.PictureURL,
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

// Deprecated: Use ConnectWallet instead
func (s *UserStore) ConnectUser(walletAddress string) (*User, error) {
	return s.ConnectWallet(walletAddress)
}
