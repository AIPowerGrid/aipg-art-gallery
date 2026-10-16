package config

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

func (cfg Config) sourceAdmission() Config {
	cfg.DurableVideoEnabled = cfg.DurableVideoEnabled && cfg.DurableVideoSourcesEnabled
	cfg.DurableVideoAdmissionMode = cfg.DurableVideoSourcesAdmissionMode
	cfg.DurableVideoPilotAccounts = cfg.DurableVideoSourcesPilotAccounts
	cfg.DurableVideoPilotUntil = cfg.DurableVideoSourcesPilotUntil
	return cfg
}

func (cfg Config) ValidateDurableVideoSources(now time.Time) error {
	return cfg.sourceAdmission().ValidateDurableVideoPilot(now)
}

func (cfg Config) AllowsDurableVideoSourceAccount(account string, now time.Time) bool {
	return cfg.sourceAdmission().AllowsDurableVideoAccount(account, now)
}

func (cfg Config) ValidateDurableVideoPilot(now time.Time) error {
	if !cfg.DurableVideoEnabled {
		return nil
	}
	switch cfg.DurableVideoAdmissionMode {
	case "open":
		if len(cfg.DurableVideoPilotAccounts) != 0 || cfg.DurableVideoPilotUntil != "" {
			return errors.New("open durable video admission cannot ignore pilot restrictions")
		}
		return nil
	case "", "pilot":
	default:
		return errors.New("invalid durable video admission mode")
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
	id, err := uuid.Parse(account)
	if err != nil || id == uuid.Nil || id.String() != account {
		return false
	}
	if cfg.DurableVideoAdmissionMode == "open" {
		return true
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

func (cfg Config) AllowsDurableVideoModel(model string) bool {
	if !cfg.DurableVideoEnabled {
		return false
	}
	switch cfg.DurableVideoAdmissionMode {
	case "open":
		return model == "LTX-2.5 Distilled BF16" ||
			(model == "LTX-2.5 Distilled NVFP4" && cfg.DurableVideoNVFP4Enabled)
	case "", "pilot":
		return model == "LTX-2.5 Distilled BF16" || model == "LTX-2.5 Distilled NVFP4"
	default:
		return false
	}
}
