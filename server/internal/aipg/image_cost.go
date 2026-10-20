// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package aipg

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

// RequireImageCostLimit rejects old Core versions that ignore unknown image fields.
func (c *Client) RequireImageCostLimit(ctx context.Context) error {
	endpoint := strings.TrimSuffix(strings.TrimRight(c.baseURL, "/"), "/v1") + "/health"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return errors.New("image cost contract unavailable")
	}
	client := *c.httpClient
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := client.Do(req)
	if err != nil {
		return errors.New("image cost contract unavailable")
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 16385))
	if err != nil || resp.StatusCode != http.StatusOK || len(body) > 16384 {
		return errors.New("image cost contract unavailable")
	}
	var health struct {
		Features []string `json:"features"`
	}
	if json.Unmarshal(body, &health) == nil {
		for _, feature := range health.Features {
			if feature == "image-max-cost-micro-usd-v1" {
				return nil
			}
		}
	}
	return errors.New("image cost contract unavailable")
}
