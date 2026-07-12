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

type Client struct {
	httpClient  *http.Client
	apiKey      string
	model       string
	clientAgent string
	baseURL     string
}

func NewClient(apiKey, model, clientAgent, baseURL string) *Client {
	if baseURL == "" {
		baseURL = "https://api.aipowergrid.io/v1"
	}
	return &Client{
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
		apiKey:      apiKey,
		model:       model,
		clientAgent: clientAgent,
		baseURL:     baseURL,
	}
}

// chatRequest is the OpenAI-style /v1/chat/completions request. The new grid is
// a faithful OpenAI proxy, so prompt enhancement is a single synchronous call —
// no async submit + poll loop like the old Flask horde.
type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// GenerateText runs one chat completion and returns the assistant's text. The
// caller assembles the full instruction into prompt (user text + guidelines),
// so we send it as a single user message.
func (c *Client) GenerateText(ctx context.Context, prompt, userToken string) (string, error) {
	payload := chatRequest{
		Model:       c.model,
		Messages:    []chatMessage{{Role: "user", Content: prompt}},
		Temperature: 0.7,
		MaxTokens:   1024,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("apikey", c.apiKey)
	req.Header.Set("Client-Agent", c.clientAgent)
	if userToken != "" {
		req.Header.Set("X-Grid-User-Token", userToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("submit request: %w", err)
	}
	defer resp.Body.Close()

	respBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBytes))
	}

	var parsed chatResponse
	if err := json.Unmarshal(respBytes, &parsed); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if parsed.Error != nil {
		return "", fmt.Errorf("generation failed: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 || parsed.Choices[0].Message.Content == "" {
		return "", fmt.Errorf("empty completion")
	}
	return parsed.Choices[0].Message.Content, nil
}
