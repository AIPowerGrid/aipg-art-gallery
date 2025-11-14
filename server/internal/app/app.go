package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/config"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/models"
)

type App struct {
	cfg     config.Config
	catalog models.Catalog
	client  *aipg.Client
}

func New(cfg config.Config) (*App, error) {
	catalog, err := models.LoadCatalog(cfg.ModelPresetPath)
	if err != nil {
		return nil, err
	}
	return &App{
		cfg:     cfg,
		catalog: catalog,
		client:  aipg.NewClient(cfg.APIBaseURL, cfg.ClientAgent),
	}, nil
}

func (a *App) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   a.allowedOrigins(),
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "apikey"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(api chi.Router) {
		api.Get("/models", a.handleListModels)
		api.Get("/models/{id}", a.handleGetModel)

		api.Post("/jobs", a.handleCreateJob)
		api.Get("/jobs/{id}", a.handleJobStatus)
	})

	return r
}

func (a *App) allowedOrigins() []string {
	if len(a.cfg.AllowedOrigins) == 0 {
		return []string{"*"}
	}
	return a.cfg.AllowedOrigins
}

func (a *App) handleListModels(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	stats, err := a.client.FetchModelStats(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	byName := make(map[string]aipg.ModelStatus, len(stats))
	for _, s := range stats {
		byName[strings.ToLower(s.Name)] = s
	}

	presets := a.catalog.List()
	response := make([]ModelView, 0, len(presets))
	for _, preset := range presets {
		stat := byName[strings.ToLower(preset.ID)]
		response = append(response, buildModelView(preset, stat))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"models": response,
	})
}

func (a *App) handleGetModel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	preset, ok := a.catalog.Get(id)
	if !ok {
		writeError(w, http.StatusNotFound, fmt.Errorf("model %s not found", id))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	stats, err := a.client.FetchModelStats(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	var match aipg.ModelStatus
	for _, s := range stats {
		if strings.EqualFold(s.Name, preset.ID) {
			match = s
			break
		}
	}

	writeJSON(w, http.StatusOK, buildModelView(preset, match))
}

func (a *App) handleCreateJob(w http.ResponseWriter, r *http.Request) {
	var req CreateJobRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Errorf("invalid payload: %w", err))
		return
	}

	if err := req.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	preset, ok := a.catalog.Get(req.ModelID)
	if !ok {
		writeError(w, http.StatusBadRequest, fmt.Errorf("unknown model: %s", req.ModelID))
		return
	}

	payload := buildCreateJobPayload(req, preset)

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	apiKey := req.APIKey
	if apiKey == "" {
		apiKey = a.cfg.DefaultAPIKey
	}
	if apiKey == "" {
		writeError(w, http.StatusBadRequest, errors.New("apiKey is required"))
		return
	}

	resp, err := a.client.CreateJob(ctx, payload, apiKey, a.cfg.ClientAgent)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"jobId":  resp.ID,
		"status": "queued",
	})
}

func (a *App) handleJobStatus(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("job id required"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	status, err := a.client.JobStatus(ctx, jobID)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	writeJSON(w, http.StatusOK, buildJobView(status))
}

type ModelView struct {
	ID                   string               `json:"id"`
	DisplayName          string               `json:"displayName"`
	Type                 string               `json:"type"`
	Description          string               `json:"description"`
	Tags                 []string             `json:"tags"`
	Capabilities         []string             `json:"capabilities"`
	Samplers             []string             `json:"samplers"`
	Schedulers           []string             `json:"schedulers"`
	Status               string               `json:"status"`
	OnlineWorkers        int                  `json:"onlineWorkers"`
	QueueLength          int                  `json:"queueLength"`
	EstimatedWaitSeconds float64              `json:"estimatedWaitSeconds"`
	Defaults             models.ModelDefaults `json:"defaults"`
	Limits               models.ModelLimits   `json:"limits"`
}

func buildModelView(preset models.ModelPreset, stat aipg.ModelStatus) ModelView {
	status := "offline"
	if stat.ParseCount() > 0 {
		status = "online"
	}
	return ModelView{
		ID:                   preset.ID,
		DisplayName:          preset.DisplayName,
		Type:                 preset.Type,
		Description:          preset.Description,
		Tags:                 preset.Tags,
		Capabilities:         preset.Capabilities,
		Samplers:             preset.Samplers,
		Schedulers:           preset.Schedulers,
		Status:               status,
		OnlineWorkers:        stat.ParseCount(),
		QueueLength:          stat.ParseQueued(),
		EstimatedWaitSeconds: stat.ParseETA(),
		Defaults:             preset.Defaults,
		Limits:               preset.Limits,
	}
}

type CreateJobRequest struct {
	ModelID          string           `json:"modelId"`
	Prompt           string           `json:"prompt"`
	NegativePrompt   string           `json:"negativePrompt"`
	APIKey           string           `json:"apiKey"`
	Params           GenerationParams `json:"params"`
	NSFW             bool             `json:"nsfw"`
	Public           bool             `json:"public"`
	SourceImage      string           `json:"sourceImage"`
	SourceMask       string           `json:"sourceMask"`
	SourceProcessing string           `json:"sourceProcessing"`
}

type GenerationParams struct {
	Width     int     `json:"width"`
	Height    int     `json:"height"`
	Steps     int     `json:"steps"`
	CfgScale  float64 `json:"cfgScale"`
	Sampler   string  `json:"sampler"`
	Scheduler string  `json:"scheduler"`
	Seed      string  `json:"seed"`
	Denoise   float64 `json:"denoise"`
	Length    int     `json:"length"`
	FPS       int     `json:"fps"`
	Tiling    bool    `json:"tiling"`
	HiresFix  bool    `json:"hiresFix"`
}

func (r CreateJobRequest) Validate() error {
	if strings.TrimSpace(r.Prompt) == "" {
		return errors.New("prompt is required")
	}
	if strings.TrimSpace(r.ModelID) == "" {
		return errors.New("modelId is required")
	}
	return nil
}

func buildCreateJobPayload(req CreateJobRequest, preset models.ModelPreset) aipg.CreateJobPayload {
	params := map[string]any{
		"sampler_name":       pickString(req.Params.Sampler, preset.Defaults.Sampler),
		"scheduler":          pickString(req.Params.Scheduler, preset.Defaults.Scheduler),
		"cfg_scale":          pickFloat(req.Params.CfgScale, preset.Defaults.CfgScale),
		"steps":              pickInt(req.Params.Steps, preset.Defaults.Steps),
		"karras":             strings.EqualFold(pickString(req.Params.Scheduler, preset.Defaults.Scheduler), "karras"),
		"hires_fix":          req.Params.HiresFix,
		"tiling":             req.Params.Tiling,
		"denoising_strength": pickFloat(req.Params.Denoise, preset.Defaults.Denoise),
	}
	if w := pickInt(req.Params.Width, preset.Defaults.Width); w > 0 {
		params["width"] = w
	}
	if h := pickInt(req.Params.Height, preset.Defaults.Height); h > 0 {
		params["height"] = h
	}
	if req.Params.Seed != "" {
		params["seed"] = req.Params.Seed
	}
	if l := pickInt(req.Params.Length, preset.Defaults.Length); l > 0 {
		params["length"] = l
		params["video_length"] = l
	}
	if fps := pickInt(req.Params.FPS, preset.Defaults.FPS); fps > 0 {
		params["fps"] = fps
	}

	payload := aipg.CreateJobPayload{
		Prompt:         req.Prompt,
		NegativePrompt: req.NegativePrompt,
		Models:         []string{preset.ID},
		NSFW:           req.NSFW,
		CensorNSFW:     !req.NSFW,
		TrustedWorkers: true,
		R2:             true,
		Shared:         req.Public,
		Params:         params,
	}

	if req.SourceImage != "" {
		payload.SourceImage = req.SourceImage
	}
	if req.SourceMask != "" {
		payload.SourceMask = req.SourceMask
	}
	if req.SourceProcessing != "" {
		payload.SourceProcessing = req.SourceProcessing
	}

	return payload
}

type JobView struct {
	JobID         string           `json:"jobId"`
	Status        string           `json:"status"`
	Faulted       bool             `json:"faulted"`
	WaitTime      float64          `json:"waitTime"`
	QueuePosition int              `json:"queuePosition"`
	Generations   []GenerationView `json:"generations"`
}

type GenerationView struct {
	ID       string `json:"id"`
	Seed     string `json:"seed"`
	Kind     string `json:"kind"`
	MimeType string `json:"mimeType"`
	URL      string `json:"url,omitempty"`
	Base64   string `json:"base64,omitempty"`
}

func buildJobView(resp *aipg.JobStatusResponse) JobView {
	status := "queued"
	if resp.Faulted {
		status = "faulted"
	} else if resp.Done {
		status = "completed"
	} else if resp.Processing > 0 {
		status = "processing"
	}

	views := make([]GenerationView, 0, len(resp.Generations))
	for _, gen := range resp.Generations {
		view := GenerationView{
			ID:       gen.ID,
			Seed:     fmt.Sprintf("%v", gen.Seed),
			MimeType: gen.Mime,
		}
		switch {
		case gen.Video != "":
			view.Kind = "video"
			view.URL = gen.Video
		case strings.Contains(strings.ToLower(gen.Mime), "video"):
			view.Kind = "video"
			view.URL = firstNonEmpty(gen.Video, gen.ImgURL, gen.Img)
		default:
			view.Kind = "image"
			view.URL = firstNonEmpty(gen.ImgURL, gen.Img)
			view.Base64 = normalizeBase64(gen.Image)
			if view.Base64 == "" && strings.HasPrefix(view.URL, "data:image") {
				view.Base64 = view.URL
				view.URL = ""
			}
		}
		views = append(views, view)
	}

	return JobView{
		JobID:         resp.ID,
		Status:        status,
		Faulted:       resp.Faulted,
		WaitTime:      resp.WaitTime,
		QueuePosition: resp.QueuePosition,
		Generations:   views,
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]any{
		"error":  err.Error(),
		"status": status,
	})
}

func pickString(value, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func pickInt(value, fallback int) int {
	if value > 0 {
		return value
	}
	return fallback
}

func pickFloat(value, fallback float64) float64 {
	if value > 0 {
		return value
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func normalizeBase64(raw string) string {
	data := strings.TrimSpace(raw)
	if data == "" {
		return ""
	}
	if strings.HasPrefix(data, "data:image") {
		return data
	}
	if len(data) > 50 {
		return "data:image/webp;base64," + data
	}
	return ""
}
