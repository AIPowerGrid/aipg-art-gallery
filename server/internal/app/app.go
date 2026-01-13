package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
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
	"github.com/aipowergrid/aipg-art-gallery/server/internal/recipevault"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/r2"
)

type App struct {
	cfg               config.Config
	catalog           models.Catalog
	client            *aipg.Client
	vaultClient       *modelvault.Client
	recipeVaultClient *recipevault.Client
	galleryStore      gallery.GalleryStore
	userStore         *gallery.UserStore
	jobStore          *gallery.JobStore
	r2Client          *r2.Client
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

	// Initialize RecipeVault client for blockchain recipe/workflow registry
	recipeVaultClient, err := recipevault.NewClient(
		cfg.RecipeVaultRPCURL,
		cfg.RecipeVaultContractAddress,
		cfg.RecipeVaultEnabled,
	)
	if err != nil {
		log.Printf("Warning: RecipeVault client initialization failed: %v", err)
		// Continue without RecipeVault
		recipeVaultClient, _ = recipevault.NewClient("", "", false)
	}

	// Initialize gallery store
	var galleryStore gallery.GalleryStore
	var userStore *gallery.UserStore
	var jobStore *gallery.JobStore

	if cfg.PostgresEnabled {
		// Use PostgreSQL
		pgStore, err := gallery.NewPostgresStore(cfg.PostgresConnStr)
		if err != nil {
			log.Printf("Warning: PostgreSQL initialization failed, falling back to file store: %v", err)
			fileStore := gallery.NewStore(cfg.GalleryStorePath, 5000)
			galleryStore = &gallery.FileStoreAdapter{Store: fileStore}
		} else {
			galleryStore = pgStore
			userStore = pgStore.UserStore
			jobStore = pgStore.JobStore
			log.Printf("PostgreSQL gallery store connected, %d items", pgStore.Count())
		}
	} else {
		// Use file-based store
		fileStore := gallery.NewStore(cfg.GalleryStorePath, 5000)
		galleryStore = &gallery.FileStoreAdapter{Store: fileStore}
		log.Printf("File-based gallery store initialized with %d items", fileStore.List("", 1000, 0, "").Total)
	}

	// Initialize R2 client for direct media access
	var r2Client *r2.Client
	if cfg.R2Enabled {
		var r2Err error
		r2Client, r2Err = r2.NewClient(
			cfg.R2TransientEndpoint,
			cfg.R2TransientBucket,
			cfg.R2PermanentBucket,
			cfg.R2AccessKeyID,
			cfg.R2AccessKeySecret,
			cfg.R2SharedAccessKeyID,
			cfg.R2SharedAccessKey,
		)
		if r2Err != nil {
			log.Printf("Warning: R2 client initialization failed: %v", r2Err)
		} else {
			log.Printf("R2 client initialized (transient: %s, permanent: %s)", cfg.R2TransientBucket, cfg.R2PermanentBucket)
		}
	} else {
		log.Printf("R2 direct access disabled (set AWS_ACCESS_KEY_ID or SHARED_AWS_ACCESS_ID to enable)")
	}

	return &App{
		cfg:               cfg,
		catalog:           catalog,
		client:            aipg.NewClient(cfg.APIBaseURL, cfg.ClientAgent),
		vaultClient:       vaultClient,
		recipeVaultClient: recipeVaultClient,
		r2Client:          r2Client,
		galleryStore:      galleryStore,
		userStore:         userStore,
		jobStore:          jobStore,
	}, nil
}

func (a *App) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   a.allowedOrigins(),
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "apikey", "X-Wallet-Address"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(api chi.Router) {
		api.Get("/models", a.handleListModels)
		api.Get("/models/{id}", a.handleGetModel)
		api.Get("/styles", a.handleGetStyles)

		api.Post("/jobs", a.handleCreateJob)
		api.Get("/jobs/{id}", a.handleJobStatus)

		// Public gallery endpoints
		api.Get("/gallery", a.handleListGallery)
		api.Post("/gallery", a.handleAddToGallery)
		api.Get("/gallery/wallet/{wallet}", a.handleListByWallet)
		api.Get("/gallery/{id}", a.handleGetGalleryItem)
		api.Get("/gallery/{id}/media", a.handleGetGalleryMedia)
		api.Delete("/gallery/{id}", a.handleDeleteGalleryItem)
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
	"FLUX.1-dev":                     {"flux.1-dev", "flux1-dev", "flux1.dev", "flux1_dev", "FLUX.1-dev"},
	"flux.1-krea-dev":                {"flux1-krea-dev", "flux1_krea_dev", "flux.1_krea_dev", "krea", "flux.1-krea-dev", "flux1-krea-dev_fp8_scaled", "flux1-krea-dev-fp8-scaled", "flux1_krea_dev_fp8_scaled"},
	"FLUX.1-dev-Kontext-fp8-scaled":  {"flux.1-dev-kontext-fp8-scaled", "flux1-dev-kontext-fp8-scaled", "flux1_dev_kontext_fp8_scaled", "flux_kontext_dev_basic", "FLUX.1-dev-Kontext-fp8-scaled"},
	"Flux.1-Schnell fp8 (Compact)":   {"flux.1-schnell fp8 (compact)", "flux1-schnell-fp8-compact", "flux.1-schnell", "Flux.1-Schnell fp8 (Compact)"},
	
	// Chroma
	"Chroma": {"chroma", "chroma_final", "Chroma"},
	
	// SDXL
	"SDXL 1.0": {"sdxl 1.0", "sdxl1", "sdxl", "sdxl1.0", "SDXL 1.0"},
	
	// Other models
	"ltxv": {"ltx-video", "ltxv-13b", "ltxv"},
	"ICBINP - I Can't Believe It's Not Photography": {"icbinp", "icbinp - i can't believe it's not photography"},
	"ICBINP XL": {"icbinp xl", "icbinp-xl", "ICBINP XL"},
}

// presetToGridName maps our preset IDs to the canonical Grid API model names
// These names MUST match what workers advertise to the Grid API
var presetToGridName = map[string]string{
	// WAN 2.2 video models - Grid API uses underscore format
	"wan2.2_ti2v_5B":     "wan2_2_ti2v_5b",
	"wan2.2-t2v-a14b":    "wan2_2_t2v_14b",
	"wan2.2-t2v-a14b-hq": "wan2_2_t2v_14b_hq",
	
	// LTX Video
	"ltxv": "ltxv",
	
	// FLUX models - use exact names that workers advertise
	"FLUX.1-dev":                    "FLUX.1-dev",
	"flux.1-krea-dev":               "flux.1-krea-dev",
	"FLUX.1-dev-Kontext-fp8-scaled": "FLUX.1-dev-Kontext-fp8-scaled",
	"Flux.1-Schnell fp8 (Compact)":  "Flux.1-Schnell fp8 (Compact)",
	
	// Chroma
	"Chroma": "Chroma",
	
	// SDXL and SD models - use exact names
	"SDXL 1.0":             "SDXL 1.0",
	"ICBINP XL":            "ICBINP XL",
	"Juggernaut XL":        "Juggernaut XL",
	"Animagine XL":         "Animagine XL",
	"DreamShaper XL":       "DreamShaper XL",
	"Stable Cascade 1.0":   "Stable Cascade 1.0",
	"stable_diffusion":     "stable_diffusion",
	"stable_diffusion_2.1": "stable_diffusion_2.1",
	"Deliberate":           "Deliberate",
	"Realistic Vision":     "Realistic Vision",
	"Anything v3":          "Anything v3",
	"Epic Diffusion":       "Epic Diffusion",
	"ICBINP - I Can't Believe It's Not Photography": "ICBINP - I Can't Believe It's Not Photography",
	"Movie Diffusion":      "Movie Diffusion",
}

// getGridModelName converts a preset ID to the Grid API model name
func getGridModelName(presetID string) string {
	if gridName, ok := presetToGridName[presetID]; ok {
		return gridName
	}
	// Default to preset ID if no mapping exists
	return presetID
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

	// Fetch available models from RecipeVault
	var recipeVaultModels []string
	log.Printf("RecipeVault: IsEnabled() = %v", a.recipeVaultClient.IsEnabled())
	if a.recipeVaultClient.IsEnabled() {
		recipeVaultModels, err = a.recipeVaultClient.ExtractModelsFromRecipes(ctx)
		if err != nil {
			log.Printf("Warning: failed to extract models from RecipeVault: %v", err)
		} else {
			log.Printf("RecipeVault: found %d unique models in recipes: %v", len(recipeVaultModels), recipeVaultModels)
		}
	} else {
		log.Printf("RecipeVault: disabled, will show all models from presets")
	}

	// Build a set of available models from RecipeVault for filtering
	// Normalize model names by removing extensions and normalizing separators
	recipeVaultModelSet := make(map[string]bool)
	
	normalizeModelName := func(name string) string {
		// Remove file extensions
		name = strings.TrimSuffix(name, ".safetensors")
		name = strings.TrimSuffix(name, ".ckpt")
		name = strings.TrimSuffix(name, ".pt")
		name = strings.TrimSuffix(name, ".pth")
		// Normalize separators and case
		name = strings.ToLower(name)
		name = strings.ReplaceAll(name, "_", "")
		name = strings.ReplaceAll(name, "-", "")
		name = strings.ReplaceAll(name, ".", "")
		name = strings.ReplaceAll(name, " ", "")
		return name
	}
	
	for _, model := range recipeVaultModels {
		recipeVaultModelSet[strings.ToLower(model)] = true
		recipeVaultModelSet[model] = true
		// Also add normalized version
		normalized := normalizeModelName(model)
		recipeVaultModelSet[normalized] = true
	}

	presets := a.catalog.List()
	log.Printf("RecipeVault: total presets in catalog: %d", len(presets))
	response := make([]ModelView, 0, len(presets))
	
	// If RecipeVault is enabled, filter presets to only include models found in recipes
	// Otherwise, show all presets
	log.Printf("RecipeVault: filtering check - IsEnabled=%v, recipeVaultModelSet size=%d", a.recipeVaultClient.IsEnabled(), len(recipeVaultModelSet))
	for _, preset := range presets {
		// If RecipeVault is enabled and has models, only include models found in recipes
		if a.recipeVaultClient.IsEnabled() && len(recipeVaultModelSet) > 0 {
			// Check if this preset's model is in RecipeVault
			presetLower := strings.ToLower(preset.ID)
			found := false
			
			// Normalize preset ID for comparison (same function as normalizeModelName)
			normalizePresetID := func(id string) string {
				id = strings.ToLower(id)
				id = strings.ReplaceAll(id, "_", "")
				id = strings.ReplaceAll(id, "-", "")
				id = strings.ReplaceAll(id, ".", "")
				id = strings.ReplaceAll(id, " ", "")
				return id
			}
			presetNormalized := normalizePresetID(preset.ID)
			
			// Check exact match
			if recipeVaultModelSet[presetLower] || recipeVaultModelSet[preset.ID] {
				found = true
			}
			
			// Check normalized match
			if !found {
				if recipeVaultModelSet[presetNormalized] {
					found = true
				}
			}
			
			// Check aliases
			if !found {
				if aliases, ok := modelNameAliases[preset.ID]; ok {
					for _, alias := range aliases {
						if recipeVaultModelSet[strings.ToLower(alias)] || recipeVaultModelSet[alias] {
							found = true
							break
						}
						// Also check normalized alias
						aliasNormalized := normalizePresetID(alias)
						if recipeVaultModelSet[aliasNormalized] {
							found = true
							break
						}
					}
				}
			}
			
			// Check Grid API name
			if !found {
				gridName := getGridModelName(preset.ID)
				if recipeVaultModelSet[strings.ToLower(gridName)] || recipeVaultModelSet[gridName] {
					found = true
				}
				// Also check normalized Grid name
				if !found {
					gridNormalized := normalizePresetID(gridName)
					if recipeVaultModelSet[gridNormalized] {
						found = true
					}
				}
			}
			
			// Check if any RecipeVault model name contains preset ID or vice versa (fuzzy match)
			if !found {
				// Extract core model name by removing common suffixes
				extractCoreModelName := func(normalized string) string {
					// Remove common model file suffixes (in order of specificity)
					suffixes := []string{"fp8scaled", "fp16scaled", "fp32scaled", "fp8", "fp16", "fp32", "scaled", "compact"}
					core := normalized
					for _, suffix := range suffixes {
						if strings.HasSuffix(core, suffix) {
							core = strings.TrimSuffix(core, suffix)
						}
					}
					return core
				}
				
				presetCore := extractCoreModelName(presetNormalized)
				
				for _, rvModel := range recipeVaultModels {
					rvNormalized := normalizeModelName(rvModel)
					rvCore := extractCoreModelName(rvNormalized)
					
					// Check if cores match or if one contains the other
					if presetCore == rvCore || strings.Contains(rvCore, presetCore) || strings.Contains(presetCore, rvCore) {
						found = true
						log.Printf("RecipeVault: matched preset %q to RecipeVault model %q (core match: %q == %q)", preset.ID, rvModel, presetCore, rvCore)
						break
					}
					// Also try original normalized match
					if strings.Contains(rvNormalized, presetNormalized) || strings.Contains(presetNormalized, rvNormalized) {
						found = true
						log.Printf("RecipeVault: matched preset %q to RecipeVault model %q (normalized)", preset.ID, rvModel)
						break
					}
				}
			}
			
			if !found {
				log.Printf("RecipeVault: preset %q not found in RecipeVault models (presetNormalized=%q, checked %d RecipeVault models)", 
					preset.ID, presetNormalized, len(recipeVaultModels))
				// Log all RecipeVault models for debugging
				for _, rvModel := range recipeVaultModels {
					rvNormalized := normalizeModelName(rvModel)
					log.Printf("RecipeVault:   - model %q (normalized: %q)", rvModel, rvNormalized)
				}
				continue // Skip this model if not found in RecipeVault
			} else {
				log.Printf("RecipeVault: including preset %q (matched to RecipeVault)", preset.ID)
			}
		}
		
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

	// Sort models by display name for stable ordering
	sort.Slice(response, func(i, j int) bool {
		return response[i].DisplayName < response[j].DisplayName
	})

	log.Printf("RecipeVault: returning %d models in response (expected %d from RecipeVault)", len(response), len(recipeVaultModels))
	
	writeJSON(w, http.StatusOK, map[string]any{
		"models":         response,
		"chainSource":    a.vaultClient.IsEnabled(),
		"recipeVaultSource": a.recipeVaultClient.IsEnabled(),
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

// handleGetStyles returns the curated styles/models configuration
func (a *App) handleGetStyles(w http.ResponseWriter, r *http.Request) {
	// Read styles.json from config directory
	stylesPath := "config/styles.json"
	data, err := os.ReadFile(stylesPath)
	if err != nil {
		log.Printf("Error reading styles.json: %v", err)
		writeError(w, http.StatusInternalServerError, fmt.Errorf("styles config not found"))
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
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
	
	log.Printf("📤 Creating job: modelId=%s, preset.ID=%s, preset.Type=%s, gridName=%s, payload.Models=%v, mediaType=%s", 
		req.ModelID, preset.ID, preset.Type, getGridModelName(preset.ID), payload.Models, payload.MediaType)
	
	// Debug: log the full params for troubleshooting
	if paramsJSON, err := json.Marshal(payload.Params); err == nil {
		log.Printf("📤 Job params: %s", string(paramsJSON))
	}

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
	
	// Get final values - validate user input against model limits
	// User values are used if provided and within range, otherwise clamped to valid range
	width := pickIntInRange(req.Params.Width, preset.Defaults.Width, preset.Limits.Width)
	height := pickIntInRange(req.Params.Height, preset.Defaults.Height, preset.Limits.Height)
	steps := pickIntInRange(req.Params.Steps, preset.Defaults.Steps, preset.Limits.Steps)
	cfgScale := pickFloatInRange(req.Params.CfgScale, preset.Defaults.CfgScale, preset.Limits.CfgScale)
	denoise := pickFloat(req.Params.Denoise, preset.Defaults.Denoise) // No limits for denoise
	scheduler := pickString(req.Params.Scheduler, preset.Defaults.Scheduler)
	
	// Video parameters - validate against limits
	videoLength := pickIntInRange(req.Params.Length, preset.Defaults.Length, preset.Limits.Length)
	fps := pickIntInRange(req.Params.FPS, preset.Defaults.FPS, preset.Limits.FPS)
	
	// Debug log for video models
	if preset.Type == "video" {
		log.Printf("🎬 Video params: preset=%s, userLen=%d→%d, userFPS=%d→%d, userSteps=%d→%d, userCfg=%.2f→%.2f",
			preset.ID, 
			req.Params.Length, videoLength,
			req.Params.FPS, fps, 
			req.Params.Steps, steps,
			req.Params.CfgScale, cfgScale)
	}

	params := map[string]any{
		"sampler_name":       mappedSampler,
		"scheduler":          scheduler,
		"cfg_scale":          cfgScale,
		"steps":              steps,
		"karras":             strings.EqualFold(scheduler, "karras"),
		"hires_fix":          req.Params.HiresFix,
		"tiling":             req.Params.Tiling,
		"denoising_strength": denoise,
	}
	if width > 0 {
		params["width"] = width
	}
	if height > 0 {
		params["height"] = height
	}
	if req.Params.Seed != "" {
		params["seed"] = req.Params.Seed
	}
	
	// Video-specific parameters - comfy_bridge expects these at top level
	if videoLength > 0 {
		params["length"] = videoLength
		params["video_length"] = videoLength
	}
	if fps > 0 {
		params["fps"] = fps
	}

	// Convert preset ID to Grid API model name
	gridModelName := getGridModelName(preset.ID)
	
	// Determine source processing based on model type if not specified
	sourceProcessing := req.SourceProcessing
	if sourceProcessing == "" {
		if preset.Type == "video" {
			if req.SourceImage != "" {
				sourceProcessing = "img2video"
			} else {
				sourceProcessing = "txt2video"
			}
		} else {
			if req.SourceImage != "" {
				sourceProcessing = "img2img"
			} else {
				sourceProcessing = "txt2img"
			}
		}
	}
	
	// Determine media type based on model type if not specified
	mediaType := req.MediaType
	if mediaType == "" {
		mediaType = preset.Type
	}
	
	payload := aipg.CreateJobPayload{
		Prompt:           enhancedPrompt,
		NegativePrompt:   finalNegative,
		Models:           []string{gridModelName},
		NSFW:             req.NSFW,
		CensorNSFW:       !req.NSFW,
		TrustedWorkers:   true,
		R2:               true,
		Shared:           req.Public,
		Params:           params,
		WalletAddress:    req.WalletAddress,
		SourceProcessing: sourceProcessing,
		MediaType:        mediaType,
	}

	if req.SourceImage != "" {
		payload.SourceImage = req.SourceImage
	}
	if req.SourceMask != "" {
		payload.SourceMask = req.SourceMask
	}
	
	// Log the full payload for video debugging
	if preset.Type == "video" {
		paramsJSON, _ := json.Marshal(params)
		log.Printf("🎬 Video job payload: model=%s, mediaType=%s, sourceProc=%s, params=%s",
			gridModelName, mediaType, sourceProcessing, string(paramsJSON))
	}

	return payload
}

type JobView struct {
	JobID         string           `json:"jobId"`
	Status        string           `json:"status"`
	Faulted       bool             `json:"faulted"`
	WaitTime      float64          `json:"waitTime"`
	QueuePosition int              `json:"queuePosition"`
	Processing    int              `json:"processing"`
	Finished      int              `json:"finished"`
	Waiting       int              `json:"waiting"`
	Generations   []GenerationView `json:"generations"`
}

type GenerationView struct {
	ID         string `json:"id"`
	Seed       string `json:"seed"`
	Kind       string `json:"kind"`
	MimeType   string `json:"mimeType"`
	URL        string `json:"url,omitempty"`
	Base64     string `json:"base64,omitempty"`
	WorkerID   string `json:"workerId,omitempty"`
	WorkerName string `json:"workerName,omitempty"`
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
			ID:         gen.ID,
			Seed:       fmt.Sprintf("%v", gen.Seed),
			MimeType:   gen.Mime,
			WorkerID:   gen.WorkerID,
			WorkerName: gen.Worker,
		}
		switch {
		case gen.Video != "":
			view.Kind = "video"
			view.URL = r2.ConvertToCDNURL(gen.Video)
		case strings.Contains(strings.ToLower(gen.Mime), "video"):
			view.Kind = "video"
			rawURL := firstNonEmpty(gen.Video, gen.ImgURL, gen.Img)
			if rawURL != "" {
				view.URL = r2.ConvertToCDNURL(rawURL)
			}
		default:
			view.Kind = "image"
			rawURL := firstNonEmpty(gen.ImgURL, gen.Img)
			view.Base64 = normalizeBase64(gen.Image)
			if view.Base64 == "" && strings.HasPrefix(rawURL, "data:image") {
				view.Base64 = rawURL
				view.URL = ""
			} else if rawURL != "" {
				view.URL = r2.ConvertToCDNURL(rawURL)
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
		Processing:    resp.Processing,
		Finished:      resp.Finished,
		Waiting:       resp.Waiting,
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
	searchQuery := r.URL.Query().Get("q")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	
	limit := 25 // Default page size
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}
	
	offset := 0
	if offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}
	
	result := a.galleryStore.List(typeFilter, limit, offset, searchQuery)
	
	writeJSON(w, http.StatusOK, result)
}

type JobParamsRequest struct {
	Width      *int     `json:"width,omitempty"`
	Height     *int     `json:"height,omitempty"`
	Steps      *int     `json:"steps,omitempty"`
	CfgScale   *float64 `json:"cfgScale,omitempty"`
	Sampler    *string  `json:"sampler,omitempty"`
	Scheduler  *string  `json:"scheduler,omitempty"`
	Seed       *string  `json:"seed,omitempty"`
	Denoise    *float64 `json:"denoise,omitempty"`
	Length     *int     `json:"length,omitempty"`
	Fps        *int     `json:"fps,omitempty"`
	Tiling     *bool    `json:"tiling,omitempty"`
	HiresFix   *bool    `json:"hiresFix,omitempty"`
}

type AddToGalleryRequest struct {
	JobID          string          `json:"jobId"`
	ModelID        string          `json:"modelId"`
	ModelName      string          `json:"modelName"`
	Prompt         string          `json:"prompt"`
	NegativePrompt string          `json:"negativePrompt,omitempty"`
	Type           string          `json:"type"`
	IsNSFW         bool            `json:"isNsfw"`
	IsPublic       bool            `json:"isPublic"`
	WalletAddress  string          `json:"walletAddress,omitempty"`
	Params         *JobParamsRequest `json:"params,omitempty"`
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
	
	// Convert request params to gallery params
	var galleryParams *gallery.JobParams
	if req.Params != nil {
		galleryParams = &gallery.JobParams{
			Width:     req.Params.Width,
			Height:    req.Params.Height,
			Steps:     req.Params.Steps,
			CfgScale:  req.Params.CfgScale,
			Sampler:   req.Params.Sampler,
			Scheduler: req.Params.Scheduler,
			Seed:      req.Params.Seed,
			Denoise:   req.Params.Denoise,
			Length:    req.Params.Length,
			Fps:       req.Params.Fps,
			Tiling:    req.Params.Tiling,
			HiresFix:  req.Params.HiresFix,
		}
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
		Params:         galleryParams,
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

// handleGetGalleryItem returns a single gallery item by ID
func (a *App) handleGetGalleryItem(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("job ID is required"))
		return
	}
	
	item := a.galleryStore.Get(jobID)
	if item == nil {
		writeError(w, http.StatusNotFound, errors.New("gallery item not found"))
		return
	}
	
	writeJSON(w, http.StatusOK, item)
}

// handleGetGalleryMedia returns fresh media URLs for a gallery item
func (a *App) handleGetGalleryMedia(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("job ID is required"))
		return
	}
	
	item := a.galleryStore.Get(jobID)
	if item == nil {
		writeError(w, http.StatusNotFound, errors.New("gallery item not found"))
		return
	}
	
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	
	// First try to fetch from Grid API to get generation IDs
	// This ensures we have the correct generation IDs for CDN URLs
	status, err := a.client.JobStatus(ctx, jobID)
	if err == nil && len(status.Generations) > 0 {
		// Extract generation IDs and build CDN URLs
		urls := make([]string, 0, len(status.Generations))
		genIDs := make([]string, 0, len(status.Generations))
		
		for _, gen := range status.Generations {
			if gen.ID != "" {
				genIDs = append(genIDs, gen.ID)
				// Build CDN URL using generation ID
				cdnURL := "https://images.aipg.art/" + gen.ID + ".webp"
				urls = append(urls, cdnURL)
			}
		}
		
		// Note: UpdateGenerations removed - media URLs are fetched dynamically
		
		if len(urls) > 0 {
			writeJSON(w, http.StatusOK, map[string]any{
				"jobId":    jobID,
				"mediaUrls": urls,
				"type":     item.Type,
				"source":   "grid-api",
			})
			return
		}
	}
	
	// If Grid API failed or no generation IDs, try using R2 client if available
	if a.r2Client != nil && len(item.GenerationIDs) > 0 {
		urls := make([]string, 0, len(item.GenerationIDs))
		for _, genID := range item.GenerationIDs {
			url, err := a.r2Client.GenerateMediaURL(ctx, genID, item.Type)
			if err != nil {
				log.Printf("Warning: failed to generate R2 URL for %s: %v", genID, err)
				continue
			}
			urls = append(urls, url)
		}
		
		if len(urls) > 0 {
			writeJSON(w, http.StatusOK, map[string]any{
				"jobId":    jobID,
				"mediaUrls": urls,
				"type":     item.Type,
				"source":   "r2",
			})
			return
		}
	}
	
	// Final fallback - use cached URLs or job ID
	if err != nil {
		log.Printf("Warning: failed to fetch job status for %s: %v", jobID, err)
		cachedURLs := make([]string, 0, len(item.MediaURLs))
		for _, cachedURL := range item.MediaURLs {
			if cachedURL != "" {
				// If it's already an R2 presigned URL, preserve it
				if strings.Contains(cachedURL, ".r2.cloudflarestorage.com") || strings.Contains(cachedURL, "presigned") {
					cachedURLs = append(cachedURLs, cachedURL)
				} else {
					// Otherwise convert to CDN format
					cdnURL := r2.ConvertToCDNURL(cachedURL)
					if cdnURL != "" {
						cachedURLs = append(cachedURLs, cdnURL)
					}
				}
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"jobId":    jobID,
			"mediaUrls": cachedURLs,
			"type":     item.Type,
			"source":   "cache",
			"error":    "Job may have expired from Grid API",
		})
		return
	}
	
	// Absolute fallback - return CDN URL using job ID
	// This may work for older uploads that used job ID as filename
	fallbackURL := "https://images.aipg.art/" + jobID + ".webp"
	writeJSON(w, http.StatusOK, map[string]any{
		"jobId":    jobID,
		"mediaUrls": []string{fallbackURL},
		"type":     item.Type,
		"source":   "fallback",
	})
}

// handleDeleteGalleryItem removes a gallery item (only owner can delete)
func (a *App) handleDeleteGalleryItem(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("job ID is required"))
		return
	}
	
	// Get wallet address from header
	requestWallet := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Wallet-Address")))
	if requestWallet == "" {
		writeError(w, http.StatusUnauthorized, errors.New("wallet address required - connect your wallet to delete"))
		return
	}
	
	// Get the item first to check ownership
	item := a.galleryStore.Get(jobID)
	if item == nil {
		writeError(w, http.StatusNotFound, errors.New("gallery item not found"))
		return
	}
	
	// Check ownership - wallet addresses must match
	itemWallet := strings.ToLower(strings.TrimSpace(item.WalletAddress))
	if itemWallet == "" {
		// Legacy item with no wallet - allow deletion for now but log it
		log.Printf("Gallery: deleting legacy item %s with no wallet (requested by %s)", jobID, requestWallet)
	} else if itemWallet != requestWallet {
		writeError(w, http.StatusForbidden, errors.New("you can only delete your own gallery items"))
		return
	}
	
	// Remove from gallery store
	err := a.galleryStore.Delete(jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, errors.New("failed to remove from gallery"))
		return
	}
	
	log.Printf("Gallery: deleted job %s (model=%s, type=%s, owner=%s, requestedBy=%s)", 
		jobID, item.ModelName, item.Type, item.WalletAddress, requestWallet)
	
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Removed from gallery",
		"jobId":   jobID,
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

// pickIntInRange returns user value if within [min, max], otherwise returns fallback
// If user value is 0/unset, uses fallback. If user value is out of range, clamps to nearest limit.
func pickIntInRange(userValue, fallback int, limits *models.RangeInt) int {
	if limits == nil {
		return pickInt(userValue, fallback)
	}
	
	// If user didn't provide a value, use fallback
	if userValue <= 0 {
		return clampInt(fallback, limits.Min, limits.Max)
	}
	
	// User provided value - clamp to valid range
	return clampInt(userValue, limits.Min, limits.Max)
}

// pickFloatInRange returns user value if within [min, max], otherwise clamps to range
func pickFloatInRange(userValue, fallback float64, limits *models.RangeFloat) float64 {
	if limits == nil {
		return pickFloat(userValue, fallback)
	}
	
	// If user didn't provide a value, use fallback
	if userValue <= 0 {
		return clampFloat(fallback, limits.Min, limits.Max)
	}
	
	// User provided value - clamp to valid range
	return clampFloat(userValue, limits.Min, limits.Max)
}

func clampInt(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func clampFloat(value, min, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
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
