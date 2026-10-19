//go:build !linux && !darwin

// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package videosource

import "errors"

func freeDiskBytes(string) (uint64, error) {
	return 0, errors.New("Source uploads require a supported private temporary filesystem")
}
