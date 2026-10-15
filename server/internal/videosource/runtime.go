// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
package videosource

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// Linux production runs codecs without host networking or access to app secrets.
// Non-root macOS execution is only for local codec tests, not rollout proof.
func codecCommand(ctx context.Context, program, directory string, args []string) (*exec.Cmd, error) {
	path, err := exec.LookPath(program)
	if err != nil {
		return nil, invalid
	}
	if runtime.GOOS != "linux" {
		if runtime.GOOS != "darwin" || os.Geteuid() == 0 {
			return nil, invalid
		}
		command := exec.CommandContext(ctx, path, args...)
		command.Dir = directory
		return command, nil
	}
	for i, arg := range args {
		if strings.HasPrefix(arg, directory+string(os.PathSeparator)) {
			args[i] = "/work/" + filepath.Base(arg)
		}
	}
	sandbox := []string{"--as=1073741824", "--cpu=45", "--fsize=35651584", "--nofile=64", "--", "bwrap",
		"--unshare-all", "--die-with-parent", "--new-session", "--cap-drop", "ALL",
		"--ro-bind", "/usr/bin", "/usr/bin", "--ro-bind", "/usr/lib", "/usr/lib", "--ro-bind", "/lib", "/lib", "--ro-bind-try", "/lib64", "/lib64",
		"--ro-bind-try", "/etc/ld.so.cache", "/etc/ld.so.cache", "--ro-bind-try", "/etc/alternatives", "/etc/alternatives",
		"--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--bind", directory, "/work", "--chdir", "/work",
		"--clearenv", "--setenv", "PATH", "/usr/bin:/bin", "--setenv", "HOME", "/tmp",
		"--setenv", "OPENBLAS_NUM_THREADS", "1", "--setenv", "OMP_NUM_THREADS", "1", "--", path}
	sandbox = append(sandbox, args...)
	command := exec.CommandContext(ctx, "prlimit", sandbox...)
	command.Env = []string{"PATH=/usr/bin:/bin"}
	return command, nil
}

// VerifyRuntime is a startup gate: installed tools alone do not prove isolation.
func VerifyRuntime() error {
	if runtime.GOOS != "linux" || !Available() {
		return errors.New("Source uploads require the verified Linux codec sandbox.")
	}
	directory, err := os.MkdirTemp("", "gallery-source-runtime-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(directory)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for _, program := range []string{"ffmpeg", "ffprobe"} {
		if _, err := run(ctx, program, directory, "-version"); err != nil {
			return errors.New("Source codec sandbox self-test failed; keep source modes disabled.")
		}
	}
	return nil
}
