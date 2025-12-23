package prompts

import (
	"testing"
)

func TestDetectCategory(t *testing.T) {
	tests := []struct {
		modelID  string
		expected ModelCategory
	}{
		{"Flux_Dev", CategoryFluxImage},
		{"flux_schnell", CategoryFluxImage},
		{"SDXL_1.0", CategorySDXLImage},
		{"stable-diffusion-xl", CategorySDXLImage},
		{"WAN_2.2_T2V_14B", CategoryWANVideo},
		{"wan_21_fun", CategoryWANVideo},
		{"ltxv_13b", CategoryLTXVideo},
		{"ltx_video", CategoryLTXVideo},
		{"unknown_model", CategoryGeneric},
	}

	for _, tc := range tests {
		t.Run(tc.modelID, func(t *testing.T) {
			got := DetectCategory(tc.modelID)
			if got != tc.expected {
				t.Errorf("DetectCategory(%q) = %v, want %v", tc.modelID, got, tc.expected)
			}
		})
	}
}

func TestEnhancePrompt(t *testing.T) {
	tests := []struct {
		name     string
		prompt   string
		category ModelCategory
		maxLen   int
	}{
		{
			name:     "short flux prompt gets enhanced",
			prompt:   "A beautiful sunset over mountains",
			category: CategoryFluxImage,
			maxLen:   MaxPromptLength,
		},
		{
			name:     "long prompt truncated",
			prompt:   string(make([]byte, 600)), // 600 char prompt (over 512 limit)
			category: CategoryFluxImage,
			maxLen:   MaxPromptLength,
		},
		{
			name:     "video prompt enhanced",
			prompt:   "A dog running through a field",
			category: CategoryWANVideo,
			maxLen:   MaxPromptLength,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := EnhancePrompt(tc.prompt, tc.category)
			if len(result) > tc.maxLen {
				t.Errorf("EnhancePrompt() length = %d, want <= %d", len(result), tc.maxLen)
			}
		})
	}
}

func TestProcessPrompts(t *testing.T) {
	// Test with no negative prompt - should get default
	enhanced, negative := ProcessPrompts("A cat sitting", "", "flux_dev")
	if negative == "" {
		t.Error("Expected default negative prompt, got empty")
	}
	if len(enhanced) > MaxPromptLength {
		t.Errorf("Enhanced prompt too long: %d", len(enhanced))
	}
	if len(negative) > MaxPromptLength {
		t.Errorf("Negative prompt too long: %d", len(negative))
	}

	// Test with provided negative prompt - should keep it
	_, negative2 := ProcessPrompts("A cat", "blurry", "flux_dev")
	if negative2 != "blurry" {
		t.Errorf("Expected 'blurry', got %q", negative2)
	}
}

func TestDefaultNegativePrompts(t *testing.T) {
	categories := []ModelCategory{
		CategoryFluxImage,
		CategorySDXLImage,
		CategoryWANVideo,
		CategoryLTXVideo,
		CategoryGeneric,
	}

	for _, cat := range categories {
		neg := DefaultNegativePrompt(cat)
		if neg == "" {
			t.Errorf("DefaultNegativePrompt(%v) returned empty", cat)
		}
		if len(neg) > MaxPromptLength {
			t.Errorf("DefaultNegativePrompt(%v) too long: %d", cat, len(neg))
		}
	}
}


