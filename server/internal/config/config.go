package config

import (
	"os"
	"strings"
)

type Config struct {
	Address          string
	APIBaseURL       string
	ClientAgent      string
	DefaultAPIKey    string
	ModelPresetPath  string
	StylesConfigPath string
	AllowedOrigins   []string
	GalleryStorePath string
	JWTSecret        string

	// ModelVault blockchain configuration
	ModelVaultEnabled         bool
	ModelVaultRPCURL          string
	ModelVaultContractAddress string

	// RecipeVault blockchain configuration
	RecipeVaultEnabled         bool
	RecipeVaultRPCURL          string
	RecipeVaultContractAddress string

	// R2 storage configuration for direct media access
	// Uses same env vars as system-core for consistency
	R2Enabled           bool
	R2TransientEndpoint string
	R2TransientBucket   string
	R2PermanentBucket   string
	R2AccessKeyID       string
	R2AccessKeySecret   string
	R2SharedAccessKeyID string
	R2SharedAccessKey   string

	// PostgreSQL configuration
	PostgresEnabled bool
	PostgresConnStr string

	// AI Text Generation (uses DefaultAPIKey)
	AIModel string

	// Worker targeting
	TargetWorkerID string // Target specific worker for all jobs (optional)

	// Google OAuth
	GoogleClientID string

	// Auth cookie (httpOnly session cookie carrying the JWT). Set AuthCookieDomain
	// to e.g. ".aipg.art" in prod so the web app + API subdomains share it; leave
	// empty for host-only (local dev). AuthCookieSecure forces the Secure flag;
	// the server also auto-sets Secure for HTTPS requests.
	AuthCookieDomain string
	AuthCookieSecure bool
}

func Load() Config {
	return Config{
		Address: getEnv("GALLERY_SERVER_ADDR", ":4000"),
		// New grid is OpenAI-shaped and lives under /v1 (no more /api/v2 async horde).
		// Override AIPG_API_URL during DNS cutover if api.aipowergrid.io hasn't
		// propagated yet (e.g. point it at the box's grid.aipowergrid.io/v1).
		APIBaseURL:       getEnv("AIPG_API_URL", "https://api.aipowergrid.io/v1"),
		ClientAgent:      getEnv("AIPG_CLIENT_AGENT", "AIPG-Art-Gallery:v3"),
		DefaultAPIKey:    os.Getenv("AIPG_API_KEY"),
		ModelPresetPath:  getEnv("MODEL_PRESETS_PATH", "./server/config/model_presets.json"),
		StylesConfigPath: getEnv("STYLES_CONFIG_PATH", defaultStylesConfigPath()),
		AllowedOrigins:   splitAndClean(os.Getenv("GALLERY_ALLOWED_ORIGINS")),
		GalleryStorePath: getEnv("GALLERY_STORE_PATH", "./data/gallery.json"),
		JWTSecret:        os.Getenv("JWT_SECRET"),

		// ModelVault blockchain configuration (enabled by default)
		ModelVaultEnabled:         getEnv("MODELVAULT_ENABLED", "true") == "true",
		ModelVaultRPCURL:          getEnv("MODELVAULT_RPC_URL", "https://mainnet.base.org"),
		ModelVaultContractAddress: getEnv("MODELVAULT_CONTRACT", "0x79F39f2a0eA476f53994812e6a8f3C8CFe08c609"),

		// RecipeVault is opt-in until its checkpoint names are migrated to the
		// canonical public model aliases returned by Core.
		RecipeVaultEnabled:         getEnv("RECIPESVAULT_ENABLED", "false") == "true",
		RecipeVaultRPCURL:          getEnv("RECIPESVAULT_RPC_URL", getEnv("MODELVAULT_RPC_URL", "https://mainnet.base.org")),
		RecipeVaultContractAddress: getEnv("RECIPESVAULT_CONTRACT", getEnv("MODELVAULT_CONTRACT", "0x79F39f2a0eA476f53994812e6a8f3C8CFe08c609")),

		// R2 storage configuration (uses same env vars as system-core)
		R2Enabled:           os.Getenv("AWS_ACCESS_KEY_ID") != "" || os.Getenv("SHARED_AWS_ACCESS_ID") != "",
		R2TransientEndpoint: getEnv("R2_TRANSIENT_ACCOUNT", "https://a223539ccf6caa2d76459c9727d276e6.r2.cloudflarestorage.com"),
		R2TransientBucket:   getEnv("R2_TRANSIENT_BUCKET", "horde-transient"),
		R2PermanentBucket:   getEnv("R2_PERMANENT_BUCKET", "horde-permanent"),
		R2AccessKeyID:       os.Getenv("AWS_ACCESS_KEY_ID"),
		R2AccessKeySecret:   os.Getenv("AWS_SECRET_ACCESS_KEY"),
		R2SharedAccessKeyID: os.Getenv("SHARED_AWS_ACCESS_ID"),
		R2SharedAccessKey:   os.Getenv("SHARED_AWS_ACCESS_KEY"),

		// PostgreSQL configuration
		PostgresEnabled: getEnv("POSTGRES_ENABLED", "true") == "true",
		PostgresConnStr: os.Getenv("POSTGRES_CONN_STR"), // Required - no default for security

		// Let Core select an online text model for prompt enhancement unless an
		// operator deliberately pins one.
		AIModel: getEnv("AI_MODEL", "auto"),

		// Worker targeting
		TargetWorkerID: os.Getenv("TARGET_WORKER_ID"),

		// Google OAuth (use NEXT_PUBLIC_ version so only one env var needed)
		GoogleClientID: getEnv("GOOGLE_CLIENT_ID", os.Getenv("NEXT_PUBLIC_GOOGLE_CLIENT_ID")),

		// Auth cookie
		AuthCookieDomain: os.Getenv("AUTH_COOKIE_DOMAIN"),
		AuthCookieSecure: getEnv("AUTH_COOKIE_SECURE", "false") == "true",
	}
}

func getEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func defaultStylesConfigPath() string {
	for _, candidate := range []string{"config/styles.json", "../config/styles.json"} {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return "config/styles.json"
}

func splitAndClean(raw string) []string {
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
