package aipg

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type Client struct {
	baseURL     string
	httpClient  *http.Client
	clientAgent string
}

func NewClient(baseURL, clientAgent string) *Client {
	return &Client{
		baseURL:     baseURL,
		clientAgent: clientAgent,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
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

func (c *Client) CreateJob(ctx context.Context, request CreateJobPayload, apiKey, clientHeader string) (*CreateJobResponse, error) {
	payload, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}

	// Log the payload being sent to Grid API
	log.Printf("🌐 Grid API request: models=%v, media_type=%s, prompt_len=%d", 
		request.Models, request.MediaType, len(request.Prompt))
	log.Printf("🌐 Grid API full payload: %s", string(payload))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/generate/async", c.baseURL), bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Client-Agent", clientHeader)
	if apiKey != "" {
		req.Header.Set("apikey", apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	log.Printf("🌐 Grid API response: status=%d, body=%s", resp.StatusCode, string(body))
	
	if resp.StatusCode != http.StatusAccepted {
		return nil, fmt.Errorf("create job failed (%d): %s", resp.StatusCode, body)
	}

	var parsed CreateJobResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return &parsed, nil
}

func (c *Client) JobStatus(ctx context.Context, jobID string) (*JobStatusResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/generate/status/%s", c.baseURL, jobID), nil)
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
		return nil, fmt.Errorf("job status failed (%d): %s", resp.StatusCode, body)
	}

	var parsed JobStatusResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return &parsed, nil
}
