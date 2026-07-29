package aipg

import (
	"encoding/json"
	"strconv"
)

type ModelStatus struct {
	Name         string          `json:"name"`
	Performance  json.RawMessage `json:"performance"`
	Queued       json.RawMessage `json:"queued"`
	Jobs         json.RawMessage `json:"jobs"`
	Eta          json.RawMessage `json:"eta"`
	Type         string          `json:"type"`
	Count        json.RawMessage `json:"count"`
	Capabilities []string        `json:"capabilities"`
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

// --- New grid /v1 synchronous generation (OpenAI-shaped) ---
//
// The new grid (api.aipowergrid.io/v1) replaces the legacy async horde: a single
// POST blocks until the worker returns the result, so there is no poll loop on
// the wire. The gallery bridges this back to its own async POST /jobs + poll
// contract via an in-memory pending store (see app/pendingstore.go).

// GenerateRequest is the OpenAI-style body for /v1/images/generations and
// /v1/videos/generations. Knobs are omitempty: anything left unset falls back
// to the model's recipe default on the grid (the "dumb happy path"), and the
// grid rejects (422) out-of-band overrides rather than silently clamping.
type GenerateRequest struct {
	Prompt         string  `json:"prompt"`
	Model          string  `json:"model"`
	N              int     `json:"n,omitempty"`
	Size           string  `json:"size,omitempty"`            // "WxH"; omit to let grid/source decide
	Image          string  `json:"image,omitempty"`           // img2img / img2video source (base64 / data URI)
	ImageEnd       string  `json:"image_end,omitempty"`       // fill-between end-frame anchor (base64 / data URI); FLF recipes
	TimelineData   string  `json:"timeline,omitempty"`        // LTX Director editor state, stringified (segments may embed imageB64/audioB64 media)
	LocalPrompts   string  `json:"local_prompts,omitempty"`   // Director prompt relay: "|"-delimited per-segment prompts
	SegmentLengths string  `json:"segment_lengths,omitempty"` // Director prompt relay: ","-delimited frame counts
	GuideStrength  string  `json:"guide_strength,omitempty"`  // Director image guides: ","-delimited strengths
	Loras          []any   `json:"loras,omitempty"`           // CivitAI passthrough (grid-gated + blacklisted)
	OutputFormat   string  `json:"output_format,omitempty"`   // png|jpeg|webp (image only)
	ResponseFormat string  `json:"response_format,omitempty"` // url|b64_json
	NegativePrompt string  `json:"negative_prompt,omitempty"`
	Seed           string  `json:"seed,omitempty"`
	Steps          int     `json:"steps,omitempty"`
	CfgScale       float64 `json:"cfg_scale,omitempty"`
	Sampler        string  `json:"sampler,omitempty"`
	Scheduler      string  `json:"scheduler,omitempty"`
	Seconds        float64 `json:"seconds,omitempty"`        // video only
	FPS            int     `json:"fps,omitempty"`            // video only
	Worker         string  `json:"worker,omitempty"`         // soft-affinity: prefer this worker (account must own it)
	Style          string  `json:"style,omitempty"`          // curated style id; expanded server-side by the grid
	ProgressToken  string  `json:"progress_token,omitempty"` // poll live % at GET /v1/progress/{token}
}

// Style is one entry from the grid's GET /v1/styles registry.
type Style struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Model       string   `json:"model"`
	JobType     string   `json:"job_type"`
	Aspect      string   `json:"aspect"`
	Locked      []string `json:"locked"`
}

// GenerateResponse is the OpenAI-style media generation envelope.
type GenerateResponse struct {
	Created int64           `json:"created"`
	Data    []GeneratedItem `json:"data"`
	Grid    *GridMeta       `json:"grid,omitempty"`
}

type GeneratedItem struct {
	URL           string `json:"url"`
	B64JSON       string `json:"b64_json"`
	RevisedPrompt string `json:"revised_prompt"`
	Seed          *int64 `json:"seed,omitempty"`
}

// GridMeta is the per-job provenance the grid attaches to a generation,
// including the durable Core job identifier used by completion and credit ledgers.
type GridMeta struct {
	JobID      string   `json:"job_id"`
	Worker     string   `json:"worker"`
	GenTime    *float64 `json:"gen_time"`
	Model      string   `json:"model"`
	TTFT       *float64 `json:"ttft,omitempty"`
	TokensPerS *float64 `json:"tokens_per_s,omitempty"`
}

type CreditQuoteRequest struct {
	Model    string  `json:"model"`
	Modality string  `json:"modality"`
	N        int     `json:"n,omitempty"`
	Seconds  float64 `json:"seconds,omitempty"`
}

type CreditPocket struct {
	RemainingMicro int64   `json:"remaining_micro"`
	RemainingUSD   float64 `json:"remaining_usd"`
	Active         bool    `json:"active"`
}

type PaidCreditPocket struct {
	BalanceMicro int64   `json:"balance_micro"`
	BalanceUSD   float64 `json:"balance_usd"`
}

type CreditEstimate struct {
	Model                string   `json:"model"`
	Modality             string   `json:"modality"`
	Priced               bool     `json:"priced"`
	Reason               *string  `json:"reason"`
	CostMicro            *int64   `json:"cost_micro"`
	CostUSD              *float64 `json:"cost_usd"`
	BalanceSufficient    bool     `json:"balance_sufficient"`
	FromPromotionalMicro *int64   `json:"from_promotional_micro"`
	FromDailyMicro       *int64   `json:"from_daily_micro"`
	FromPaidMicro        *int64   `json:"from_paid_micro"`
	ShortfallMicro       *int64   `json:"shortfall_micro"`
	N                    *int     `json:"n"`
	Seconds              *float64 `json:"seconds"`
}

type CreditQuote struct {
	AccountID           string           `json:"account_id"`
	Promotional         CreditPocket     `json:"promotional"`
	Free                CreditPocket     `json:"free"`
	Paid                PaidCreditPocket `json:"paid"`
	TotalSpendableMicro int64            `json:"total_spendable_micro"`
	TotalSpendableUSD   float64          `json:"total_spendable_usd"`
	TotalPreviewMicro   int64            `json:"total_preview_micro"`
	TotalPreviewUSD     float64          `json:"total_preview_usd"`
	ChargingEnabled     bool             `json:"charging_enabled"`
	ChargingMode        string           `json:"charging_mode"`
	Estimate            CreditEstimate   `json:"estimate"`
}
