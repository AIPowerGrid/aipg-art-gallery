package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/app"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/config"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file from project root (one level up from server directory)
	// Try multiple locations to handle different run contexts
	envPaths := []string{
		"../.env",           // From server/cmd/api directory
		"../../.env",        // From server directory
		".env",              // Current directory
	}
	
	// Also try relative to executable location
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		envPaths = append(envPaths, 
			filepath.Join(exeDir, ".env"),
			filepath.Join(exeDir, "../.env"),
			filepath.Join(exeDir, "../../.env"),
		)
	}
	
	// Try to load .env from any of these locations (ignore errors if file doesn't exist)
	for _, envPath := range envPaths {
		if err := godotenv.Load(envPath); err == nil {
			log.Printf("Loaded environment variables from %s", envPath)
			break
		}
	}

	cfg := config.Load()
	appInstance, err := app.New(cfg)
	if err != nil {
		log.Fatalf("failed to initialise app: %v", err)
	}

	log.Printf("AIPG gallery API listening on %s", cfg.Address)
	if err := http.ListenAndServe(cfg.Address, appInstance.Router()); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}
