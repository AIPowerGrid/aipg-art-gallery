//go:build linux || darwin

// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package videosource

import "syscall"

func freeDiskBytes(path string) (uint64, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(path, &stat); err != nil {
		return 0, err
	}
	return uint64(stat.Bavail) * uint64(stat.Bsize), nil
}
