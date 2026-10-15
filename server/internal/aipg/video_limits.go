// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package aipg

// MaxVideoFrames mirrors Core's per-model admission bounds, not GPU capacity proof.
func MaxVideoFrames(model string) int {
	if model == "LTX-2.5 Distilled BF16" {
		return 481
	}
	return 337
}
