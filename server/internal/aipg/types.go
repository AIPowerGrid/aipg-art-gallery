package aipg

import (
	"encoding/json"
	"strconv"
)

type ModelStatus struct {
	Name        string          `json:"name"`
	Performance json.RawMessage `json:"performance"`
	Queued      json.RawMessage `json:"queued"`
	Jobs        json.RawMessage `json:"jobs"`
	Eta         json.RawMessage `json:"eta"`
	Type        string          `json:"type"`
	Count       json.RawMessage `json:"count"`
}

func (m ModelStatus) ParsePerformance() float64 { return parseFloat(m.Performance) }
func (m ModelStatus) ParseQueued() int          { return int(parseFloat(m.Queued)) }
func (m ModelStatus) ParseJobs() int            { return int(parseFloat(m.Jobs)) }
func (m ModelStatus) ParseETA() float64         { return parseFloat(m.Eta) }
func (m ModelStatus) ParseCount() int           { return int(parseFloat(m.Count)) }

func parseFloat(raw json.RawMessage) float64 {
	if len(raw) == 0 {
		return 0
	}
	var f float64
	if err := json.Unmarshal(raw, &f); err == nil {
		return f
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		if v, err := strconv.ParseFloat(s, 64); err == nil {
			return v
		}
	}
	return 0
}

type CreateJobPayload struct {
	Prompt           string         `json:"prompt"`
	NegativePrompt   string         `json:"negative_prompt,omitempty"`
	Models           []string       `json:"models"`
	NSFW             bool           `json:"nsfw"`
	CensorNSFW       bool           `json:"censor_nsfw"`
	TrustedWorkers   bool           `json:"trusted_workers"`
	R2               bool           `json:"r2"`
	Shared           bool           `json:"shared"`
	Params           map[string]any `json:"params"`
	SourceImage      string         `json:"source_image,omitempty"`
	SourceProcessing string         `json:"source_processing,omitempty"`
	SourceMask       string         `json:"source_mask,omitempty"`
	Extra            map[string]any `json:"extra,omitempty"`
	WalletAddress    string         `json:"wallet_id,omitempty"`
	MediaType        string         `json:"media_type,omitempty"` // "image" or "video"
}

type CreateJobResponse struct {
	ID      string  `json:"id"`
	Message string  `json:"message"`
	Kudos   float64 `json:"kudos"`
}

type JobStatusResponse struct {
	ID            string       `json:"id"`
	Done          bool         `json:"done"`
	Faulted       bool         `json:"faulted"`
	Processing    int          `json:"processing"`
	Finished      int          `json:"finished"`
	Waiting       int          `json:"waiting"`
	QueuePosition int          `json:"queue_position"`
	WaitTime      float64      `json:"wait_time"`
	Message       string       `json:"message"`
	Generations   []Generation `json:"generations"`
}

type Generation struct {
	ID       string      `json:"id"`
	Img      string      `json:"img"`
	ImgURL   string      `json:"img_url"`
	Image    string      `json:"image"`
	Mime     string      `json:"mime"`
	Seed     interface{} `json:"seed"`
	WorkerID string      `json:"worker_id"`
	Worker   string      `json:"worker_name"`
	State    string      `json:"state"`
	Video    string      `json:"video"`
}
