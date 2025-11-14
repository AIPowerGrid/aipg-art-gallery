package main

import (
	"log"
	"net/http"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/app"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/config"
)

func main() {
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
