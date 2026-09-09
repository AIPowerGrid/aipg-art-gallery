// SPDX-License-Identifier: AGPL-3.0-or-later
package aipg

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"slices"
	"strings"

	"github.com/google/uuid"
)

type AccountOwnership struct {
	AccountID string   `json:"account_id"`
	Aliases   []string `json:"account_aliases"`
}

func (o *AccountOwnership) Contains(id string) bool {
	return id == o.AccountID || slices.Contains(o.Aliases, id)
}

// FetchOwnership trusts only the configured Core, never a caller's alias list.
func (c *Client) FetchOwnership(ctx context.Context, apiKey, token, expected string) (*AccountOwnership, error) {
	failure := errors.New("Grid account ownership temporarily unavailable")
	if apiKey == "" || token == "" || expected == "" {
		return nil, failure
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/account/ownership", nil)
	if err != nil {
		return nil, failure
	}
	req.Header.Set("apikey", apiKey)
	req.Header.Set("X-Grid-User-Token", token)
	client := *c.httpClient
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := client.Do(req)
	if err != nil {
		return nil, failure
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, failure
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 16385))
	if err != nil || len(raw) > 16384 {
		return nil, failure
	}
	var result AccountOwnership
	if json.Unmarshal(raw, &result) != nil || result.AccountID != expected || len(result.Aliases) > 127 {
		return nil, failure
	}
	seen := map[string]bool{}
	for _, id := range append([]string{result.AccountID}, result.Aliases...) {
		parsed, err := uuid.Parse(id)
		if err != nil || parsed == uuid.Nil || parsed.String() != strings.ToLower(id) || id != strings.ToLower(id) || seen[id] {
			return nil, failure
		}
		seen[id] = true
	}
	return &result, nil
}
