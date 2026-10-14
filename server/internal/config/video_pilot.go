package config

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

func (cfg Config) ValidateDurableVideoPilot(now time.Time) error {
	if !cfg.DurableVideoEnabled {
		return nil
	}
	invalid := errors.New("enabled durable video requires distinct canonical pilot accounts and a fixed RFC3339 expiry within 24 hours")
	if len(cfg.DurableVideoPilotAccounts) == 0 || len(cfg.DurableVideoPilotAccounts) > 10 {
		return invalid
	}
	seen := make(map[string]bool)
	for _, account := range cfg.DurableVideoPilotAccounts {
		id, err := uuid.Parse(account)
		if err != nil || id == uuid.Nil || id.String() != account || seen[account] {
			return invalid
		}
		seen[account] = true
	}
	until, err := time.Parse(time.RFC3339, cfg.DurableVideoPilotUntil)
	if err != nil || until.IsZero() || until.After(now.Add(24*time.Hour)) {
		return invalid
	}
	// Expired configurations may restart to serve immutable GET recovery.
	return nil
}

func (cfg Config) AllowsDurableVideoAccount(account string, now time.Time) bool {
	if !cfg.DurableVideoEnabled || cfg.ValidateDurableVideoPilot(now) != nil {
		return false
	}
	until, err := time.Parse(time.RFC3339, cfg.DurableVideoPilotUntil)
	if err != nil || !now.Before(until) {
		return false
	}
	for _, allowed := range cfg.DurableVideoPilotAccounts {
		if allowed == account {
			return true
		}
	}
	return false
}
