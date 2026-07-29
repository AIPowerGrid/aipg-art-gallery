package app

import (
	"testing"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
)

func TestBuildJobViewPreservesCoreJobID(t *testing.T) {
	genTime := 2.5
	view := buildJobView("gallery-job", pendingJob{
		Status: "completed",
		Kind:   "image",
		Items: []aipg.GeneratedItem{
			{URL: "https://images.aipg.art/output.webp"},
		},
		Grid: &aipg.GridMeta{
			JobID:   "00000000-0000-4000-8000-000000000001",
			Worker:  "worker-a",
			GenTime: &genTime,
			Model:   "Krea 2 Turbo",
		},
	})

	if view.JobID != "gallery-job" {
		t.Fatalf("gallery job id changed: %q", view.JobID)
	}
	if view.GridJobID != "00000000-0000-4000-8000-000000000001" {
		t.Fatalf("Core job id was not preserved: %q", view.GridJobID)
	}
}

func TestVerifiedGridJobIDRequiresCompletedOwnerMatchedJob(t *testing.T) {
	store := newPendingStore(time.Minute)
	jobID := store.create("image", "prompt", "google:owner")
	store.complete(jobID, nil, &aipg.GridMeta{JobID: "core-job"})

	if got := verifiedGridMeta(store, jobID, "google:owner"); got == nil || got.JobID != "core-job" {
		t.Fatalf("expected server-observed provenance, got %#v", got)
	}
	if got := verifiedGridMeta(store, jobID, "google:attacker"); got != nil {
		t.Fatalf("foreign owner received provenance %#v", got)
	}
}
