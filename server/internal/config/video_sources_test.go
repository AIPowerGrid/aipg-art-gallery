// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
package config

import (
	"testing"
	"time"
)

func TestSourceCohortDoesNotClosePublicTextVideo(t *testing.T) {
	now := time.Now().UTC()
	owner := "00000000-0000-4000-8000-000000000001"
	other := "00000000-0000-4000-8000-000000000002"
	cfg := Config{DurableVideoEnabled: true, DurableVideoAdmissionMode: "open", DurableVideoSourcesEnabled: true, DurableVideoSourcesAdmissionMode: "pilot", DurableVideoSourcesPilotAccounts: []string{owner}, DurableVideoSourcesPilotUntil: now.Add(time.Hour).Format(time.RFC3339)}
	if cfg.ValidateDurableVideoSources(now) != nil || !cfg.AllowsDurableVideoSourceAccount(owner, now) || cfg.AllowsDurableVideoSourceAccount(other, now) {
		t.Fatal("source cohort not enforced")
	}
	if !cfg.AllowsDurableVideoAccount(other, now) {
		t.Fatal("source cohort closed public text video")
	}
	if cfg.AllowsDurableVideoSourceAccount(owner, now.Add(2*time.Hour)) {
		t.Fatal("expired source cohort still open")
	}
	if cfg.ValidateDurableVideoSources(now.Add(2*time.Hour)) != nil {
		t.Fatal("expired source config cannot restart for recovery")
	}
	cfg.DurableVideoSourcesAdmissionMode = "open"
	if cfg.ValidateDurableVideoSources(now) == nil {
		t.Fatal("public sources ignored retained cohort")
	}
	cfg.DurableVideoSourcesPilotAccounts = nil
	cfg.DurableVideoSourcesPilotUntil = ""
	if cfg.ValidateDurableVideoSources(now) != nil || !cfg.AllowsDurableVideoSourceAccount(other, now) {
		t.Fatal("explicit public source mode rejected")
	}
	cfg.DurableVideoSourcesEnabled = false
	if cfg.AllowsDurableVideoSourceAccount(owner, now) || !cfg.AllowsDurableVideoAccount(other, now) {
		t.Fatal("source rollback broke generated video")
	}
}
