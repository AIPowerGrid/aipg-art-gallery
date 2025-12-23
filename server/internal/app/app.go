package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/config"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/gallery"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/models"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/modelvault"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/prompts"
)

type App struct {
	cfg          config.Config
	catalog      models.Catalog
	client       *aipg.Client
	vaultClient  *modelvault.Client
	galleryStore *gallery.Store
}

func New(cfg config.Config) (*App, error) {
	catalog, err := models.LoadCatalog(cfg.ModelPresetPath)
	if err != nil {
		return nil, err
	}

	// Initialize ModelVault client for blockchain model registry
	vaultClient, err := modelvault.NewClient(
		cfg.ModelVaultRPCURL,
		cfg.ModelVaultContractAddress,
		cfg.ModelVaultEnabled,
	)
	if err != nil {
		log.Printf("Warning: ModelVault client initialization failed: %v", err)
		// Continue without blockchain - use presets only
		vaultClient, _ = modelvault.NewClient("", "", false)
	}

	// Initialize gallery store (persists to file)
	galleryStore := gallery.NewStore(cfg.GalleryStorePath, 500)
	log.Printf("Gallery store initialized with %d items", len(galleryStore.List("", 0)))

	return &App{
		cfg:          cfg,
		catalog:      catalog,
		client:       aipg.NewClient(cfg.APIBaseURL, cfg.ClientAgent),
		vaultClient:  vaultClient,
		galleryStore: galleryStore,
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

		// Public gallery endpoints
		api.Get("/gallery", a.handleListGallery)
		api.Post("/gallery", a.handleAddToGallery)
		api.Get("/gallery/wallet/{wallet}", a.handleListByWallet)
	})

	return r
}

func (a *App) allowedOrigins() []string {
	if len(a.cfg.AllowedOrigins) == 0 {
		return []string{"*"}
	}
	return a.cfg.AllowedOrigins
}

// modelNameAliases maps preset IDs to possible Grid API model names
// This handles naming variations between what workers report and our preset IDs
var modelNameAliases = map[string][]string{
	// WAN 2.2 models - underscores vs hyphens, case variations
	"wan2.2_ti2v_5B":     {"wan2.2_ti2v_5b", "wan2_2_ti2v_5b", "wan2.2-ti2v-5b", "wan2.2_ti2v_5B"},
	"wan2.2-t2v-a14b":    {"wan2_2_t2v_14b", "wan2.2-t2v-14b", "wan2.2_t2v_a14b", "wan2.2-t2v-a14b"},
	"wan2.2-t2v-a14b-hq": {"wan2_2_t2v_14b_hq", "wan2.2-t2v-14b-hq", "wan2.2_t2v_a14b_hq", "wan2.2-t2v-a14b-hq"},
	
	// FLUX models - case and punctuation variations
	"FLUX.1-dev":                     {"flux.1-dev", "flux1-dev", "flux1.dev", "flux1_dev"},
	"flux.1-krea-dev":                {"flux1-krea-dev", "flux1_krea_dev", "flux.1_krea_dev", "krea"},
	"FLUX.1-dev-Kontext-fp8-scaled":  {"flux.1-dev-kontext-fp8-scaled", "flux1-dev-kontext-fp8-scaled", "flux1_dev_kontext_fp8_scaled", "flux_kontext_dev_basic"},
	"Flux.1-Schnell fp8 (Compact)":   {"flux.1-schnell fp8 (compact)", "flux1-schnell-fp8-compact", "flux.1-schnell"},
	
	// Chroma
	"Chroma": {"chroma", "chroma_final"},
	
	// SDXL
	"SDXL 1.0": {"sdxl 1.0", "sdxl1", "sdxl", "sdxl1.0"},
	
	// Other models
	"ltxv": {"ltx-video", "ltxv-13b"},
	"ICBINP - I Can't Believe It's Not Photography": {"icbinp", "icbinp - i can't believe it's not photography"},
	"ICBINP XL": {"icbinp xl", "icbinp-xl"},
}

func (a *App) handleListModels(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	stats, err := a.client.FetchModelStats(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}

	// Debug: log all model stats with queued jobs
	for _, s := range stats {
		if s.ParseQueued() > 0 || s.ParseCount() > 0 {
			log.Printf("Grid API: name=%q workers=%d queued=%d eta=%.1f", s.Name, s.ParseCount(), s.ParseQueued(), s.ParseETA())
		}
	}

	byName := make(map[string]aipg.ModelStatus, len(stats))
	for _, s := range stats {
		// Index by lowercase name
		byName[strings.ToLower(s.Name)] = s
		// Also index by exact name for case-sensitive matches
		byName[s.Name] = s
	}

	// Fetch on-chain models if available
	var chainModels map[string]*modelvault.OnChainModel
	if a.vaultClient.IsEnabled() {
		chainModels, err = a.vaultClient.FetchAllModels(ctx)
		if err != nil {
			log.Printf("Warning: failed to fetch chain models: %v", err)
		}
	}

	presets := a.catalog.List()
	response := make([]ModelView, 0, len(presets))
	for _, preset := range presets {
		// Look up stats using preset ID and all known aliases
		stat := lookupModelStats(preset.ID, byName)
		
		// Merge chain data if available
		var chainModel *modelvault.OnChainModel
		if chainModels != nil {
			chainModel = chainModels[preset.ID]
			if chainModel == nil {
				chainModel = chainModels[strings.ToLower(preset.ID)]
			}
		}
		
		response = append(response, buildModelView(preset, stat, chainModel))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"models":      response,
		"chainSource": a.vaultClient.IsEnabled(),
	})
}

// lookupModelStats finds model stats using the preset ID and all known aliases
// This handles naming variations between what workers report and our preset IDs
func lookupModelStats(presetID string, byName map[string]aipg.ModelStatus) aipg.ModelStatus {
	// Try exact match first
	if stat, ok := byName[presetID]; ok {
		return stat
	}
	
	// Try lowercase match
	presetLower := strings.ToLower(presetID)
	if stat, ok := byName[presetLower]; ok {
		return stat
	}
	
	// Try aliases for this preset ID
	if aliases, ok := modelNameAliases[presetID]; ok {
		for _, alias := range aliases {
			if stat, ok := byName[strings.ToLower(alias)]; ok {
				return stat
			}
			if stat, ok := byName[alias]; ok {
				return stat
			}
		}
	}
	
	// Also check if any alias list contains our preset ID (reverse lookup)
	for _, aliases := range modelNameAliases {
		for _, alias := range aliases {
			if strings.EqualFold(alias, presetID) {
				// Found preset ID as an alias, try the canonical name and other aliases
				for _, a := range aliases {
					if stat, ok := byName[strings.ToLower(a)]; ok {
						return stat
					}
					if stat, ok := byName[a]; ok {
						return stat
					}
				}
			}
		}
	}
	
	// Try normalized matching (replace hyphens/underscores/dots)
	normalized := strings.ReplaceAll(strings.ReplaceAll(presetLower, "-", "_"), ".", "_")
	for name, stat := range byName {
		nameNorm := strings.ReplaceAll(strings.ReplaceAll(strings.ToLower(name), "-", "_"), ".", "_")
		if nameNorm == normalized {
			return stat
		}
	}
	
	// Return empty stats if not found
	return aipg.ModelStatus{}
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

	// Build name lookup map
	byName := make(map[string]aipg.ModelStatus, len(stats))
	for _, s := range stats {
		byName[strings.ToLower(s.Name)] = s
		byName[s.Name] = s
	}

	// Use the same lookup logic as handleListModels
	match := lookupModelStats(preset.ID, byName)

	// Fetch chain model data if available
	var chainModel *modelvault.OnChainModel
	if a.vaultClient.IsEnabled() {
		chainModel, _ = a.vaultClient.FindModel(ctx, preset.ID)
	}

	writeJSON(w, http.StatusOK, buildModelView(preset, match, chainModel))
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
	
	log.Printf("📤 Creating job: modelId=%s, preset.ID=%s, payload.Models=%v", req.ModelID, preset.ID, payload.Models)

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
	// Chain-derived fields
	OnChain     bool                      `json:"onChain"`
	Constraints *ChainConstraintsView     `json:"constraints,omitempty"`
}

// ChainConstraintsView represents blockchain-derived generation constraints
type ChainConstraintsView struct {
	StepsMin int     `json:"stepsMin,omitempty"`
	StepsMax int     `json:"stepsMax,omitempty"`
	CfgMin   float64 `json:"cfgMin,omitempty"`
	CfgMax   float64 `json:"cfgMax,omitempty"`
	ClipSkip int     `json:"clipSkip,omitempty"`
}

func buildModelView(preset models.ModelPreset, stat aipg.ModelStatus, chainModel *modelvault.OnChainModel) ModelView {
	status := "offline"
	if stat.ParseCount() > 0 {
		status = "online"
	}
	
	view := ModelView{
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
		OnChain:              chainModel != nil,
	}
	
	// Merge chain model data if available
	if chainModel != nil {
		// Override description if chain has a better one
		if chainModel.Description != "" && chainModel.Description != preset.Description {
			view.Description = chainModel.Description
		}
		
		// Add chain constraints
		if chainModel.Constraints != nil {
			view.Constraints = &ChainConstraintsView{
				StepsMin: int(chainModel.Constraints.StepsMin),
				StepsMax: int(chainModel.Constraints.StepsMax),
				CfgMin:   chainModel.Constraints.CfgMin,
				CfgMax:   chainModel.Constraints.CfgMax,
				ClipSkip: int(chainModel.Constraints.ClipSkip),
			}
			
			// Update limits from chain constraints if they're more restrictive
			if view.Limits.Steps != nil && chainModel.Constraints.StepsMax > 0 {
				if int(chainModel.Constraints.StepsMax) < view.Limits.Steps.Max {
					view.Limits.Steps.Max = int(chainModel.Constraints.StepsMax)
				}
				if int(chainModel.Constraints.StepsMin) > view.Limits.Steps.Min {
					view.Limits.Steps.Min = int(chainModel.Constraints.StepsMin)
				}
			}
			if view.Limits.CfgScale != nil && chainModel.Constraints.CfgMax > 0 {
				if chainModel.Constraints.CfgMax < view.Limits.CfgScale.Max {
					view.Limits.CfgScale.Max = chainModel.Constraints.CfgMax
				}
				if chainModel.Constraints.CfgMin > view.Limits.CfgScale.Min {
					view.Limits.CfgScale.Min = chainModel.Constraints.CfgMin
				}
			}
		}
	}
	
	return view
}

type CreateJobRequest struct {
	ModelID          string           `json:"modelId"`
	Prompt           string           `json:"prompt"`
	NegativePrompt   string           `json:"negativePrompt"`
	APIKey           string           `json:"apiKey"`
	WalletAddress    string           `json:"walletAddress"`
	Params           GenerationParams `json:"params"`
	NSFW             bool             `json:"nsfw"`
	Public           bool             `json:"public"`
	SourceImage      string           `json:"sourceImage"`
	SourceMask       string           `json:"sourceMask"`
	SourceProcessing string           `json:"sourceProcessing"`
	MediaType        string           `json:"mediaType"` // "image" or "video"
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

// mapSamplerName converts ComfyUI sampler names to Grid API format
// The Grid API expects specific sampler names with k_ prefix
func mapSamplerName(sampler string) string {
	samplerMap := map[string]string{
		// Direct mappings
		"uni_pc":           "dpmsolver",
		"unipc":            "dpmsolver",
		"uni_pc_bh2":       "dpmsolver",
		"dpm_2":            "k_dpm_2",
		"dpm_2_ancestral":  "k_dpm_2_a",
		"euler":            "k_euler",
		"euler_ancestral":  "k_euler_a",
		"heun":             "k_heun",
		"lms":              "k_lms",
		"dpm_fast":         "k_dpm_fast",
		"dpm_adaptive":     "k_dpm_adaptive",
		"dpmpp_2s_ancestral": "k_dpmpp_2s_a",
		"dpmpp_2m":         "k_dpmpp_2m",
		"dpmpp_sde":        "k_dpmpp_sde",
		"ddim":             "DDIM",
		// Already in correct format - pass through
		"k_euler":          "k_euler",
		"k_euler_a":        "k_euler_a",
		"k_dpm_2":          "k_dpm_2",
		"k_dpm_2_a":        "k_dpm_2_a",
		"k_heun":           "k_heun",
		"k_lms":            "k_lms",
		"k_dpm_fast":       "k_dpm_fast",
		"k_dpm_adaptive":   "k_dpm_adaptive",
		"k_dpmpp_2s_a":     "k_dpmpp_2s_a",
		"k_dpmpp_2m":       "k_dpmpp_2m",
		"k_dpmpp_sde":      "k_dpmpp_sde",
		"DDIM":             "DDIM",
		"dpmsolver":        "dpmsolver",
		"lcm":              "lcm",
	}

	// Case-insensitive lookup
	lowerSampler := strings.ToLower(sampler)
	if mapped, ok := samplerMap[lowerSampler]; ok {
		return mapped
	}
	if mapped, ok := samplerMap[sampler]; ok {
		return mapped
	}

	// Default to k_euler if unknown
	return "k_euler"
}

func buildCreateJobPayload(req CreateJobRequest, preset models.ModelPreset) aipg.CreateJobPayload {
	// Process prompts: enhance positive, provide default negative
	enhancedPrompt, finalNegative := prompts.ProcessPrompts(req.Prompt, req.NegativePrompt, preset.ID)
	
	log.Printf("Prompt processing: original=%d chars, enhanced=%d chars, negative=%d chars",
		len(req.Prompt), len(enhancedPrompt), len(finalNegative))
	
	rawSampler := pickString(req.Params.Sampler, preset.Defaults.Sampler)
	mappedSampler := mapSamplerName(rawSampler)

	params := map[string]any{
		"sampler_name":       mappedSampler,
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
		Prompt:         enhancedPrompt,
		NegativePrompt: finalNegative,
		Models:         []string{preset.ID},
		NSFW:           req.NSFW,
		CensorNSFW:     !req.NSFW,
		TrustedWorkers: true,
		R2:             true,
		Shared:         req.Public,
		Params:         params,
		WalletAddress:  req.WalletAddress,
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
	if req.MediaType != "" {
		payload.MediaType = req.MediaType
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

// Gallery handlers

func (a *App) handleListGallery(w http.ResponseWriter, r *http.Request) {
	typeFilter := r.URL.Query().Get("type")
	limitStr := r.URL.Query().Get("limit")
	
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	
	items := a.galleryStore.List(typeFilter, limit)
	
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"count": len(items),
	})
}

type AddToGalleryRequest struct {
	JobID          string `json:"jobId"`
	ModelID        string `json:"modelId"`
	ModelName      string `json:"modelName"`
	Prompt         string `json:"prompt"`
	NegativePrompt string `json:"negativePrompt,omitempty"`
	Type           string `json:"type"`
	IsNSFW         bool   `json:"isNsfw"`
	IsPublic       bool   `json:"isPublic"`
	WalletAddress  string `json:"walletAddress,omitempty"`
}

func (a *App) handleAddToGallery(w http.ResponseWriter, r *http.Request) {
	var req AddToGalleryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	
	if req.JobID == "" || req.Prompt == "" {
		writeError(w, http.StatusBadRequest, errors.New("jobId and prompt are required"))
		return
	}
	
	item := gallery.GalleryItem{
		JobID:          req.JobID,
		ModelID:        req.ModelID,
		ModelName:      req.ModelName,
		Prompt:         req.Prompt,
		NegativePrompt: req.NegativePrompt,
		Type:           req.Type,
		IsNSFW:         req.IsNSFW,
		IsPublic:       req.IsPublic,
		WalletAddress:  req.WalletAddress,
	}
	
	a.galleryStore.Add(item)
	
	log.Printf("Gallery: added job %s (model=%s, type=%s, wallet=%s, public=%v)", req.JobID, req.ModelName, req.Type, req.WalletAddress, req.IsPublic)
	
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Added to gallery",
	})
}

func (a *App) handleListByWallet(w http.ResponseWriter, r *http.Request) {
	wallet := chi.URLParam(r, "wallet")
	if wallet == "" {
		writeError(w, http.StatusBadRequest, errors.New("wallet address is required"))
		return
	}
	
	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	
	items := a.galleryStore.ListByWallet(wallet, limit)
	
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  items,
		"count":  len(items),
		"wallet": wallet,
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
