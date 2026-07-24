package aipg

import (
	"testing"
	"time"
)

func TestMediaClientTimeoutMatchesPublishedCeiling(t *testing.T) {
	client := NewClient("https://grid.example/v1", "gallery-test")

	if MediaGenerationTimeout <= 10*time.Minute {
		t.Fatalf("media timeout must exceed Core's 10-minute ceiling: %s", MediaGenerationTimeout)
	}
	if client.mediaClient.Timeout != MediaGenerationTimeout {
		t.Fatalf("media client timeout = %s, want %s", client.mediaClient.Timeout, MediaGenerationTimeout)
	}
}
