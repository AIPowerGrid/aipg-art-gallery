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

type IdentityExchange struct {
	AccessToken string `json:"access_token"`
	AccountID   string `json:"account_id"`
	Wallet      string `json:"wallet,omitempty"`
}

type WalletChallenge struct {
	Nonce     string `json:"nonce"`
	Message   string `json:"message"`
	ExpiresIn int    `json:"expires_in"`
	ChainID   int    `json:"chain_id"`
}

// MediaGenerationTimeout stays just beyond Core's 10-minute video ceiling so
// the gallery does not abandon a job that Core still considers live.
const MediaGenerationTimeout = 11 * time.Minute

func NewClient(baseURL, clientAgent string) *Client {
	return &Client{
		baseURL:     baseURL,
		clientAgent: clientAgent,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		// Media generation on the new grid is synchronous — the POST blocks
		// until the worker finishes. Video (LTX) can take minutes, so this
		// client stays just beyond Core's video ceiling.
		mediaClient: &http.Client{
			Timeout: MediaGenerationTimeout,
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

// ExchangeServiceIdentity turns one gallery-local authenticated subject into a
// short-lived Core user token. The service key remains the backend credential;
// the token carries user billing attribution without global impersonation.
func (c *Client) ExchangeServiceIdentity(ctx context.Context, apiKey, subject string) (string, error) {
	payload, _ := json.Marshal(map[string]string{"subject": subject})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/auth/service/exchange", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", apiKey)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("grid identity exchange failed (%d): %s", resp.StatusCode, raw)
	}
	var result struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(raw, &result); err != nil || result.AccessToken == "" {
		return "", errors.New("grid identity exchange returned no token")
	}
	return result.AccessToken, nil
}

// ExchangeGoogle asks Core to verify the same Google ID token and bind the
// gallery-local subject to the global canonical Google account.
func (c *Client) ExchangeGoogle(ctx context.Context, apiKey, idToken, appSubject string) (*IdentityExchange, error) {
	payload, _ := json.Marshal(map[string]string{
		"id_token": idToken, "app_subject": appSubject,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/auth/google/exchange", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", apiKey)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("grid Google exchange failed (%d): %s", resp.StatusCode, raw)
	}
	var result IdentityExchange
	if err := json.Unmarshal(raw, &result); err != nil || result.AccessToken == "" || result.AccountID == "" {
		return nil, errors.New("grid Google exchange returned an incomplete identity")
	}
	return &result, nil
}

func (c *Client) WalletChallenge(
	ctx context.Context,
	apiKey, address, domain, uri, appSubject string,
) (*WalletChallenge, error) {
	payload, _ := json.Marshal(map[string]any{
		"address": address, "domain": domain, "uri": uri,
		"chain_id": 8453, "app_subject": appSubject,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/auth/wallet/challenge", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", apiKey)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("grid wallet challenge failed (%d): %s", resp.StatusCode, raw)
	}
	var result WalletChallenge
	if err := json.Unmarshal(raw, &result); err != nil || result.Message == "" || result.Nonce == "" {
		return nil, errors.New("grid wallet challenge returned an incomplete proof")
	}
	return &result, nil
}

func (c *Client) ExchangeWallet(
	ctx context.Context,
	apiKey, message, signature, address, appSubject string,
) (*IdentityExchange, error) {
	payload, _ := json.Marshal(map[string]string{
		"message": message, "signature": signature,
		"address": address, "app_subject": appSubject,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/auth/wallet/exchange", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", apiKey)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("grid wallet exchange failed (%d): %s", resp.StatusCode, raw)
	}
	var result IdentityExchange
	if err := json.Unmarshal(raw, &result); err != nil ||
		result.AccessToken == "" || result.AccountID == "" || result.Wallet == "" {
		return nil, errors.New("grid wallet exchange returned an incomplete identity")
	}
	return &result, nil
}

// GenerateMedia calls the new grid's synchronous OpenAI-style endpoint and
// blocks until the worker returns a result. kind is "image" or "video"; it
// selects the path. The grid authenticates via the apikey header (it also
// accepts Authorization: Bearer) and gates every knob server-side.
func (c *Client) GenerateMedia(ctx context.Context, kind string, request GenerateRequest, apiKey, userToken, clientHeader string) (*GenerateResponse, error) {
	path := "/images/generations"
	switch kind {
	case "video":
		path = "/videos/generations"
	case "3d":
		path = "/3d/generations"
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
	if userToken != "" {
		req.Header.Set("X-Grid-User-Token", userToken)
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

func (c *Client) accountRequest(ctx context.Context, method, path, apiKey, userToken string, body any) ([]byte, int, error) {
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
	req.Header.Set("X-Grid-User-Token", userToken)
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

func (c *Client) Credits(ctx context.Context, apiKey, userToken string) (map[string]any, error) {
	raw, status, err := c.accountRequest(ctx, http.MethodGet, "/account/credits", apiKey, userToken, nil)
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

func (c *Client) LinkWallet(ctx context.Context, apiKey, userToken string, proof map[string]string) (map[string]any, error) {
	raw, status, err := c.accountRequest(ctx, http.MethodPost, "/account/identities/wallet/link/asserted", apiKey, userToken, proof)
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
