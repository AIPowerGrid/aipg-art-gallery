package config

import (
	"os"
	"strings"
)

type Config struct {
	Address         string
	APIBaseURL      string
	ClientAgent     string
	DefaultAPIKey   string
	ModelPresetPath string
	AllowedOrigins  []string

	// ModelVault blockchain configuration
	ModelVaultEnabled         bool
	ModelVaultRPCURL          string
	ModelVaultContractAddress string
}

func Load() Config {
	return Config{
		Address:         getEnv("GALLERY_SERVER_ADDR", ":4000"),
		APIBaseURL:      getEnv("AIPG_API_URL", "https://api.aipowergrid.io/api/v2"),
		ClientAgent:     getEnv("AIPG_CLIENT_AGENT", "AIPG-Art-Gallery:v2"),
		DefaultAPIKey:   os.Getenv("AIPG_API_KEY"),
		ModelPresetPath: getEnv("MODEL_PRESETS_PATH", "./server/config/model_presets.json"),
		AllowedOrigins:  splitAndClean(os.Getenv("GALLERY_ALLOWED_ORIGINS")),

		// ModelVault blockchain configuration (enabled by default)
		ModelVaultEnabled:         getEnv("MODELVAULT_ENABLED", "true") == "true",
		ModelVaultRPCURL:          getEnv("MODELVAULT_RPC_URL", "https://mainnet.base.org"),
		ModelVaultContractAddress: getEnv("MODELVAULT_CONTRACT", "0x79F39f2a0eA476f53994812e6a8f3C8CFe08c609"),
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
