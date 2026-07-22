package app

import (
	"strings"
	"testing"
)

func validDirectorRequest() CreateJobRequest {
	return CreateJobRequest{
		ModelID:        "LTX Director 2.0",
		Prompt:         "camera glides forward",
		TimelineData:   `{"segments":[]}`,
		LocalPrompts:   "camera glides forward",
		SegmentLengths: "72",
		GuideStrength:  "1.00",
	}
}

func TestDirectorRequestValidation(t *testing.T) {
	t.Run("accepts bounded valid timeline", func(t *testing.T) {
		if err := validDirectorRequest().Validate(); err != nil {
			t.Fatalf("valid Director request rejected: %v", err)
		}
	})

	t.Run("rejects malformed timeline JSON", func(t *testing.T) {
		req := validDirectorRequest()
		req.TimelineData = `{"segments":`
		if err := req.Validate(); err == nil {
			t.Fatal("expected malformed timeline to be rejected")
		}
	})

	t.Run("rejects oversized timeline", func(t *testing.T) {
		req := validDirectorRequest()
		req.TimelineData = strings.Repeat("x", maxTimelineDataLen+1)
		if err := req.Validate(); err == nil {
			t.Fatal("expected oversized timeline to be rejected")
		}
	})

	t.Run("rejects oversized relay", func(t *testing.T) {
		req := validDirectorRequest()
		req.LocalPrompts = strings.Repeat("x", maxRelayStringLen+1)
		if err := req.Validate(); err == nil {
			t.Fatal("expected oversized relay string to be rejected")
		}
	})
}
