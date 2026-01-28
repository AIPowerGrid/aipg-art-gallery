package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	GridAPIBaseURL = "https://api.aipowergrid.io/api/v2"
)

type Client struct {
	httpClient  *http.Client
	apiKey      string
	model       string
	clientAgent string
}

func NewClient(apiKey, model, clientAgent string) *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
		apiKey:      apiKey,
		model:       model,
		clientAgent: clientAgent,
	}
}

// TextGenerationRequest is the request payload for text generation
type TextGenerationRequest struct {
	Prompt string            `json:"prompt"`
	Params TextGenerationParams `json:"params"`
	Models []string          `json:"models"`
}

type TextGenerationParams struct {
	MaxLength        int      `json:"max_length"`
	MaxContextLength int      `json:"max_context_length"`
	Temperature      float64  `json:"temperature"`
	RepPen           float64  `json:"rep_pen"`
	TopP             float64  `json:"top_p"`
	TopK             int      `json:"top_k"`
	StopSequence     []string `json:"stop_sequence"`
}

// TextGenerationResponse is the initial response with job ID
type TextGenerationResponse struct {
	ID string `json:"id"`
}

// TextStatusResponse is the polling response
type TextStatusResponse struct {
	Done        bool         `json:"done"`
	Faulted     bool         `json:"faulted"`
	FaultedMsg  string       `json:"faulted_message,omitempty"`
	Generations []Generation `json:"generations,omitempty"`
}

type Generation struct {
	Text string `json:"text"`
}

// GenerateText submits a text generation request and polls until complete
func (c *Client) GenerateText(ctx context.Context, prompt string) (string, error) {
	// Build request payload
	payload := TextGenerationRequest{
		Prompt: prompt,
		Params: TextGenerationParams{
			MaxLength:        1024,
			MaxContextLength: 8192,
			Temperature:      0.7,
			RepPen:           1.1,
			TopP:             0.92,
			TopK:             100,
			StopSequence:     []string{"<|endoftext|>"},
		},
		Models: []string{c.model},
	}

	// Submit request
	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, GridAPIBaseURL+"/generate/text/async", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", c.apiKey)
	req.Header.Set("Client-Agent", c.clientAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("submit request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("API error %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var genResp TextGenerationResponse
	if err := json.NewDecoder(resp.Body).Decode(&genResp); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	// Poll for result
	return c.pollForResult(ctx, genResp.ID)
}

func (c *Client) pollForResult(ctx context.Context, generationID string) (string, error) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	maxAttempts := 60 // 60 * 2s = 120s max
	attempts := 0

	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-ticker.C:
			attempts++
			if attempts > maxAttempts {
				return "", fmt.Errorf("timeout waiting for generation")
			}

			status, err := c.checkStatus(ctx, generationID)
			if err != nil {
				continue // Retry on error
			}

			if status.Faulted {
				return "", fmt.Errorf("generation failed: %s", status.FaultedMsg)
			}

			if status.Done && len(status.Generations) > 0 && status.Generations[0].Text != "" {
				return status.Generations[0].Text, nil
			}
		}
	}
}

func (c *Client) checkStatus(ctx context.Context, generationID string) (*TextStatusResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, GridAPIBaseURL+"/generate/text/status/"+generationID, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("apikey", c.apiKey)
	req.Header.Set("Client-Agent", c.clientAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var status TextStatusResponse
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return nil, err
	}

	return &status, nil
}
