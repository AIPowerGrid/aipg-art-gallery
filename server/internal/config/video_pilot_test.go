package config

import (
	"strings"
	"testing"
	"time"
)

const pilotOwner = "00000000-0000-4000-8000-000000000123"

func TestVideoPilotValidationAndExpiry(t *testing.T) {
	now := time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
	valid := Config{DurableVideoEnabled: true, DurableVideoPilotAccounts: []string{pilotOwner}, DurableVideoPilotUntil: now.Add(time.Hour).Format(time.RFC3339)}
	if valid.ValidateDurableVideoPilot(now) != nil || !valid.AllowsDurableVideoAccount(pilotOwner, now) {
		t.Fatal("valid pilot denied")
	}
	if valid.AllowsDurableVideoAccount("00000000-0000-4000-8000-000000000456", now) {
		t.Fatal("foreign account admitted")
	}
	if valid.AllowsDurableVideoAccount(pilotOwner, now.Add(time.Hour)) {
		t.Fatal("deadline equality admitted new work")
	}
	if valid.ValidateDurableVideoPilot(now.Add(2*time.Hour)) != nil {
		t.Fatal("expired pilot prevented recovery restart")
	}
	for _, mutate := range []func(*Config){
		func(c *Config) { c.DurableVideoPilotAccounts = nil },
		func(c *Config) { c.DurableVideoPilotAccounts = []string{pilotOwner, pilotOwner} },
		func(c *Config) { c.DurableVideoPilotAccounts = []string{"not-an-account"} },
		func(c *Config) { c.DurableVideoPilotAccounts = []string{"00000000-0000-0000-0000-000000000000"} },
		func(c *Config) { c.DurableVideoPilotUntil = "" },
		func(c *Config) { c.DurableVideoPilotUntil = "tomorrow" },
		func(c *Config) { c.DurableVideoPilotUntil = now.Add(25 * time.Hour).Format(time.RFC3339) },
	} {
		c := valid
		mutate(&c)
		if c.ValidateDurableVideoPilot(now) == nil || c.AllowsDurableVideoAccount(pilotOwner, now) {
			t.Fatal("invalid enabled pilot admitted")
		}
	}
	valid.DurableVideoEnabled = false
	if valid.AllowsDurableVideoAccount(pilotOwner, now) {
		t.Fatal("disabled pilot admitted")
	}
}

func TestVideoPilotEnvironment(t *testing.T) {
	t.Setenv("GALLERY_DURABLE_VIDEO_ENABLED", "true")
	t.Setenv("GALLERY_DURABLE_VIDEO_ADMISSION_MODE", "pilot")
	t.Setenv("GALLERY_DURABLE_VIDEO_PILOT_ACCOUNTS", " "+pilotOwner+" ")
	t.Setenv("GALLERY_DURABLE_VIDEO_PILOT_UNTIL", "2026-10-14T01:00:00Z")
	c := Load()
	if len(c.DurableVideoPilotAccounts) != 1 || c.DurableVideoPilotAccounts[0] != pilotOwner || strings.TrimSpace(c.DurableVideoPilotUntil) != "2026-10-14T01:00:00Z" {
		t.Fatal("pilot fields not loaded")
	}
}

func TestOpenVideoAdmissionRequiresExplicitUnrestrictedConfig(t *testing.T) {
	now := time.Now()
	cfg := Config{DurableVideoEnabled: true, DurableVideoAdmissionMode: "open"}
	if cfg.ValidateDurableVideoPilot(now) != nil || !cfg.AllowsDurableVideoAccount(pilotOwner, now) ||
		!cfg.AllowsDurableVideoAccount("00000000-0000-4000-8000-000000000456", now) {
		t.Fatal("explicit open admission rejected canonical accounts")
	}
	for _, owner := range []string{"", "not-an-account", "00000000-0000-0000-0000-000000000000", "{" + pilotOwner + "}"} {
		if cfg.AllowsDurableVideoAccount(owner, now) {
			t.Fatal("open mode admitted a noncanonical account")
		}
	}
	for _, mutate := range []func(*Config){
		func(c *Config) { c.DurableVideoPilotAccounts = []string{pilotOwner} },
		func(c *Config) { c.DurableVideoPilotUntil = now.Add(-time.Hour).Format(time.RFC3339) },
		func(c *Config) { c.DurableVideoAdmissionMode = "public" },
		func(c *Config) { c.DurableVideoAdmissionMode = "pilot" },
		func(c *Config) { c.DurableVideoAdmissionMode = "" },
	} {
		candidate := cfg
		mutate(&candidate)
		if candidate.ValidateDurableVideoPilot(now) == nil || candidate.AllowsDurableVideoAccount(pilotOwner, now) {
			t.Fatal("invalid or implicit public admission accepted")
		}
	}
	cfg.DurableVideoEnabled = false
	if cfg.AllowsDurableVideoAccount(pilotOwner, now) {
		t.Fatal("open mode bypassed emergency disable")
	}
}

func TestPublicVideoModelsRemainBF16Only(t *testing.T) {
	cfg := Config{DurableVideoEnabled: true, DurableVideoAdmissionMode: "open"}
	if !cfg.AllowsDurableVideoModel("LTX-2.5 Distilled BF16") || cfg.AllowsDurableVideoModel("LTX-2.5 Distilled NVFP4") || cfg.AllowsDurableVideoModel("LTX-2.3") {
		t.Fatal("public model scope widened")
	}
	cfg.DurableVideoAdmissionMode = "pilot"
	if !cfg.AllowsDurableVideoModel("LTX-2.5 Distilled NVFP4") {
		t.Fatal("explicit pilot model support changed")
	}
	cfg.DurableVideoEnabled = false
	if cfg.AllowsDurableVideoModel("LTX-2.5 Distilled BF16") {
		t.Fatal("disabled model admitted")
	}
}

func TestVideoAdmissionModeEnvironment(t *testing.T) {
	t.Setenv("GALLERY_DURABLE_VIDEO_ADMISSION_MODE", "")
	if Load().DurableVideoAdmissionMode != "pilot" {
		t.Fatal("public mode became the default")
	}
	t.Setenv("GALLERY_DURABLE_VIDEO_ADMISSION_MODE", "open")
	if Load().DurableVideoAdmissionMode != "open" {
		t.Fatal("explicit mode was not loaded")
	}
}
