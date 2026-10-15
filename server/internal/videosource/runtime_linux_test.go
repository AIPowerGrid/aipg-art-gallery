//go:build linux

// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
package videosource

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLinuxCodecSandboxActuallyIsolatesHost(t *testing.T) {
	if err := VerifyRuntime(); err != nil {
		t.Fatal(err)
	}
	parent := t.TempDir()
	work := filepath.Join(parent, "work")
	if err := os.Mkdir(work, 0o700); err != nil {
		t.Fatal(err)
	}
	secret := filepath.Join(parent, "private-host-file")
	if err := os.WriteFile(secret, []byte("fixture-only"), 0o600); err != nil {
		t.Fatal(err)
	}
	inside := filepath.Join(work, "upload")
	if err := os.WriteFile(inside, []byte("fixture-input"), 0o600); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if _, err := run(ctx, "test", work, "-e", inside); err != nil {
		t.Fatal("sandbox cannot see its input")
	}
	if _, err := run(ctx, "test", work, "-e", secret); err == nil {
		t.Fatal("sandbox can read a host file outside its workspace")
	}
	t.Setenv("GALLERY_SANDBOX_FIXTURE_SECRET", "must-not-reach-codec")
	environment, err := run(ctx, "env", work)
	if err != nil || strings.Contains(string(environment), "GALLERY_SANDBOX_FIXTURE_SECRET") {
		t.Fatal("codec environment not isolated")
	}
	hostNetwork, err := os.Readlink("/proc/self/ns/net")
	if err != nil {
		t.Fatal(err)
	}
	codecNetwork, err := run(ctx, "readlink", work, "/proc/self/ns/net")
	if err != nil || strings.TrimSpace(string(codecNetwork)) == hostNetwork {
		t.Fatal("codec shares the host network namespace")
	}
}
