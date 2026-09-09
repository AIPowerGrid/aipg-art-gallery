// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package aipg

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
)

func IsGenerationOutcomeUnknown(err error) bool {
	var outcome *generationOutcomeUnknown
	return errors.As(err, &outcome)
}

type MediaRecovery struct {
	JobID  string `json:"job_id"`
	State  string `json:"state"`
	Result *struct {
		Media   []GeneratedItem `json:"media"`
		Model   string          `json:"model"`
		Worker  string          `json:"worker"`
		GenTime *float64        `json:"gen_time"`
	} `json:"result"`
}

// RecoverMedia only reads the current canonical account's Core reservation.
// A 404 is unknown, never authorization to resubmit or a promise of refund.
func (c *Client) RecoverMedia(ctx context.Context, clientRef, apiKey, userToken string) (*MediaRecovery, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/media/results?"+url.Values{"client_ref": {clientRef}}.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", apiKey)
	req.Header.Set("X-Grid-User-Token", userToken)
	req.Header.Set("Client-Agent", c.clientAgent)
	client := *c.httpClient
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(req)
	if err != nil {
		return nil, errors.New("Grid recovery unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Grid recovery unavailable (%d)", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 131073))
	if err != nil || len(body) > 131072 {
		return nil, errors.New("invalid Grid recovery response")
	}
	var recovered MediaRecovery
	if json.Unmarshal(body, &recovered) != nil || recovered.JobID == "" {
		return nil, errors.New("invalid Grid recovery response")
	}
	switch recovered.State {
	case "completed":
		if recovered.Result == nil || len(recovered.Result.Media) == 0 || len(recovered.Result.Media) > 4 {
			return nil, errors.New("invalid Grid recovery outputs")
		}
		for _, item := range recovered.Result.Media {
			parsed, err := url.Parse(item.URL)
			if err != nil || parsed.Host == "" || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
				return nil, errors.New("invalid Grid recovery output URL")
			}
		}
	case "pending", "closed_without_result":
		if recovered.Result != nil {
			return nil, errors.New("uncommitted Grid recovery result")
		}
	default:
		return nil, errors.New("unknown Grid recovery state")
	}
	return &recovered, nil
}
