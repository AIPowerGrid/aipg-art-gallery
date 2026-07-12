package aipg

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type Client struct {
	baseURL     string
	httpClient  *http.Client
	mediaClient *http.Client
	clientAgent string
}

func NewClient(baseURL, clientAgent string) *Client {
	return &Client{
		baseURL:     baseURL,
		clientAgent: clientAgent,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		// Media generation on the new grid is synchronous — the POST blocks
		// until the worker finishes. Video (LTX) can take minutes, so this
		// client gets a much longer ceiling than the status/stats client.
		mediaClient: &http.Client{
			Timeout: 6 * time.Minute,
		},
	}
}

// FetchProgress returns the worker's latest progress (0–100) for a token, or
// nil if nothing has been reported yet. Best-effort: never blocks generation.
func (c *Client) FetchProgress(ctx context.Context, token string) (*int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/progress/"+token, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Client-Agent", c.clientAgent)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("progress request failed (%d)", resp.StatusCode)
	}
	var parsed struct {
		Progress *int `json:"progress"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, err
	}
	return parsed.Progress, nil
}

// FetchStyles returns the grid's curated style registry (GET /v1/styles).
func (c *Client) FetchStyles(ctx context.Context) ([]Style, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/styles", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Client-Agent", c.clientAgent)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("styles request failed (%d): %s", resp.StatusCode, body)
	}
	var parsed struct {
		Styles []Style `json:"styles"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return parsed.Styles, nil
}

func (c *Client) FetchModelStats(ctx context.Context) ([]ModelStatus, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/status/models", c.baseURL), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Client-Agent", c.clientAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("models request failed: %s", body)
	}

	var raw []ModelStatus
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	return raw, nil
}

// GenerateMedia calls the new grid's synchronous OpenAI-style endpoint and
// blocks until the worker returns a result. kind is "image" or "video"; it
// selects the path. The grid authenticates via the apikey header (it also
// accepts Authorization: Bearer) and gates every knob server-side.
func (c *Client) GenerateMedia(ctx context.Context, kind string, request GenerateRequest, apiKey, assertion, clientHeader string) (*GenerateResponse, error) {
	path := "/images/generations"
	if kind == "video" {
		path = "/videos/generations"
	}

	payload, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}

	log.Printf("🌐 Grid /v1 %s: model=%s, n=%d, size=%q, img2x=%v, prompt_len=%d",
		kind, request.Model, request.N, request.Size, request.Image != "", len(request.Prompt))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Client-Agent", clientHeader)
	if apiKey != "" {
		req.Header.Set("apikey", apiKey)
	}
	if assertion != "" {
		req.Header.Set("X-Grid-User-Assertion", assertion)
	}

	resp, err := c.mediaClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("grid %s generation failed (%d): %s", kind, resp.StatusCode, body)
	}

	var parsed GenerateResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return &parsed, nil
}

func (c *Client) accountRequest(ctx context.Context, method, path, apiKey, assertion string, body any) ([]byte, int, error) {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("apikey", apiKey)
	req.Header.Set("X-Grid-User-Assertion", assertion)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return raw, resp.StatusCode, err
}

func (c *Client) Credits(ctx context.Context, apiKey, assertion string) (map[string]any, error) {
	raw, status, err := c.accountRequest(ctx, http.MethodGet, "/account/credits", apiKey, assertion, nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("grid credits failed (%d): %s", status, raw)
	}
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func (c *Client) WalletLinkNonce(ctx context.Context) (string, error) {
	raw, status, err := c.accountRequest(ctx, http.MethodPost, "/accounts/wallet/nonce", "", "", nil)
	if err != nil {
		return "", err
	}
	if status != http.StatusOK {
		return "", fmt.Errorf("wallet-link nonce failed (%d)", status)
	}
	var result struct {
		Nonce string `json:"nonce"`
	}
	if err := json.Unmarshal(raw, &result); err != nil || result.Nonce == "" {
		return "", errors.New("invalid wallet-link nonce response")
	}
	return result.Nonce, nil
}

func (c *Client) LinkWallet(ctx context.Context, apiKey, assertion string, proof map[string]string) (map[string]any, error) {
	raw, status, err := c.accountRequest(ctx, http.MethodPost, "/account/identities/wallet/link/asserted", apiKey, assertion, proof)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("wallet link failed (%d): %s", status, raw)
	}
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return result, nil
}
