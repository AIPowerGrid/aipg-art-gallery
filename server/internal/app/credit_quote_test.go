package app

import (
	"testing"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/models"
)

func TestBuildCreditQuoteRequestMatchesGenerationDefaults(t *testing.T) {
	t.Run("image batch", func(t *testing.T) {
		preset := models.ModelPreset{
			ID:   "Krea 2 Turbo",
			Type: "image",
		}
		quote := buildCreditQuoteRequest(
			CreateJobRequest{
				ModelID: "Krea 2 Turbo",
				Params:  GenerationParams{N: 4},
			},
			preset,
		)
		if quote.Model != "Krea 2 Turbo" || quote.Modality != "image" || quote.N != 4 {
			t.Fatalf("unexpected quote: %+v", quote)
		}
	})

	t.Run("video duration defaults", func(t *testing.T) {
		preset := models.ModelPreset{
			ID:   "LTX-2.3",
			Type: "video",
			Defaults: models.ModelDefaults{
				Length: 96,
				FPS:    24,
			},
		}
		quote := buildCreditQuoteRequest(
			CreateJobRequest{ModelID: "LTX-2.3", MediaType: "video"},
			preset,
		)
		if quote.Model != "LTX-2.3" || quote.Modality != "video" || quote.Seconds != 4 {
			t.Fatalf("unexpected quote: %+v", quote)
		}
	})
}
