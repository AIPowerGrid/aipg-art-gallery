package app

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"
	"google.golang.org/api/idtoken"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/ai"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/cache"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/config"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/gallery"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/models"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/modelvault"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/prompts"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/r2"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/recipevault"
)

// Context keys for authentication
type contextKey string

const (
	walletContextKey contextKey = "wallet_address"
	claimsContextKey contextKey = "auth_claims"
)

type App struct {
	cfg               config.Config
	catalog           models.Catalog
	client            *aipg.Client
	vaultClient       *modelvault.Client
	recipeVaultClient *recipevault.Client
	galleryStore      gallery.GalleryStore
	userStore         *gallery.UserStore
	favoritesStore    *gallery.FavoritesStore
	r2Client          *r2.Client
	cache             *cache.Cache
	aiClient          *ai.Client
	pending           *pendingStore
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
	var favoritesStore *gallery.FavoritesStore

	if cfg.PostgresEnabled {
		// Use PostgreSQL
		pgStore, err := gallery.NewPostgresStore(cfg.PostgresConnStr)
		if err != nil {
			return nil, fmt.Errorf("initialize required PostgreSQL gallery store: %w", err)
		}
		galleryStore = pgStore
		userStore = pgStore.UserStore
		favoritesStore = gallery.NewFavoritesStore(pgStore.DB())
		log.Printf("PostgreSQL gallery store connected, %d items", pgStore.Count())
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

	// Initialize in-memory cache for gallery queries
	queryCache := cache.New()
	log.Printf("In-memory query cache initialized")

	// Initialize AI client for text generation (prompt enhancement)
	var aiClient *ai.Client
	if cfg.DefaultAPIKey != "" && cfg.AIModel != "" {
		aiClient = ai.NewClient(cfg.DefaultAPIKey, cfg.AIModel, cfg.ClientAgent, cfg.APIBaseURL)
		log.Printf("AI client initialized (model: %s)", cfg.AIModel)
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
		favoritesStore:    favoritesStore,
		cache:             queryCache,
		aiClient:          aiClient,
		// Pending state outlives the 11-minute image/video request ceiling and
		// the browser's final status poll.
		pending: newPendingStore(15 * time.Minute),
	}, nil
}

func (a *App) Router() http.Handler {
	r := chi.NewRouter()

	// CORS
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   a.allowedOrigins(),
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "apikey", "Authorization"},
		AllowCredentials: true,
	}))

	// Global rate limiting: 100 requests per minute per IP
	r.Use(httprate.LimitByIP(100, time.Minute))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(api chi.Router) {
		// Auth endpoints (no authentication required). Wallet proof is issued
		// and verified by Core through this server; the browser never sees the
		// bounded Gallery service key.
		api.Post("/auth/google", a.handleGoogleAuth)
		api.With(httprate.LimitByIP(30, time.Minute)).Post("/auth/wallet/challenge", a.handleWalletChallenge)
		api.With(httprate.LimitByIP(10, time.Minute)).Post("/auth/wallet/exchange", a.handleWalletExchange)
		api.Post("/auth/logout", a.handleLogout)

		api.Get("/models", a.handleListModels)
		api.Get("/models/{id}", a.handleGetModel)
		api.Get("/styles", a.handleGetStyles)
		api.Get("/styles/grid", a.handleGridStyles) // curated creative styles from the grid

		// Public gallery endpoints (read-only, no auth required)
		api.Get("/gallery", a.handleListGallery)
		api.Get("/gallery/models", a.handleListGalleryModels)
		api.Get("/gallery/{id}", a.handleGetGalleryItem)
		api.Get("/gallery/{id}/media", a.handleGetGalleryMedia)

		// Protected routes (JWT authentication required)
		api.Group(func(protected chi.Router) {
			protected.Use(a.authMiddleware)

			protected.Get("/auth/me", a.handleMe)
			protected.Post("/auth/link-wallet/nonce", a.handleWalletLinkNonce)
			protected.Post("/auth/link-wallet", a.handleWalletLink)
			protected.Get("/credits", a.handleCredits)
			protected.With(httprate.LimitByIP(60, time.Minute)).Post("/credits/quote", a.handleCreditQuote)
			protected.With(httprate.LimitByIP(20, time.Minute)).Post("/jobs", a.handleCreateJob)
			protected.Get("/jobs/{id}", a.handleJobStatus)
			protected.With(httprate.LimitByIP(20, time.Minute)).Post("/ai/enhance", a.handleAIEnhance)
			protected.Get("/gallery/me", a.handleListMyGallery)
			protected.Get("/gallery/wallet/{wallet}", a.handleListByWallet)
			protected.Post("/gallery", a.handleAddToGallery)
			protected.Patch("/gallery/{id}", a.handleUpdateGalleryItem)
			protected.Delete("/gallery/{id}", a.handleDeleteGalleryItem)
			protected.Post("/gallery/{id}/publish", a.handlePublishGalleryItem)
			protected.Post("/gallery/{id}/unpublish", a.handleUnpublishGalleryItem)
			protected.Post("/gallery/{id}/extract", a.handleExtractSingleImage)
			protected.Get("/favorites", a.handleListMyFavorites)
			protected.Post("/favorites/{jobId}", a.handleAddFavorite)
			protected.Delete("/favorites/{jobId}", a.handleRemoveFavorite)
		})
	})

	return r
}

func (a *App) allowedOrigins() []string {
	if len(a.cfg.AllowedOrigins) == 0 {
		// Fail closed: never combine a wildcard origin with AllowCredentials.
		// Production MUST set GALLERY_ALLOWED_ORIGINS.
		log.Printf("⚠️  GALLERY_ALLOWED_ORIGINS not set; restricting CORS to localhost dev origins")
		return []string{"http://localhost:3000", "http://127.0.0.1:3000"}
	}
	return a.cfg.AllowedOrigins
}

// ============================================================================
// Authentication handlers and middleware
// ============================================================================

// authMiddleware verifies the session JWT, read from the httpOnly cookie (browser
// clients) or an "Authorization: Bearer" header (CLI/non-browser fallback).
// Supports both wallet and Google authentication. For cookie-authenticated
// mutating requests it enforces an Origin allowlist as CSRF defense-in-depth on
// top of the cookie's SameSite=Lax attribute.
func (a *App) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, fromCookie := extractToken(r)
		if token == "" {
			writeError(w, http.StatusUnauthorized, errors.New("not signed in - please sign in"))
			return
		}

		if fromCookie && isMutating(r.Method) && !a.isAllowedRequestOrigin(r) {
			writeError(w, http.StatusForbidden, errors.New("cross-origin request blocked"))
			return
		}

		// Verify JWT and get full claims
		claims, err := auth.VerifyJWTClaims(token)
		if err != nil {
			log.Printf("Auth: JWT verification failed: %v", err)
			writeError(w, http.StatusUnauthorized, errors.New("invalid or expired session - please sign in again"))
			return
		}

		// Add claims to context (supports both wallet and Google auth)
		ctx := context.WithValue(r.Context(), claimsContextKey, claims)
		// Also add wallet address for backward compatibility
		if claims.WalletAddress != "" {
			ctx = context.WithValue(ctx, walletContextKey, claims.WalletAddress)
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// extractToken pulls the JWT from the auth cookie first, then a Bearer header.
// The bool reports whether it came from the cookie (relevant for CSRF handling).
func extractToken(r *http.Request) (string, bool) {
	if c, err := r.Cookie(authCookieName); err == nil && c.Value != "" {
		return c.Value, true
	}
	if parts := strings.SplitN(r.Header.Get("Authorization"), " ", 2); len(parts) == 2 && parts[0] == "Bearer" {
		return strings.TrimSpace(parts[1]), false
	}
	return "", false
}

func isMutating(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	default:
		return true
	}
}

// isAllowedRequestOrigin validates the Origin header against the configured
// allowlist. No Origin (curl/server-side) is allowed; in dev (no origins
// configured) everything is allowed.
func (a *App) isAllowedRequestOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	if len(a.cfg.AllowedOrigins) == 0 {
		return true
	}
	origin = strings.TrimSuffix(origin, "/")
	for _, allowed := range a.cfg.AllowedOrigins {
		if strings.EqualFold(strings.TrimSuffix(allowed, "/"), origin) {
			return true
		}
	}
	return false
}

// getClaimsFromContext retrieves the full auth claims from request context
func getClaimsFromContext(r *http.Request) *auth.Claims {
	if claims, ok := r.Context().Value(claimsContextKey).(*auth.Claims); ok {
		return claims
	}
	return nil
}

// getWalletFromContext retrieves the authenticated wallet address from request context
// For Google auth users, returns empty string (use getUserIdentifier instead)
func getWalletFromContext(r *http.Request) string {
	// Try claims first (new way)
	if claims := getClaimsFromContext(r); claims != nil {
		return claims.WalletAddress
	}
	// Fall back to direct context value (backward compat)
	if addr, ok := r.Context().Value(walletContextKey).(string); ok {
		return addr
	}
	return ""
}

// getUserIdentifier returns the user's unique identifier (wallet address OR google ID)
func getUserIdentifier(r *http.Request) string {
	if claims := getClaimsFromContext(r); claims != nil {
		return claims.UserIdentifier()
	}
	// Fall back to wallet address for backward compat
	return getWalletFromContext(r)
}

func (a *App) gridUserIdentity(ctx context.Context, r *http.Request) (*aipg.IdentityExchange, error) {
	claims := getClaimsFromContext(r)
	if claims == nil {
		return nil, errors.New("authenticated Grid identity required")
	}
	subject := "wallet:" + strings.ToLower(strings.TrimSpace(claims.WalletAddress))
	if claims.GoogleID != "" {
		subject = "google:" + claims.GoogleID
	}
	identity, err := a.client.ExchangeServiceIdentity(ctx, a.cfg.DefaultAPIKey, subject)
	if err != nil {
		return nil, err
	}
	if claims.GridAccountID == "" || identity.AccountID != claims.GridAccountID {
		return nil, errors.New("Grid account identity mismatch")
	}
	return identity, nil
}

func (a *App) gridUserToken(ctx context.Context, r *http.Request) (string, error) {
	identity, err := a.gridUserIdentity(ctx, r)
	if err != nil {
		return "", err
	}
	return identity.AccessToken, nil
}

func googleGalleryOwnerIdentifier(googleID string) string {
	googleID = strings.TrimSpace(googleID)
	if googleID == "" {
		return ""
	}
	digest := sha256.Sum256([]byte("google:" + googleID))
	return fmt.Sprintf("google:%x", digest[:])
}

// getGalleryOwnerIdentifier returns the durable Core account ID for all new
// writes. Login-method keys remain readable only long enough to migrate data
// after Core has verified the corresponding Google or wallet proof.
func getGalleryOwnerIdentifier(r *http.Request) string {
	claims := getClaimsFromContext(r)
	if claims == nil {
		return ""
	}
	if claims.GridAccountID != "" {
		return strings.ToLower(strings.TrimSpace(claims.GridAccountID))
	}
	// Backward compatibility for an already-issued pre-Core session. New login
	// handlers require a Core account ID and never mint this form.
	if claims.GoogleID != "" {
		return googleGalleryOwnerIdentifier(claims.GoogleID)
	}
	if claims.WalletAddress != "" {
		return strings.ToLower(strings.TrimSpace(claims.WalletAddress))
	}
	return ""
}

func legacyGalleryOwnerIdentifiers(claims *auth.Claims) []string {
	if claims == nil {
		return nil
	}
	keys := make([]string, 0, 2)
	if key := googleGalleryOwnerIdentifier(claims.GoogleID); key != "" {
		keys = append(keys, key)
	}
	if key := strings.ToLower(strings.TrimSpace(claims.WalletAddress)); key != "" {
		keys = append(keys, key)
	}
	return keys
}

func (a *App) canonicalizeGalleryOwnership(claims *auth.Claims) error {
	if claims == nil || strings.TrimSpace(claims.GridAccountID) == "" {
		return errors.New("canonical Grid account is required")
	}
	return a.galleryStore.CanonicalizeOwner(
		claims.GridAccountID,
		legacyGalleryOwnerIdentifiers(claims),
	)
}

// getAuthMethod returns "wallet" or "google" based on how the user authenticated
func getAuthMethod(r *http.Request) string {
	if claims := getClaimsFromContext(r); claims != nil {
		return claims.AuthMethod()
	}
	return "wallet"
}

// ----------------------------------------------------------------------------
// Session cookie helpers. The JWT is delivered ONLY as an httpOnly cookie so it
// is never readable by browser JS (XSS protection). The wallet JWT is minted by
// the Next.js /auth-api/verify route, which sets the same cookie; the Go server
// sets it for Google auth and clears it on logout, and reads it on every
// protected request.
// ----------------------------------------------------------------------------

const authCookieName = "aipg_auth"

func (a *App) cookieSecure(r *http.Request) bool {
	if a.cfg.AuthCookieSecure {
		return true
	}
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func (a *App) setAuthCookie(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     authCookieName,
		Value:    token,
		Path:     "/",
		Domain:   a.cfg.AuthCookieDomain, // empty = host-only (dev)
		HttpOnly: true,
		Secure:   a.cookieSecure(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int((24 * time.Hour).Seconds()),
	})
}

func (a *App) clearAuthCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     authCookieName,
		Value:    "",
		Path:     "/",
		Domain:   a.cfg.AuthCookieDomain,
		HttpOnly: true,
		Secure:   a.cookieSecure(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// handleMe returns the authenticated user for the current session cookie, or 401
// if there is none. The frontend uses it to reconcile auth state on load (it
// can't read the httpOnly cookie itself).
func (a *App) handleMe(w http.ResponseWriter, r *http.Request) {
	claims := getClaimsFromContext(r)
	if claims == nil {
		writeError(w, http.StatusUnauthorized, errors.New("not signed in"))
		return
	}
	if err := a.canonicalizeGalleryOwnership(claims); err != nil {
		log.Printf("Auth: Failed to canonicalize session ownership: %v", err)
		writeError(w, http.StatusServiceUnavailable, errors.New("account data is temporarily unavailable"))
		return
	}
	// Slide the session forward on each check so an active user isn't logged out
	// exactly at the 24h mark. Best-effort: a renewal failure leaves the existing
	// cookie untouched.
	if token, err := auth.RenewJWT(*claims); err == nil {
		a.setAuthCookie(w, r, token)
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"address":    claims.WalletAddress,
		"googleId":   claims.GoogleID,
		"email":      claims.Email,
		"name":       claims.Name,
		"authMethod": claims.AuthMethod(),
		"accountId":  claims.GridAccountID,
	})
}

// handleLogout clears the session cookie. Public: clearing a cookie needs no auth.
func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	a.clearAuthCookie(w, r)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleGoogleAuth verifies Google ID token and returns JWT
func (a *App) handleGoogleAuth(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Credential string `json:"credential"` // Google ID token
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, errors.New("invalid request body"))
		return
	}

	if req.Credential == "" {
		writeError(w, http.StatusBadRequest, errors.New("credential is required"))
		return
	}

	// Check if Google auth is configured
	if a.cfg.GoogleClientID == "" {
		writeError(w, http.StatusServiceUnavailable, errors.New("Google authentication not configured"))
		return
	}

	// Verify the Google ID token
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	payload, err := idtoken.Validate(ctx, req.Credential, a.cfg.GoogleClientID)
	if err != nil {
		log.Printf("Auth: Google token validation failed: %v", err)
		writeError(w, http.StatusUnauthorized, errors.New("invalid Google token"))
		return
	}

	// Extract user info from payload
	googleID := payload.Subject
	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)
	picture, _ := payload.Claims["picture"].(string)

	// Create or update user in database
	if a.userStore != nil {
		_, err := a.userStore.ConnectGoogle(googleID, email, name, picture)
		if err != nil {
			log.Printf("Auth: Failed to save Google user: %v", err)
			// Continue anyway - user can still authenticate
		}
	}

	// Core independently verifies the provider token and binds the
	// server-derived Gallery subject to the universal account. Fail closed:
	// a local-only session would create a second balance identity.
	if a.cfg.DefaultAPIKey == "" {
		writeError(w, http.StatusServiceUnavailable, errors.New("Grid identity service not configured"))
		return
	}
	gridCtx, gridCancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer gridCancel()
	gridIdentity, err := a.client.ExchangeGoogle(
		gridCtx, a.cfg.DefaultAPIKey, req.Credential, "google:"+googleID,
	)
	if err != nil {
		log.Printf("Auth: Grid Google exchange failed: %v", err)
		writeError(w, http.StatusServiceUnavailable, errors.New("Grid sign-in is temporarily unavailable"))
		return
	}
	googleClaims := &auth.Claims{
		GoogleID:      googleID,
		GridAccountID: gridIdentity.AccountID,
	}
	if err := a.canonicalizeGalleryOwnership(googleClaims); err != nil {
		log.Printf("Auth: Failed to canonicalize Google ownership: %v", err)
		writeError(w, http.StatusServiceUnavailable, errors.New("account data is temporarily unavailable"))
		return
	}

	// Generate JWT for the Google user
	token, err := auth.GenerateGoogleJWT(
		googleID, email, name, gridIdentity.AccessToken, gridIdentity.AccountID,
	)
	if err != nil {
		log.Printf("Auth: JWT generation error for Google user: %v", err)
		writeError(w, http.StatusInternalServerError, errors.New("failed to generate token"))
		return
	}

	log.Printf("Auth: Google user %s (%s) authenticated successfully", email, googleID)

	// Deliver the JWT only as an httpOnly cookie; the body returns just the
	// (non-secret) profile fields for UI.
	a.setAuthCookie(w, r, token)

	writeJSON(w, http.StatusOK, map[string]any{
		"googleId":  googleID,
		"email":     email,
		"name":      name,
		"picture":   picture,
		"accountId": gridIdentity.AccountID,
	})
}

func (a *App) authOrigin(r *http.Request) (*url.URL, error) {
	raw := strings.TrimSuffix(strings.TrimSpace(r.Header.Get("Origin")), "/")
	if raw == "" || !a.isAllowedRequestOrigin(r) {
		return nil, errors.New("allowed browser origin required")
	}
	origin, err := url.Parse(raw)
	if err != nil || origin.Host == "" || origin.User != nil ||
		(origin.Scheme != "https" && origin.Scheme != "http") ||
		origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" {
		return nil, errors.New("invalid browser origin")
	}
	return origin, nil
}

func walletAppSubject(address string) string {
	return "wallet:" + strings.ToLower(strings.TrimSpace(address))
}

func (a *App) handleWalletChallenge(w http.ResponseWriter, r *http.Request) {
	if a.cfg.DefaultAPIKey == "" {
		writeError(w, http.StatusServiceUnavailable, errors.New("Grid identity service not configured"))
		return
	}
	var proof struct {
		Address string `json:"address"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
	if err := decoder.Decode(&proof); err != nil || strings.TrimSpace(proof.Address) == "" {
		writeError(w, http.StatusBadRequest, errors.New("wallet address is required"))
		return
	}
	origin, err := a.authOrigin(r)
	if err != nil {
		writeError(w, http.StatusForbidden, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	challenge, err := a.client.WalletChallenge(
		ctx,
		a.cfg.DefaultAPIKey,
		proof.Address,
		origin.Host,
		origin.String(),
		walletAppSubject(proof.Address),
	)
	if err != nil {
		log.Printf("Auth: Grid wallet challenge failed: %v", err)
		writeError(w, http.StatusBadGateway, errors.New("wallet sign-in is temporarily unavailable"))
		return
	}
	writeJSON(w, http.StatusOK, challenge)
}

func (a *App) handleWalletExchange(w http.ResponseWriter, r *http.Request) {
	if a.cfg.DefaultAPIKey == "" {
		writeError(w, http.StatusServiceUnavailable, errors.New("Grid identity service not configured"))
		return
	}
	if _, err := a.authOrigin(r); err != nil {
		writeError(w, http.StatusForbidden, err)
		return
	}
	var proof struct {
		Message   string `json:"message"`
		Signature string `json:"signature"`
		Address   string `json:"address"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	if err := decoder.Decode(&proof); err != nil ||
		proof.Message == "" || proof.Signature == "" || proof.Address == "" {
		writeError(w, http.StatusBadRequest, errors.New("complete wallet proof is required"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	gridIdentity, err := a.client.ExchangeWallet(
		ctx,
		a.cfg.DefaultAPIKey,
		proof.Message,
		proof.Signature,
		proof.Address,
		walletAppSubject(proof.Address),
	)
	if err != nil {
		log.Printf("Auth: Grid wallet exchange failed: %v", err)
		writeError(w, http.StatusUnauthorized, errors.New("wallet proof was rejected"))
		return
	}
	walletClaims := &auth.Claims{
		WalletAddress: gridIdentity.Wallet,
		GridAccountID: gridIdentity.AccountID,
	}
	if err := a.canonicalizeGalleryOwnership(walletClaims); err != nil {
		log.Printf("Auth: Failed to canonicalize wallet ownership: %v", err)
		writeError(w, http.StatusServiceUnavailable, errors.New("account data is temporarily unavailable"))
		return
	}
	token, err := auth.GenerateWalletJWT(
		gridIdentity.Wallet,
		gridIdentity.AccessToken,
		gridIdentity.AccountID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, errors.New("failed to create wallet session"))
		return
	}
	a.setAuthCookie(w, r, token)
	writeJSON(w, http.StatusOK, map[string]string{
		"address":   gridIdentity.Wallet,
		"accountId": gridIdentity.AccountID,
	})
}

func (a *App) handleCredits(w http.ResponseWriter, r *http.Request) {
	userToken, err := a.gridUserToken(r.Context(), r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	credits, err := a.client.Credits(ctx, a.cfg.DefaultAPIKey, userToken)
	if err != nil {
		writeError(w, http.StatusBadGateway, errors.New("Grid credits are unavailable"))
		return
	}
	writeJSON(w, http.StatusOK, credits)
}

func (a *App) handleCreditQuote(w http.ResponseWriter, r *http.Request) {
	var request CreditQuoteRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeError(w, http.StatusBadRequest, errors.New("invalid credit quote request"))
		return
	}
	preset, ok := a.catalog.Get(request.ModelID)
	if !ok {
		writeError(w, http.StatusBadRequest, fmt.Errorf("unknown model: %s", request.ModelID))
		return
	}
	if err := request.Validate(preset); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	userToken, err := a.gridUserToken(r.Context(), r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	quote, err := a.client.CreditQuote(
		ctx,
		a.cfg.DefaultAPIKey,
		userToken,
		buildCreditQuoteRequest(request.GenerationRequest(), preset),
	)
	if err != nil {
		writeError(w, http.StatusBadGateway, errors.New("Grid credit quote is unavailable"))
		return
	}
	writeJSON(w, http.StatusOK, quote)
}

func (a *App) handleWalletLinkNonce(w http.ResponseWriter, r *http.Request) {
	claims := getClaimsFromContext(r)
	if claims == nil || claims.GoogleID == "" {
		writeError(w, http.StatusForbidden, errors.New("Google session required"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	nonce, err := a.client.WalletLinkNonce(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, errors.New("wallet-link nonce unavailable"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"nonce": nonce})
}

func (a *App) handleWalletLink(w http.ResponseWriter, r *http.Request) {
	claims := getClaimsFromContext(r)
	if claims == nil || claims.GoogleID == "" {
		writeError(w, http.StatusForbidden, errors.New("Google session required"))
		return
	}
	var proof struct {
		Message   string `json:"message"`
		Signature string `json:"signature"`
		Address   string `json:"address"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	if err := decoder.Decode(&proof); err != nil || proof.Message == "" || proof.Signature == "" || proof.Address == "" {
		writeError(w, http.StatusBadRequest, errors.New("invalid wallet proof"))
		return
	}
	if claims.GridAccessToken == "" {
		writeError(w, http.StatusUnauthorized, errors.New("fresh Google sign-in required"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	result, err := a.client.LinkWallet(ctx, a.cfg.DefaultAPIKey, claims.GridAccessToken, map[string]string{
		"message": proof.Message, "signature": proof.Signature, "address": proof.Address,
	})
	if err != nil {
		writeError(w, http.StatusConflict, err)
		return
	}
	verifiedWallet, _ := result["wallet"].(string)
	if verifiedWallet == "" {
		writeError(w, http.StatusBadGateway, errors.New("Grid returned an invalid wallet-link result"))
		return
	}
	linkedClaims := &auth.Claims{
		GoogleID:      claims.GoogleID,
		WalletAddress: verifiedWallet,
		GridAccountID: claims.GridAccountID,
	}
	if err := a.canonicalizeGalleryOwnership(linkedClaims); err != nil {
		log.Printf("Auth: Failed to canonicalize linked ownership: %v", err)
		writeError(w, http.StatusServiceUnavailable, errors.New("account data is temporarily unavailable"))
		return
	}
	token, err := auth.GenerateLinkedJWT(
		claims.GoogleID, claims.Email, claims.Name, verifiedWallet,
		claims.GridAccessToken, claims.GridAccountID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, errors.New("failed to refresh linked session"))
		return
	}
	a.setAuthCookie(w, r, token)
	writeJSON(w, http.StatusOK, result)
}

// modelNameAliases maps preset IDs to possible Grid API model names
// This handles naming variations between what workers report and our preset IDs
var modelNameAliases = map[string][]string{
	// WAN 2.2 models - underscores vs hyphens, case variations
	"wan2.2_ti2v_5B":     {"wan2.2_ti2v_5b", "wan2_2_ti2v_5b", "wan2.2-ti2v-5b", "wan2.2_ti2v_5B"},
	"wan2.2-t2v-a14b":    {"wan2_2_t2v_14b", "wan2.2-t2v-14b", "wan2.2_t2v_a14b", "wan2.2-t2v-a14b"},
	"wan2.2-t2v-a14b-hq": {"wan2_2_t2v_14b_hq", "wan2.2-t2v-14b-hq", "wan2.2_t2v_a14b_hq", "wan2.2-t2v-a14b-hq"},

	// FLUX models - case and punctuation variations
	"FLUX.1-dev":                    {"flux.1-dev", "flux1-dev", "flux1.dev", "flux1_dev", "FLUX.1-dev"},
	"flux.1-krea-dev":               {"flux1-krea-dev", "flux1_krea_dev", "flux.1_krea_dev", "krea", "flux.1-krea-dev", "flux1-krea-dev_fp8_scaled", "flux1-krea-dev-fp8-scaled", "flux1_krea_dev_fp8_scaled"},
	"FLUX.1-dev-Kontext-fp8-scaled": {"flux.1-dev-kontext-fp8-scaled", "flux1-dev-kontext-fp8-scaled", "flux1_dev_kontext_fp8_scaled", "flux_kontext_dev_basic", "FLUX.1-dev-Kontext-fp8-scaled"},
	"Flux.1-Schnell fp8 (Compact)":  {"flux.1-schnell fp8 (compact)", "flux1-schnell-fp8-compact", "flux.1-schnell", "Flux.1-Schnell fp8 (Compact)"},

	// Chroma
	"Chroma": {"chroma", "chroma_final", "Chroma"},

	// SDXL
	"SDXL 1.0": {"sdxl 1.0", "sdxl1", "sdxl", "sdxl1.0", "SDXL 1.0"},

	// Other models
	"ltxv": {"ltx-video", "ltxv-13b", "ltxv"},
	"ICBINP - I Can't Believe It's Not Photography": {"icbinp", "icbinp - i can't believe it's not photography"},
	"ICBINP XL": {"icbinp xl", "icbinp-xl", "ICBINP XL"},
}

// presetToGridName maps preset IDs to the model names workers advertise on the
// new grid (what /v1/status/models returns and the recipes are keyed by). The
// catalog uses those exact names as preset IDs, so this is an identity by
// default — kept as an override hook for any future alias divergence.
var presetToGridName = map[string]string{}

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
		"models":            response,
		"chainSource":       a.vaultClient.IsEnabled(),
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

// handleGetStyles returns the curated styles/models configuration for the create
// page. The model presets (server/config/model_presets.json, merged into the
// catalog) are the single source of truth for per-model *limits and numeric
// defaults*; styles.json owns only presentation (which models to show, names,
// enabled/default flags, grid-safe sampler) plus dimensions. We overlay the
// catalog onto styles.json here so the two can't drift — edit a recipe's limits
// once, in the presets, and the UI follows.
func (a *App) handleGetStyles(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile(a.cfg.StylesConfigPath)
	if err != nil {
		log.Printf("Error reading styles config (%s): %v", a.cfg.StylesConfigPath, err)
		writeError(w, http.StatusInternalServerError, fmt.Errorf("styles config not found"))
		return
	}

	// Graceful degradation: if the overlay fails for any reason, serve the raw
	// styles.json (its hand-maintained limits act as the fallback).
	if merged, mErr := mergeStylesWithCatalog(data, a.catalog); mErr == nil {
		data = merged
	} else {
		log.Printf("styles/catalog merge failed, serving raw styles.json: %v", mErr)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// mergeStylesWithCatalog overlays each model's recipe limits + numeric defaults
// from the preset catalog onto the styles config. Presentation fields (name,
// description, enabled, default, type, requiresImage) and the grid-safe
// sampler/scheduler are kept from styles.json. Models with no matching preset
// (e.g. ones not yet in model_presets.json) keep their styles.json values.
func mergeStylesWithCatalog(raw []byte, catalog models.Catalog) ([]byte, error) {
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("parse styles config: %w", err)
	}
	rawModels, ok := doc["models"]
	if !ok {
		return raw, nil // nothing to merge
	}
	var mods []map[string]any
	if err := json.Unmarshal(rawModels, &mods); err != nil {
		return nil, fmt.Errorf("parse styles models: %w", err)
	}

	for _, m := range mods {
		id, _ := m["id"].(string)
		if id == "" {
			continue
		}
		preset, found := catalog.Get(id)
		if !found {
			continue // no recipe → keep styles.json limits/settings as-is
		}
		m["limits"] = mergeLimits(m["limits"], preset)
		m["settings"] = mergeSettings(m["settings"], preset)
		m["capabilities"] = preset.Capabilities
	}

	newModels, err := json.Marshal(mods)
	if err != nil {
		return nil, err
	}
	doc["models"] = newModels
	return json.Marshal(doc)
}

// mergeLimits overlays the preset's limits onto whatever styles.json declared,
// field by field: the catalog wins for every range it specifies, and any range
// styles.json had that the catalog omits (e.g. a cfg cap the preset leaves open)
// is preserved rather than dropped.
func mergeLimits(existing any, p models.ModelPreset) map[string]any {
	out := map[string]any{}
	if m, ok := existing.(map[string]any); ok {
		for k, v := range m {
			out[k] = v
		}
	}
	if r := p.Limits.Steps; r != nil {
		out["steps"] = map[string]any{"min": r.Min, "max": r.Max}
	}
	if r := p.Limits.CfgScale; r != nil {
		out["cfgScale"] = map[string]any{"min": r.Min, "max": r.Max}
	}
	if r := p.Limits.Width; r != nil {
		out["width"] = map[string]any{"min": r.Min, "max": r.Max, "step": r.Step}
	}
	if r := p.Limits.Height; r != nil {
		out["height"] = map[string]any{"min": r.Min, "max": r.Max, "step": r.Step}
	}
	if r := p.Limits.Length; r != nil {
		out["length"] = map[string]any{"min": r.Min, "max": r.Max, "step": r.Step}
	}
	return out
}

// mergeSettings overlays the preset's numeric defaults onto the model's existing
// settings, preserving the grid-safe sampler/scheduler already set in
// styles.json (the preset's sampler may be a horde-style name the grid rejects).
func mergeSettings(existing any, p models.ModelPreset) map[string]any {
	out := map[string]any{}
	if m, ok := existing.(map[string]any); ok {
		for k, v := range m {
			out[k] = v // keep sampler, scheduler, and any other curated fields
		}
	}
	d := p.Defaults
	if d.Steps > 0 {
		out["steps"] = d.Steps
	}
	if d.CfgScale > 0 {
		out["cfgScale"] = d.CfgScale
	}
	if d.Length > 0 {
		out["length"] = d.Length
	}
	if d.FPS > 0 {
		out["fps"] = d.FPS
	}
	if d.Width > 0 {
		out["width"] = d.Width
	}
	if d.Height > 0 {
		out["height"] = d.Height
	}
	// Only fall back to the preset's sampler/scheduler if styles.json omitted one.
	if _, has := out["sampler"]; !has && d.Sampler != "" {
		out["sampler"] = d.Sampler
	}
	if _, has := out["scheduler"]; !has && d.Scheduler != "" {
		out["scheduler"] = d.Scheduler
	}
	return out
}

// handleGridStyles proxies the grid's curated creative-style registry
// (GET /v1/styles). NOTE: the older /api/styles above serves the frontend's
// create-config blob (models/dimensions/defaults) and is really misnamed — the
// real "styles" are these. Kept on a distinct path until the frontend migrates.
func (a *App) handleGridStyles(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	styles, err := a.client.FetchStyles(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"styles": styles})
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
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxCreateRequestBytes))
	if err := decoder.Decode(&req); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeError(w, http.StatusRequestEntityTooLarge, errors.New("generation request is too large"))
			return
		}
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

	if a.cfg.DefaultAPIKey == "" {
		writeError(w, http.StatusServiceUnavailable, errors.New("Grid bridge is not configured"))
		return
	}
	userToken, err := a.gridUserToken(r.Context(), r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err)
		return
	}
	owner := getGalleryOwnerIdentifier(r)

	gen := buildGenerateRequest(req, preset)
	kind := "image"
	if preset.Type == "video" || req.MediaType == "video" {
		kind = "video"
	}
	quoteContext, quoteCancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer quoteCancel()
	quote, err := a.client.CreditQuote(
		quoteContext,
		a.cfg.DefaultAPIKey,
		userToken,
		buildCreditQuoteRequest(req, preset),
	)
	if err != nil {
		writeError(w, http.StatusBadGateway, errors.New("Grid credit quote is unavailable"))
		return
	}
	if quote.ChargingEnabled && !quote.Estimate.Priced {
		writeError(w, http.StatusServiceUnavailable, errors.New("this model is not priced for paid generation"))
		return
	}
	if quote.ChargingEnabled && !quote.Estimate.BalanceSufficient {
		writeError(w, http.StatusPaymentRequired, errors.New("insufficient Grid credits - add credits to continue"))
		return
	}

	// Prefer our own worker when configured. TARGET_WORKER_ID is the worker NAME
	// on the new grid; the gallery's account must own it (the grid 403s otherwise).
	if a.cfg.TargetWorkerID != "" {
		gen.Worker = a.cfg.TargetWorkerID
		log.Printf("🎯 Preferring worker: %s", a.cfg.TargetWorkerID)
	}

	log.Printf("📤 Creating %s job: modelId=%s, gridName=%s, size=%q, img2x=%v",
		kind, req.ModelID, gen.Model, gen.Size, gen.Image != "")

	// The new grid /v1 endpoints are synchronous (the POST blocks until the
	// worker finishes). The gallery's own API stays async: register a pending
	// job, return its id now, and run the blocking grid call in the background.
	jobID := a.pending.create(kind, req.Prompt, owner)
	// Use the bridge job id as the progress token so the grid stashes the
	// worker's live % under it; handleJobStatus polls it while processing.
	gen.ProgressToken = jobID

	clientAgent := a.cfg.ClientAgent
	go func() {
		// Detached from the request: the HTTP handler has already returned.
		// Use the same ceiling as the media client so the two layers cannot
		// disagree about whether a Core job is still live.
		ctx, cancel := context.WithTimeout(context.Background(), aipg.MediaGenerationTimeout)
		defer cancel()

		resp, err := a.client.GenerateMedia(ctx, kind, gen, a.cfg.DefaultAPIKey, userToken, clientAgent)
		if err != nil {
			log.Printf("❌ Grid %s job %s failed: %v", kind, jobID, err)
			a.pending.fail(jobID, err.Error())
			return
		}
		log.Printf("✅ Grid %s job %s done: %d result(s)", kind, jobID, len(resp.Data))
		a.pending.complete(jobID, resp.Data, resp.Grid)
	}()

	writeJSON(w, http.StatusAccepted, map[string]any{
		"jobId":  jobID,
		"status": "queued",
	})
}

func (a *App) handleJobStatus(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("job id required"))
		return
	}

	job, ok := a.pending.get(jobID)
	if !ok {
		writeError(w, http.StatusNotFound, fmt.Errorf("unknown or expired job: %s", jobID))
		return
	}
	if job.Owner == "" || job.Owner != getGalleryOwnerIdentifier(r) {
		writeError(w, http.StatusNotFound, errors.New("job not found"))
		return
	}

	view := buildJobView(jobID, job)
	// While the job is running, surface the worker's real progress (best-effort).
	if job.Status == "processing" {
		ctx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
		defer cancel()
		if p, err := a.client.FetchProgress(ctx, jobID); err == nil {
			view.Progress = p
		}
	}
	writeJSON(w, http.StatusOK, view)
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
	OnChain     bool                  `json:"onChain"`
	Constraints *ChainConstraintsView `json:"constraints,omitempty"`
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

	capabilities := preset.Capabilities
	if len(stat.Capabilities) > 0 {
		capabilities = stat.Capabilities
	}

	view := ModelView{
		ID:                   preset.ID,
		DisplayName:          preset.DisplayName,
		Type:                 preset.Type,
		Description:          preset.Description,
		Tags:                 preset.Tags,
		Capabilities:         capabilities,
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
	ModelID        string           `json:"modelId"`
	Prompt         string           `json:"prompt"`
	NegativePrompt string           `json:"negativePrompt"`
	Params         GenerationParams `json:"params"`
	NSFW           bool             `json:"nsfw"`
	Public         bool             `json:"public"`
	SourceImage    string           `json:"sourceImage"`
	// End-frame anchor for first-last-frame "fill-between" video recipes. Passed
	// through to the grid as image_end; must match the published FLF recipe's var.
	SourceImageEnd   string `json:"sourceImageEnd"`
	SourceMask       string `json:"sourceMask"`
	SourceProcessing string `json:"sourceProcessing"`
	// LTX Director timeline fields (Director recipes only; empty otherwise).
	// TimelineData is the LTXDirector node's serialized editor state — segments may
	// embed keyframe images inline as base64 (`imageB64`), which is how per-segment
	// images travel without a multi-image upload path. The three flat strings are
	// the prompt-relay inputs the web editor derives from the same segments.
	TimelineData   string `json:"timelineData,omitempty"`
	LocalPrompts   string `json:"localPrompts,omitempty"`   // "|"-delimited per-segment prompts
	SegmentLengths string `json:"segmentLengths,omitempty"` // ","-delimited frame counts
	GuideStrength  string `json:"guideStrength,omitempty"`  // ","-delimited image-guide strengths
	MediaType      string `json:"mediaType"`                // "image" or "video"
	Style          string `json:"style"`                    // curated style id (grid expands it)
	// CivitAI LoRAs to inject: [{name, model, clip, is_version}]. Passed through
	// to the grid, which gates them (capability + blacklist + count) and downloads.
	Loras []any `json:"loras,omitempty"`
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
	N         int     `json:"n"` // Number of images to generate (batch size, 1-4)
}

type CreditQuoteRequest struct {
	ModelID string `json:"modelId"`
	N       int    `json:"n"`
	Length  int    `json:"length"`
	FPS     int    `json:"fps"`
}

func (r CreditQuoteRequest) Validate(preset models.ModelPreset) error {
	if strings.TrimSpace(r.ModelID) == "" {
		return errors.New("modelId is required")
	}
	if r.N < 0 || r.N > maxBatchN {
		return fmt.Errorf("n must be between 1 and %d", maxBatchN)
	}
	if r.Length < 0 ||
		(r.Length > 0 && preset.Limits.Length != nil &&
			(r.Length < preset.Limits.Length.Min || r.Length > preset.Limits.Length.Max)) {
		return errors.New("video length is outside the model limit")
	}
	if r.FPS < 0 ||
		(r.FPS > 0 && preset.Limits.FPS != nil &&
			(r.FPS < preset.Limits.FPS.Min || r.FPS > preset.Limits.FPS.Max)) {
		return errors.New("video fps is outside the model limit")
	}
	return nil
}

func (r CreditQuoteRequest) GenerationRequest() CreateJobRequest {
	return CreateJobRequest{
		ModelID: r.ModelID,
		Params: GenerationParams{
			N:      r.N,
			Length: r.Length,
			FPS:    r.FPS,
		},
	}
}

func buildCreditQuoteRequest(
	request CreateJobRequest,
	preset models.ModelPreset,
) aipg.CreditQuoteRequest {
	generation := buildGenerateRequest(request, preset)
	modality := "image"
	if preset.Type == "video" || request.MediaType == "video" {
		modality = "video"
	}
	n := generation.N
	if n <= 0 {
		n = 1
	}
	seconds := generation.Seconds
	if modality == "video" && seconds <= 0 {
		length := preset.Defaults.Length
		fps := preset.Defaults.FPS
		if fps <= 0 {
			fps = 24
		}
		if length > 0 {
			seconds = float64(length) / float64(fps)
		}
	}
	return aipg.CreditQuoteRequest{
		Model:    generation.Model,
		Modality: modality,
		N:        n,
		Seconds:  seconds,
	}
}

// Server-side generation caps. The frontend gates batch/limits for UX, but the
// client is never trusted: these bounds are enforced here regardless of what the
// browser sends. Zero means "use the model default" and is left untouched.
const (
	maxPromptLen = 4000
	maxBatchN    = 4
	maxSteps     = 150
	maxDimension = 2048
	// Director timeline caps. The flat relay strings are text-only; timeline_data
	// additionally embeds base64 keyframe images (~12MB each client-capped), so it
	// gets a generous-but-bounded ceiling to keep one request from monopolising
	// the decoder.
	maxRelayStringLen     = 16000
	maxTimelineDataLen    = 25 << 20 // 25MB — the grid's documented total-request budget for Director timelines
	maxCreateRequestBytes = 26 << 20
)

func (r CreateJobRequest) Validate() error {
	if strings.TrimSpace(r.Prompt) == "" {
		return errors.New("prompt is required")
	}
	if strings.TrimSpace(r.ModelID) == "" {
		return errors.New("modelId is required")
	}
	if len(r.Prompt) > maxPromptLen {
		return fmt.Errorf("prompt too long (max %d chars)", maxPromptLen)
	}
	if len(r.NegativePrompt) > maxPromptLen {
		return fmt.Errorf("negative prompt too long (max %d chars)", maxPromptLen)
	}
	if r.Params.N < 0 || r.Params.N > maxBatchN {
		return fmt.Errorf("n must be between 1 and %d", maxBatchN)
	}
	if r.Params.Steps < 0 || r.Params.Steps > maxSteps {
		return fmt.Errorf("steps must be between 1 and %d", maxSteps)
	}
	if r.Params.Width < 0 || r.Params.Width > maxDimension ||
		r.Params.Height < 0 || r.Params.Height > maxDimension {
		return fmt.Errorf("dimensions must not exceed %d", maxDimension)
	}
	if len(r.LocalPrompts) > maxRelayStringLen || len(r.SegmentLengths) > maxRelayStringLen ||
		len(r.GuideStrength) > maxRelayStringLen {
		return fmt.Errorf("timeline relay strings too long (max %d chars)", maxRelayStringLen)
	}
	if len(r.TimelineData) > maxTimelineDataLen {
		return fmt.Errorf("timeline data too large (max %d bytes)", maxTimelineDataLen)
	}
	if r.TimelineData != "" && !json.Valid([]byte(r.TimelineData)) {
		return errors.New("timeline data must be valid JSON")
	}
	return nil
}

// buildGenerateRequest maps the gallery's CreateJobRequest onto the new grid's
// OpenAI-shaped /v1 body. Knobs the user did not explicitly set are LEFT OUT so
// the grid applies the model's recipe default (the happy path). We do not clamp
// here — the grid is the authority and rejects out-of-band overrides (422)
// rather than silently clamping, which is the behaviour we want users to see.
func buildGenerateRequest(req CreateJobRequest, preset models.ModelPreset) aipg.GenerateRequest {
	gen := aipg.GenerateRequest{
		Model: getGridModelName(preset.ID),
		Style: req.Style,
	}

	if req.Style != "" {
		// A style owns prompt-shaping (its template + negative) and locks key
		// params grid-side, so send the RAW prompt and skip local enhancement —
		// otherwise we'd double-enhance.
		gen.Prompt = req.Prompt
		gen.NegativePrompt = req.NegativePrompt
	} else {
		// No style: enhance positive + provide a sensible default negative.
		gen.Prompt, gen.NegativePrompt = prompts.ProcessPrompts(req.Prompt, req.NegativePrompt, preset.ID)
	}

	// Size: only pin when the caller supplied BOTH dimensions. Omitting it lets
	// the grid pick the recipe default and, for img2img/img2video, auto-match
	// the output to the source frame.
	if req.Params.Width > 0 && req.Params.Height > 0 {
		gen.Size = fmt.Sprintf("%dx%d", req.Params.Width, req.Params.Height)
	}

	// Batch size.
	if req.Params.N > 0 {
		gen.N = req.Params.N
	}

	// img2img / img2video source frame (inline base64 / data URI).
	if req.SourceImage != "" {
		gen.Image = req.SourceImage
	}

	// End-frame anchor for fill-between (first-last-frame) video recipes.
	if req.SourceImageEnd != "" {
		gen.ImageEnd = req.SourceImageEnd
	}

	// LTX Director timeline passthrough (Director recipes declare these vars;
	// the grid rejects them for models that don't).
	if req.TimelineData != "" {
		gen.TimelineData = req.TimelineData
	}
	if req.LocalPrompts != "" {
		gen.LocalPrompts = req.LocalPrompts
	}
	if req.SegmentLengths != "" {
		gen.SegmentLengths = req.SegmentLengths
	}
	if req.GuideStrength != "" {
		gen.GuideStrength = req.GuideStrength
	}

	// User-supplied CivitAI LoRAs (grid gates + downloads them).
	if len(req.Loras) > 0 {
		gen.Loras = req.Loras
	}

	// Advanced knobs — pass through ONLY when the user set them.
	if req.Params.Seed != "" {
		gen.Seed = req.Params.Seed
	}
	if req.Params.Steps > 0 {
		gen.Steps = req.Params.Steps
	}
	if req.Params.CfgScale > 0 {
		gen.CfgScale = req.Params.CfgScale
	}
	if req.Params.Sampler != "" {
		// The new grid enum-validates samplers against the recipe's ComfyUI names
		// (euler, dpmpp_2m, res_multistep, …) and rejects off-list values. Pass
		// the value straight through — presets only offer names the recipe allows.
		// (No more horde k_* remapping; that produced names the grid 422s on.)
		gen.Sampler = req.Params.Sampler
	}
	if req.Params.Scheduler != "" {
		gen.Scheduler = req.Params.Scheduler
	}

	// Video-only: the grid takes seconds + fps and derives frame count. The
	// gallery UI expresses duration as a frame count ("length"), so convert.
	if preset.Type == "video" {
		fps := req.Params.FPS
		if fps > 0 {
			gen.FPS = fps
		}
		if req.Params.Length > 0 {
			effFPS := fps
			if effFPS <= 0 {
				effFPS = 24 // grid default; only used to derive duration
			}
			gen.Seconds = float64(req.Params.Length) / float64(effFPS)
		}
	}

	return gen
}

type JobView struct {
	JobID         string           `json:"jobId"`
	Status        string           `json:"status"`
	Faulted       bool             `json:"faulted"`
	Error         string           `json:"error,omitempty"`
	Progress      *int             `json:"progress,omitempty"` // 0-100 worker progress while processing
	WaitTime      float64          `json:"waitTime"`
	QueuePosition int              `json:"queuePosition"`
	Processing    int              `json:"processing"`
	Finished      int              `json:"finished"`
	Waiting       int              `json:"waiting"`
	Generations   []GenerationView `json:"generations"`
	// Per-job provenance from the grid (worker that ran it + wall-clock seconds).
	GridJobID string   `json:"gridJobId,omitempty"`
	Worker    string   `json:"worker,omitempty"`
	GenTime   *float64 `json:"genTime,omitempty"`
	Model     string   `json:"model,omitempty"`
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

// buildJobView renders a pending-store entry into the JobView the frontend
// polls. The new grid returns final public URLs (images.aipg.art /
// media.aipg.art) directly, so there is no R2-key reconstruction to do here.
func buildJobView(jobID string, job pendingJob) JobView {
	view := JobView{
		JobID:   jobID,
		Status:  job.Status,
		Faulted: job.Status == "faulted",
		Error:   job.Err,
	}

	switch job.Status {
	case "processing":
		view.Processing = 1
	case "completed":
		view.Finished = len(job.Items)
	}

	if job.Grid != nil {
		view.GridJobID = job.Grid.JobID
		view.Worker = job.Grid.Worker
		view.GenTime = job.Grid.GenTime
		view.Model = job.Grid.Model
	}

	views := make([]GenerationView, 0, len(job.Items))
	for i, item := range job.Items {
		gv := GenerationView{
			ID:   fmt.Sprintf("%s-%d", jobID, i),
			Kind: job.Kind,
		}
		if job.Grid != nil {
			gv.WorkerName = job.Grid.Worker
		}
		if item.Seed != nil {
			gv.Seed = strconv.FormatInt(*item.Seed, 10)
		}
		if item.URL != "" {
			gv.URL = item.URL
		} else if item.B64JSON != "" {
			gv.Base64 = normalizeBase64(item.B64JSON)
		}
		views = append(views, gv)
	}
	view.Generations = views

	return view
}

func verifiedGridMeta(store *pendingStore, jobID, owner string) *aipg.GridMeta {
	pending, ok := store.get(jobID)
	if !ok ||
		pending.Status != "completed" ||
		pending.Owner != owner ||
		pending.Grid == nil {
		return nil
	}
	return pending.Grid
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
	modelsParam := r.URL.Query().Get("models")
	aspectRatio := r.URL.Query().Get("aspect")
	nsfwFilter := r.URL.Query().Get("nsfw")

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

	// Parse models filter (comma-separated)
	var models []string
	if modelsParam != "" {
		for _, m := range strings.Split(modelsParam, ",") {
			m = strings.TrimSpace(m)
			if m != "" {
				models = append(models, m)
			}
		}
	}

	// Build cache key from all parameters
	cacheKey := fmt.Sprintf("gallery:%s:%d:%d:%s:%s:%s:%s",
		typeFilter, limit, offset, searchQuery, modelsParam, aspectRatio, nsfwFilter)

	// Check cache first (30 second TTL)
	if cached, found := a.cache.Get(cacheKey); found {
		writeJSON(w, http.StatusOK, cached)
		return
	}

	// Use PostgresStore's ListAdvanced if available, otherwise fall back to List
	var result interface{}
	if pgStore, ok := a.galleryStore.(*gallery.PostgresStore); ok {
		result = pgStore.ListAdvanced(typeFilter, limit, offset, searchQuery, models, aspectRatio, nsfwFilter)
	} else {
		result = a.galleryStore.List(typeFilter, limit, offset, searchQuery)
	}

	// Cache the result for 30 seconds
	a.cache.Set(cacheKey, result, 30*time.Second)

	writeJSON(w, http.StatusOK, result)
}

func (a *App) handleListGalleryModels(w http.ResponseWriter, r *http.Request) {
	cacheKey := "gallery:models"

	// Check cache first (5 minute TTL - models change rarely)
	if cached, found := a.cache.Get(cacheKey); found {
		writeJSON(w, http.StatusOK, cached)
		return
	}

	// Get unique models from the gallery
	var result map[string]any
	if pgStore, ok := a.galleryStore.(*gallery.PostgresStore); ok {
		models := pgStore.ListModels()
		result = map[string]any{"models": models}
	} else {
		result = map[string]any{"models": []string{}}
	}

	// Cache for 5 minutes
	a.cache.Set(cacheKey, result, 5*time.Minute)

	writeJSON(w, http.StatusOK, result)
}

type JobParamsRequest struct {
	Width     *int     `json:"width,omitempty"`
	Height    *int     `json:"height,omitempty"`
	Steps     *int     `json:"steps,omitempty"`
	CfgScale  *float64 `json:"cfgScale,omitempty"`
	Sampler   *string  `json:"sampler,omitempty"`
	Scheduler *string  `json:"scheduler,omitempty"`
	Seed      *string  `json:"seed,omitempty"`
	Denoise   *float64 `json:"denoise,omitempty"`
	Length    *int     `json:"length,omitempty"`
	Fps       *int     `json:"fps,omitempty"`
	Tiling    *bool    `json:"tiling,omitempty"`
	HiresFix  *bool    `json:"hiresFix,omitempty"`
}

type AddToGalleryRequest struct {
	JobID          string            `json:"jobId"`
	ModelID        string            `json:"modelId"`
	ModelName      string            `json:"modelName"`
	Prompt         string            `json:"prompt"`
	NegativePrompt string            `json:"negativePrompt,omitempty"`
	Type           string            `json:"type"`
	IsNSFW         bool              `json:"isNsfw"`
	IsPublic       bool              `json:"isPublic"`
	WalletAddress  string            `json:"walletAddress,omitempty"`
	Params         *JobParamsRequest `json:"params,omitempty"`
	MediaURLs      []string          `json:"mediaUrls,omitempty"`
	// Per-job provenance from the grid (worker that ran it + wall-clock seconds).
	Worker  string   `json:"worker,omitempty"`
	GenTime *float64 `json:"genTime,omitempty"`
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

	ownerID := getGalleryOwnerIdentifier(r)
	if ownerID == "" {
		writeError(w, http.StatusUnauthorized, errors.New("authenticated owner is required"))
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
		WalletAddress:  ownerID,
		Params:         galleryParams,
		MediaURLs:      req.MediaURLs,
		Worker:         req.Worker,
		GenTime:        req.GenTime,
	}

	a.galleryStore.Add(item)

	log.Printf("Gallery: added job %s (model=%s, type=%s, owner=%s, public=%v)", req.JobID, req.ModelName, req.Type, ownerID, req.IsPublic)

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Added to gallery",
	})
}

func (a *App) handleListMyGallery(w http.ResponseWriter, r *http.Request) {
	ownerID := getGalleryOwnerIdentifier(r)
	if ownerID == "" {
		writeError(w, http.StatusUnauthorized, errors.New("authenticated owner is required"))
		return
	}

	limit := 100
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= 500 {
			limit = parsed
		}
	}
	items := a.galleryStore.ListByWallet(ownerID, limit)
	writeJSON(w, http.StatusOK, map[string]any{
		"items":  items,
		"count":  len(items),
		"wallet": "session",
	})
}

func (a *App) handleListByWallet(w http.ResponseWriter, r *http.Request) {
	wallet := chi.URLParam(r, "wallet")
	if wallet == "" {
		writeError(w, http.StatusBadRequest, errors.New("wallet address is required"))
		return
	}
	if strings.ToLower(strings.TrimSpace(wallet)) != getGalleryOwnerIdentifier(r) {
		writeError(w, http.StatusForbidden, errors.New("you can only view your own private gallery"))
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

	// The new grid returns final public URLs at generation time, which the
	// frontend persists into the item via handleAddToGallery. So the stored
	// MediaURLs are authoritative — there is no async job to re-query (the
	// bridge jobID is ephemeral and never existed grid-side). Prefer them.
	if len(item.MediaURLs) > 0 {
		urls := make([]string, 0, len(item.MediaURLs))
		for _, u := range item.MediaURLs {
			if u == "" {
				continue
			}
			// Preserve presigned R2 URLs as-is; normalize anything else to CDN.
			if strings.Contains(u, ".r2.cloudflarestorage.com") || strings.Contains(u, "presigned") {
				urls = append(urls, u)
			} else if cdn := r2.ConvertToCDNURL(u); cdn != "" {
				urls = append(urls, cdn)
			}
		}
		if len(urls) > 0 {
			writeJSON(w, http.StatusOK, map[string]any{
				"jobId":     jobID,
				"mediaUrls": urls,
				"type":      item.Type,
				"source":    "stored",
			})
			return
		}
	}

	// Older items may only have generation IDs — mint fresh R2 URLs from them.
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
				"jobId":     jobID,
				"mediaUrls": urls,
				"type":      item.Type,
				"source":    "r2",
			})
			return
		}
	}

	// Absolute fallback - return CDN URL using job ID
	// This may work for older uploads that used job ID as filename
	fallbackURL := "https://images.aipg.art/" + jobID + ".webp"
	writeJSON(w, http.StatusOK, map[string]any{
		"jobId":     jobID,
		"mediaUrls": []string{fallbackURL},
		"type":      item.Type,
		"source":    "fallback",
	})
}

// handleUpdateGalleryItem updates a gallery item's media URLs and seeds (only owner can update)
func (a *App) handleUpdateGalleryItem(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("job ID is required"))
		return
	}

	var req struct {
		MediaURLs []string `json:"mediaUrls"`
		Seeds     []string `json:"seeds,omitempty"`
		Sampler   string   `json:"sampler,omitempty"`
		Scheduler string   `json:"scheduler,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	// Get wallet address from JWT (set by authMiddleware)
	requestWallet := getGalleryOwnerIdentifier(r)

	// Get the item first to check ownership
	item := a.galleryStore.Get(jobID)
	if item == nil {
		writeError(w, http.StatusNotFound, errors.New("gallery item not found"))
		return
	}

	// Check ownership - wallet addresses must match
	itemWallet := strings.ToLower(strings.TrimSpace(item.WalletAddress))
	if itemWallet == "" || itemWallet != requestWallet {
		writeError(w, http.StatusForbidden, errors.New("you can only update your own gallery items"))
		return
	}

	// The Core receipt is server-observed provenance. Never accept a browser
	// claim for it: bind only the completed pending job owned by this session.
	gridJobID := ""
	worker := ""
	var genTime *float64
	if grid := verifiedGridMeta(a.pending, jobID, requestWallet); grid != nil {
		gridJobID = grid.JobID
		worker = grid.Worker
		genTime = grid.GenTime
	}

	// Update the media URLs, seeds, and server-observed receipt.
	err := a.galleryStore.UpdateGalleryItemMedia(jobID, gridJobID, req.MediaURLs, req.Seeds, req.Sampler, req.Scheduler, worker, genTime)
	if err != nil {
		log.Printf("Failed to update gallery item %s: %v", jobID, err)
		writeError(w, http.StatusInternalServerError, errors.New("failed to update gallery item"))
		return
	}

	log.Printf("Gallery: updated job %s (urls=%d, seeds=%d, owner=%s)", jobID, len(req.MediaURLs), len(req.Seeds), requestWallet)

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "Gallery item updated",
		"jobId":   jobID,
	})
}

// handleDeleteGalleryItem removes a gallery item (only owner can delete)
func (a *App) handleDeleteGalleryItem(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("job ID is required"))
		return
	}

	// Get wallet address from JWT (set by authMiddleware)
	requestWallet := getGalleryOwnerIdentifier(r)

	// Get the item first to check ownership
	item := a.galleryStore.Get(jobID)
	if item == nil {
		writeError(w, http.StatusNotFound, errors.New("gallery item not found"))
		return
	}

	// Check ownership - wallet addresses must match
	itemWallet := strings.ToLower(strings.TrimSpace(item.WalletAddress))
	if itemWallet == "" || itemWallet != requestWallet {
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

// handlePublishGalleryItem allows a logged-in user to publish their image to the public gallery
func (a *App) handlePublishGalleryItem(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("job ID is required"))
		return
	}

	// Get wallet address from JWT (set by authMiddleware)
	requestWallet := getGalleryOwnerIdentifier(r)

	// Get the item first to check ownership
	item := a.galleryStore.Get(jobID)
	if item == nil {
		writeError(w, http.StatusNotFound, errors.New("gallery item not found"))
		return
	}

	// Check ownership
	itemWallet := strings.ToLower(strings.TrimSpace(item.WalletAddress))
	if itemWallet != requestWallet {
		writeError(w, http.StatusForbidden, errors.New("you can only publish your own images"))
		return
	}

	// Update to public
	err := a.galleryStore.SetPublic(jobID, true)
	if err != nil {
		writeError(w, http.StatusInternalServerError, errors.New("failed to publish image"))
		return
	}

	log.Printf("Gallery: published job %s by wallet %s", jobID, requestWallet)

	writeJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"message":  "Image published to gallery",
		"jobId":    jobID,
		"isPublic": true,
	})
}

// handleUnpublishGalleryItem removes an image from the public gallery
func (a *App) handleUnpublishGalleryItem(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("job ID is required"))
		return
	}

	requestWallet := getGalleryOwnerIdentifier(r)

	item := a.galleryStore.Get(jobID)
	if item == nil {
		writeError(w, http.StatusNotFound, errors.New("gallery item not found"))
		return
	}

	itemWallet := strings.ToLower(strings.TrimSpace(item.WalletAddress))
	if itemWallet != requestWallet {
		writeError(w, http.StatusForbidden, errors.New("you can only unpublish your own images"))
		return
	}

	err := a.galleryStore.SetPublic(jobID, false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, errors.New("failed to unpublish image"))
		return
	}

	log.Printf("Gallery: unpublished job %s by wallet %s", jobID, requestWallet)

	writeJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"message":  "Image removed from public gallery",
		"jobId":    jobID,
		"isPublic": false,
	})
}

// handleExtractSingleImage extracts one image from a batch into its own gallery item
func (a *App) handleExtractSingleImage(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "id")
	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("job ID is required"))
		return
	}

	var req struct {
		Index int `json:"index"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, errors.New("invalid request body"))
		return
	}

	requestWallet := getGalleryOwnerIdentifier(r)

	// Get the original batch item
	item := a.galleryStore.Get(jobID)
	if item == nil {
		writeError(w, http.StatusNotFound, errors.New("gallery item not found"))
		return
	}

	// Check ownership
	itemWallet := strings.ToLower(strings.TrimSpace(item.WalletAddress))
	if itemWallet != requestWallet {
		writeError(w, http.StatusForbidden, errors.New("you can only extract from your own images"))
		return
	}

	// Validate index
	if len(item.MediaURLs) <= 1 {
		writeError(w, http.StatusBadRequest, errors.New("item is not a batch"))
		return
	}
	if req.Index < 0 || req.Index >= len(item.MediaURLs) {
		writeError(w, http.StatusBadRequest, errors.New("invalid image index"))
		return
	}

	// Create new gallery item with just the single image
	newJobID := fmt.Sprintf("%s-extract-%d", jobID, req.Index)

	// Get the seed for this specific image
	var seed *string
	if len(item.Seeds) > req.Index {
		seed = &item.Seeds[req.Index]
	} else if item.Params != nil && item.Params.Seed != nil {
		seed = item.Params.Seed
	}

	newItem := gallery.GalleryItem{
		JobID:          newJobID,
		ModelID:        item.ModelID,
		ModelName:      item.ModelName,
		Prompt:         item.Prompt,
		NegativePrompt: item.NegativePrompt,
		Type:           item.Type,
		IsNSFW:         item.IsNSFW,
		IsPublic:       false, // Start as private
		WalletAddress:  item.WalletAddress,
		MediaURLs:      []string{item.MediaURLs[req.Index]},
		Seeds:          nil, // Single image doesn't need seeds array
		Params:         item.Params,
	}

	// Set the correct seed for this image
	if seed != nil && newItem.Params != nil {
		newItem.Params.Seed = seed
	}

	err := a.galleryStore.Add(newItem)
	if err != nil {
		log.Printf("Failed to extract single image: %v", err)
		writeError(w, http.StatusInternalServerError, errors.New("failed to save extracted image"))
		return
	}

	log.Printf("Gallery: extracted image %d from batch %s to %s by wallet %s", req.Index, jobID, newJobID, requestWallet)

	writeJSON(w, http.StatusOK, map[string]any{
		"success":    true,
		"message":    "Image saved as single",
		"newJobId":   newJobID,
		"originalId": jobID,
	})
}

// Favorites handlers
func (a *App) handleAddFavorite(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobId")
	owner := getGalleryOwnerIdentifier(r) // Same durable owner key gallery items use

	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("jobId required"))
		return
	}
	if owner == "" {
		writeError(w, http.StatusUnauthorized, errors.New("authentication required"))
		return
	}

	if a.favoritesStore == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("favorites not available"))
		return
	}

	err := a.favoritesStore.Add(owner, jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"jobId":   jobID,
	})
}

func (a *App) handleRemoveFavorite(w http.ResponseWriter, r *http.Request) {
	jobID := chi.URLParam(r, "jobId")
	owner := getGalleryOwnerIdentifier(r) // Same durable owner key gallery items use

	if jobID == "" {
		writeError(w, http.StatusBadRequest, errors.New("jobId required"))
		return
	}
	if owner == "" {
		writeError(w, http.StatusUnauthorized, errors.New("authentication required"))
		return
	}

	if a.favoritesStore == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("favorites not available"))
		return
	}

	err := a.favoritesStore.Remove(owner, jobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"jobId":   jobID,
	})
}

// handleListMyFavorites returns the current user's favorited items. It is tied to
// the authenticated user's durable owner key (not a caller-supplied address), so it
// works identically for wallet and Google logins and cannot enumerate other users.
func (a *App) handleListMyFavorites(w http.ResponseWriter, r *http.Request) {
	owner := getGalleryOwnerIdentifier(r)
	if owner == "" {
		writeError(w, http.StatusUnauthorized, errors.New("authentication required"))
		return
	}

	if a.favoritesStore == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("favorites not available"))
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	items := a.favoritesStore.GetFavoritedItems(owner, limit)

	writeJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"count": len(items),
	})
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

// ============================================================================
// AI Text Generation Handlers
// ============================================================================

type AIEnhanceRequest struct {
	Prompt string `json:"prompt"`
	Type   string `json:"type"` // "image" or "video" - affects system prompt
}

type AIEnhanceResponse struct {
	EnhancedPrompt string `json:"enhancedPrompt"`
	Original       string `json:"original"`
}

func (a *App) handleAIEnhance(w http.ResponseWriter, r *http.Request) {
	if a.aiClient == nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("AI service not configured"))
		return
	}

	var req AIEnhanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, errors.New("invalid request body"))
		return
	}

	if strings.TrimSpace(req.Prompt) == "" {
		writeError(w, http.StatusBadRequest, errors.New("prompt is required"))
		return
	}

	// Build prompt - user's input first, then instructions
	systemPrompt := buildEnhanceSystemPrompt(req.Type)
	fullPrompt := "\"" + req.Prompt + "\"\n\n" + systemPrompt

	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	userToken, err := a.gridUserToken(r.Context(), r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err)
		return
	}

	enhanced, err := a.aiClient.GenerateText(ctx, fullPrompt, userToken)
	if err != nil {
		log.Printf("AI enhance error: %v", err)
		writeError(w, http.StatusInternalServerError, errors.New("failed to enhance prompt"))
		return
	}

	// Clean up the response - remove quotes, trim whitespace
	enhanced = strings.TrimSpace(enhanced)
	enhanced = strings.Trim(enhanced, "\"'")
	enhanced = strings.TrimSpace(enhanced)

	writeJSON(w, http.StatusOK, AIEnhanceResponse{
		EnhancedPrompt: enhanced,
		Original:       req.Prompt,
	})
}

func buildEnhanceSystemPrompt(mediaType string) string {
	if mediaType == "video" {
		return `You are an expert at writing prompts for AI video generation models (LTX Video).
Your task is to enhance the user's simple prompt into a detailed, cinematic video prompt.

Guidelines:
- Describe camera movement (pan, zoom, tracking shot, dolly, static, handheld, etc.)
- Include lighting and atmosphere details
- Specify motion and action clearly (what moves, how fast, direction)
- Add temporal flow (what happens over the duration)
- Keep it under 200 words
- Output ONLY the enhanced prompt, nothing else`
	}

	return `Enhance this into a detailed image prompt. Keep ALL elements the user mentioned - do not remove or sanitize anything. Add lighting, composition, style details. End with: sharp focus, 4K, no watermark. Output ONLY the prompt.`
}
