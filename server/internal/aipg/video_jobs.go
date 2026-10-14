// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package aipg

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"reflect"

	"github.com/google/uuid"
)

const videoJobResponseLimit = 64 * 1024
const videoJobBodyLimit = 64*1024*1024 + 64*1024

// VideoJobRequest is separate from the synchronous legacy video body. Core
// validates recipes, private media, admission and the atomic cost ceiling.
type VideoJobRequest struct {
	Prompt                     string             `json:"prompt"`
	Model                      string             `json:"model"`
	N                          int                `json:"n"`
	Size                       string             `json:"size,omitempty"`
	Frames                     int                `json:"frames"`
	FPS                        int                `json:"fps"`
	Seed                       *int64             `json:"seed,omitempty"`
	Image                      string             `json:"image,omitempty"`
	Keyframes                  []VideoJobKeyframe `json:"keyframes,omitempty"`
	ReferenceAudio             string             `json:"reference_audio,omitempty"`
	ReferenceVideo             string             `json:"reference_video,omitempty"`
	ReferenceImage             string             `json:"reference_image,omitempty"`
	NegativePrompt             string             `json:"negative_prompt,omitempty"`
	Steps                      *int               `json:"steps,omitempty"`
	CFGScale                   *float64           `json:"cfg_scale,omitempty"`
	GuideStrength              *float64           `json:"guide_strength,omitempty"`
	ReferenceStrength          *float64           `json:"reference_strength,omitempty"`
	ReferenceAttentionStrength *float64           `json:"reference_attention_strength,omitempty"`
	MotionAttentionStrength    *float64           `json:"motion_attention_strength,omitempty"`
	Worker                     string             `json:"worker,omitempty"`
	Style                      string             `json:"style,omitempty"`
	Audio                      bool               `json:"audio"`
	MaxCostMicroUSD            int64              `json:"max_cost_micro_usd"`
}

type VideoJobKeyframe struct {
	Image    string  `json:"image"`
	Frame    int     `json:"frame"`
	Strength float64 `json:"strength"`
}

type VideoJobMedia struct {
	URL    string `json:"url"`
	Key    string `json:"key"`
	SHA256 string `json:"sha256"`
	Seed   int64  `json:"seed"`
}

type VideoJobResult struct {
	Model      string          `json:"model"`
	Worker     string          `json:"worker"`
	GenTime    float64         `json:"gen_time"`
	RecipeRoot string          `json:"recipe_root"`
	Media      []VideoJobMedia `json:"media"`
}

type VideoJob struct {
	Schema        string          `json:"schema"`
	JobID         string          `json:"job_id"`
	RequestHash   string          `json:"request_hash"`
	Model         string          `json:"model"`
	State         string          `json:"state"`
	ReservedMicro int64           `json:"reserved_micro"`
	MaxCostMicro  int64           `json:"max_cost_micro"`
	ActualMicro   *int64          `json:"actual_micro"`
	Result        *VideoJobResult `json:"result"`
}

// VideoJobHTTPError contains no upstream body, prompt, media or credentials.
type VideoJobHTTPError struct{ Status int }

func (e *VideoJobHTTPError) Error() string {
	return fmt.Sprintf("Grid video request rejected (%d)", e.Status)
}

func canonicalVideoUUID(value string) bool {
	id, err := uuid.Parse(value)
	return err == nil && id.String() == value
}

func videoDigest(value string) bool {
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == 32 && hex.EncodeToString(decoded) == value
}

func (job *VideoJob) validate() error {
	invalid := errors.New("invalid Grid video receipt")
	if job.Schema != "aipg.video-job.v1" || !canonicalVideoUUID(job.JobID) ||
		!videoDigest(job.RequestHash) || job.Model == "" || len(job.Model) > 255 ||
		job.ReservedMicro <= 0 || job.MaxCostMicro < job.ReservedMicro {
		return invalid
	}
	if job.ActualMicro != nil && (*job.ActualMicro < 0 || *job.ActualMicro > job.MaxCostMicro) {
		return invalid
	}
	switch job.State {
	case "completed":
		if job.ActualMicro == nil || *job.ActualMicro != job.ReservedMicro || job.Result == nil ||
			job.Result.Model != job.Model || job.Result.GenTime < 0 || len(job.Result.Worker) > 255 ||
			len(job.Result.RecipeRoot) != 66 || job.Result.RecipeRoot[:2] != "0x" ||
			!videoDigest(job.Result.RecipeRoot[2:]) || len(job.Result.Media) != 1 {
			return invalid
		}
		item := job.Result.Media[0]
		location, err := url.Parse(item.URL)
		if err != nil || location.Scheme != "https" || location.Host == "" || location.User != nil ||
			len(item.URL) > 4096 || item.Key == "" || len(item.Key) > 2048 || !videoDigest(item.SHA256) ||
			item.Seed < 0 || item.Seed > 1<<53-1 {
			return invalid
		}
	case "pending_dispatch", "queued", "execution_uncertain":
		if job.Result != nil || job.ActualMicro != nil {
			return invalid
		}
	case "closed_without_result":
		if job.Result != nil {
			return invalid
		}
	default:
		return invalid
	}
	return nil
}

// ValidateVideoReplay binds polling to the saved economic and output identity.
// Closed-without-result is terminal, not a claim that a refund occurred.
func ValidateVideoReplay(previous, current *VideoJob) error {
	if previous == nil || current == nil || previous.validate() != nil || current.validate() != nil ||
		previous.JobID != current.JobID || previous.RequestHash != current.RequestHash ||
		previous.Model != current.Model || previous.ReservedMicro != current.ReservedMicro ||
		previous.MaxCostMicro != current.MaxCostMicro {
		return errors.New("Grid video receipt identity changed")
	}
	if previous.State == "completed" || previous.State == "closed_without_result" {
		if !reflect.DeepEqual(previous, current) {
			return errors.New("terminal Grid video receipt changed")
		}
	}
	return nil
}

// SubmitVideoJob makes exactly one POST. The caller must persist its request
// key before calling; a lost reply is recovered by GET, never another render.
func (c *Client) SubmitVideoJob(ctx context.Context, request VideoJobRequest, key, expectedRequestHash, apiKey, userToken string) (*VideoJob, error) {
	computedHash, intentErr := VideoIntentHash(request)
	if intentErr != nil || computedHash != expectedRequestHash {
		return nil, errors.New("video request does not match saved intent")
	}
	id, err := uuid.Parse(key)
	if err != nil || id.Version() != 4 || id.String() != key || !videoDigest(expectedRequestHash) || request.MaxCostMicroUSD <= 0 ||
		request.Model == "" || request.Prompt == "" || request.N != 1 ||
		request.Frames < 9 || request.Frames > 337 || request.Frames%8 != 1 || request.FPS != 24 {
		return nil, errors.New("invalid durable video request")
	}
	if request.Seed != nil && (*request.Seed < 0 || *request.Seed > 1<<53-1) {
		return nil, errors.New("invalid durable video seed")
	}
	body, err := json.Marshal(request)
	if err != nil || len(body) > videoJobBodyLimit {
		return nil, errors.New("invalid durable video body")
	}
	job, err := c.videoJobRequest(ctx, http.MethodPost, "/videos/jobs", body, key, apiKey, userToken)
	if err != nil {
		return nil, err
	}
	if job.Model != request.Model || job.MaxCostMicro != request.MaxCostMicroUSD || job.RequestHash != expectedRequestHash ||
		(job.Result != nil && request.Seed != nil && job.Result.Media[0].Seed != *request.Seed) {
		return nil, &generationOutcomeUnknown{cause: errors.New("video submission commitment mismatch")}
	}
	return job, nil
}

// RecoverVideoJob requires exactly one selector and never includes source media.
// A missing receipt is unknown; it does not authorize resubmission.
func (c *Client) RecoverVideoJob(ctx context.Context, jobID, key, expectedRequestHash, apiKey, userToken string) (*VideoJob, error) {
	if (jobID == "") == (key == "") || !videoDigest(expectedRequestHash) {
		return nil, errors.New("exactly one video recovery selector required")
	}
	path := "/videos/jobs"
	if jobID != "" {
		if !canonicalVideoUUID(jobID) {
			return nil, errors.New("invalid video job ID")
		}
		path += "/" + jobID
	} else {
		id, err := uuid.Parse(key)
		if err != nil || id.Version() != 4 || id.String() != key {
			return nil, errors.New("invalid video request key")
		}
	}
	job, err := c.videoJobRequest(ctx, http.MethodGet, path, nil, key, apiKey, userToken)
	if err == nil && job != nil && (job.RequestHash != expectedRequestHash || jobID != "" && job.JobID != jobID) {
		return nil, errors.New("Grid video recovery identity mismatch")
	}
	return job, err
}

func (c *Client) videoJobRequest(ctx context.Context, method, path string, body []byte, key, apiKey, userToken string) (*VideoJob, error) {
	if apiKey == "" || userToken == "" {
		return nil, errors.New("delegated video identity required")
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, errors.New("invalid Grid video endpoint")
	}
	req.Header.Set("apikey", apiKey)
	req.Header.Set("X-Grid-User-Token", userToken)
	req.Header.Set("Client-Agent", c.clientAgent)
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	if method == http.MethodPost {
		req.Header.Set("Content-Type", "application/json")
		// Transport treats Idempotency-Key as replayable on reused connections.
		// Keep the key for Core deduplication, but never resend this source body.
		req.GetBody = nil
	}
	client := *c.httpClient
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	unknown := func() (*VideoJob, error) {
		if method == http.MethodPost {
			return nil, &generationOutcomeUnknown{cause: errors.New("Grid video submission unavailable")}
		}
		return nil, errors.New("Grid video recovery unavailable")
	}
	response, err := client.Do(req)
	if err != nil {
		return unknown()
	}
	defer response.Body.Close()
	if method == http.MethodGet && response.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if response.StatusCode >= 400 && response.StatusCode < 500 {
		return nil, &VideoJobHTTPError{Status: response.StatusCode}
	}
	if response.StatusCode != http.StatusOK && (method != http.MethodPost || response.StatusCode != http.StatusAccepted) {
		return unknown()
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, videoJobResponseLimit+1))
	if err != nil || len(raw) > videoJobResponseLimit {
		return unknown()
	}
	var job VideoJob
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil {
		return unknown()
	}
	for _, field := range []string{"schema", "job_id", "request_hash", "model", "state", "reserved_micro", "max_cost_micro", "actual_micro", "result"} {
		if _, present := fields[field]; !present {
			return unknown()
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&job) != nil || decoder.Decode(new(any)) != io.EOF || job.validate() != nil {
		return unknown()
	}
	if job.Result != nil {
		var resultFields map[string]json.RawMessage
		if json.Unmarshal(fields["result"], &resultFields) != nil {
			return unknown()
		}
		for _, field := range []string{"model", "worker", "gen_time", "recipe_root", "media"} {
			if value, present := resultFields[field]; !present || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
				return unknown()
			}
		}
		var mediaFields []map[string]json.RawMessage
		if json.Unmarshal(resultFields["media"], &mediaFields) != nil || len(mediaFields) != 1 {
			return unknown()
		}
		for _, field := range []string{"url", "key", "sha256", "seed"} {
			if value, present := mediaFields[0][field]; !present || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
				return unknown()
			}
		}
	}
	if method == http.MethodPost && ((job.State == "completed" || job.State == "closed_without_result") != (response.StatusCode == http.StatusOK)) {
		return unknown()
	}
	return &job, nil
}
