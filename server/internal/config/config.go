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
	AllowedOrigins   []string
	GalleryStorePath string

	// ModelVault blockchain configuration
	ModelVaultEnabled         bool
	ModelVaultRPCURL          string
	ModelVaultContractAddress string

	// R2 storage configuration for direct media access
	// Uses same env vars as system-core for consistency
	R2Enabled            bool
	R2TransientEndpoint  string
	R2TransientBucket    string
	R2PermanentBucket    string
	R2AccessKeyID        string
	R2AccessKeySecret    string
	R2SharedAccessKeyID  string
	R2SharedAccessKey    string
}

func Load() Config {
	return Config{
		Address:          getEnv("GALLERY_SERVER_ADDR", ":4000"),
		APIBaseURL:       getEnv("AIPG_API_URL", "https://api.aipowergrid.io/api/v2"),
		ClientAgent:      getEnv("AIPG_CLIENT_AGENT", "AIPG-Art-Gallery:v2"),
		DefaultAPIKey:    os.Getenv("AIPG_API_KEY"),
		ModelPresetPath:  getEnv("MODEL_PRESETS_PATH", "./server/config/model_presets.json"),
		AllowedOrigins:   splitAndClean(os.Getenv("GALLERY_ALLOWED_ORIGINS")),
		GalleryStorePath: getEnv("GALLERY_STORE_PATH", "./data/gallery.json"),

		// ModelVault blockchain configuration (enabled by default)
		ModelVaultEnabled:         getEnv("MODELVAULT_ENABLED", "true") == "true",
		ModelVaultRPCURL:          getEnv("MODELVAULT_RPC_URL", "https://mainnet.base.org"),
		ModelVaultContractAddress: getEnv("MODELVAULT_CONTRACT", "0x79F39f2a0eA476f53994812e6a8f3C8CFe08c609"),

		// R2 storage configuration (uses same env vars as system-core)
		R2Enabled:            os.Getenv("AWS_ACCESS_KEY_ID") != "" || os.Getenv("SHARED_AWS_ACCESS_ID") != "",
		R2TransientEndpoint:  getEnv("R2_TRANSIENT_ACCOUNT", "https://a223539ccf6caa2d76459c9727d276e6.r2.cloudflarestorage.com"),
		R2TransientBucket:    getEnv("R2_TRANSIENT_BUCKET", "horde-transient"),
		R2PermanentBucket:    getEnv("R2_PERMANENT_BUCKET", "horde-permanent"),
		R2AccessKeyID:        os.Getenv("AWS_ACCESS_KEY_ID"),
		R2AccessKeySecret:    os.Getenv("AWS_SECRET_ACCESS_KEY"),
		R2SharedAccessKeyID:  os.Getenv("SHARED_AWS_ACCESS_ID"),
		R2SharedAccessKey:    os.Getenv("SHARED_AWS_ACCESS_KEY"),
	}
}

func getEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
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
