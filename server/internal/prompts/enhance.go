package prompts

import (
	"strings"
)

const MaxPromptLength = 512

// ModelCategory represents the type of model for prompt optimization
type ModelCategory int

const (
	CategoryFluxImage ModelCategory = iota
	CategorySDXLImage
	CategoryWANVideo
	CategoryLTXVideo
	CategoryGeneric
)

// DetectCategory determines the model category from model ID
func DetectCategory(modelID string) ModelCategory {
	lower := strings.ToLower(modelID)
	
	switch {
	case strings.Contains(lower, "flux"):
		return CategoryFluxImage
	case strings.Contains(lower, "sdxl") || strings.Contains(lower, "stable-diffusion-xl"):
		return CategorySDXLImage
	case strings.Contains(lower, "wan"):
		return CategoryWANVideo
	case strings.Contains(lower, "ltxv") || strings.Contains(lower, "ltx"):
		return CategoryLTXVideo
	default:
		return CategoryGeneric
	}
}

// DefaultNegativePrompt returns a model-appropriate negative prompt
func DefaultNegativePrompt(category ModelCategory) string {
	switch category {
	case CategoryFluxImage:
		return "blurry, low quality, distorted, deformed, ugly, bad anatomy, watermark, signature, text"
	case CategorySDXLImage:
		return "blurry, low quality, distorted, deformed, ugly, bad anatomy, bad hands, watermark, signature, text, cropped"
	case CategoryWANVideo:
		return "static, frozen, blurry, low quality, distorted, jittery, flickering, watermark"
	case CategoryLTXVideo:
		return "static, blurry, low quality, distorted, artifacts, flickering, watermark, text"
	default:
		return "blurry, low quality, distorted, watermark"
	}
}

// EnhancePrompt rewrites the prompt to be more effective for the specific model
// while staying within the character limit
func EnhancePrompt(prompt string, category ModelCategory) string {
	prompt = strings.TrimSpace(prompt)
	if prompt == "" {
		return prompt
	}
	
	// If already at or over limit, truncate intelligently
	if len(prompt) >= MaxPromptLength {
		return truncatePrompt(prompt, MaxPromptLength)
	}
	
	// Get enhancement prefix/suffix based on model
	prefix, suffix := getEnhancements(category)
	
	// Calculate available space
	prefixLen := len(prefix)
	suffixLen := len(suffix)
	available := MaxPromptLength - prefixLen - suffixLen - 2 // -2 for separators
	
	// If user prompt fits with enhancements
	if len(prompt) <= available {
		enhanced := prompt
		if prefix != "" {
			enhanced = prefix + " " + enhanced
		}
		if suffix != "" {
			enhanced = enhanced + ", " + suffix
		}
		return truncatePrompt(enhanced, MaxPromptLength)
	}
	
	// User prompt is too long for full enhancement - prioritize user content
	// Add only suffix (quality terms) if possible
	if suffixLen > 0 && len(prompt)+suffixLen+2 <= MaxPromptLength {
		return truncatePrompt(prompt+", "+suffix, MaxPromptLength)
	}
	
	// Just return truncated user prompt
	return truncatePrompt(prompt, MaxPromptLength)
}

func getEnhancements(category ModelCategory) (prefix, suffix string) {
	switch category {
	case CategoryFluxImage:
		// Flux responds well to descriptive, cinematic language
		prefix = ""
		suffix = "high quality, detailed, sharp focus"
	case CategorySDXLImage:
		// SDXL benefits from quality tags
		prefix = ""
		suffix = "masterpiece, best quality, highly detailed"
	case CategoryWANVideo:
		// WAN needs motion descriptions
		prefix = ""
		suffix = "smooth motion, cinematic, high quality video"
	case CategoryLTXVideo:
		// LTX video enhancements
		prefix = ""
		suffix = "smooth motion, high quality, detailed"
	default:
		prefix = ""
		suffix = "high quality"
	}
	return
}

// truncatePrompt intelligently truncates a prompt at word boundaries
func truncatePrompt(prompt string, maxLen int) string {
	if len(prompt) <= maxLen {
		return prompt
	}
	
	// Find the last space before the limit
	truncated := prompt[:maxLen]
	lastSpace := strings.LastIndex(truncated, " ")
	
	if lastSpace > maxLen*2/3 { // Only truncate at word if we're not losing too much
		truncated = truncated[:lastSpace]
	}
	
	// Remove trailing punctuation/whitespace
	truncated = strings.TrimRight(truncated, " ,.")
	
	return truncated
}

// ProcessPrompts handles both positive and negative prompt processing
func ProcessPrompts(prompt, negativePrompt, modelID string) (string, string) {
	category := DetectCategory(modelID)
	
	// Enhance the positive prompt
	enhancedPrompt := EnhancePrompt(prompt, category)
	
	// Provide default negative prompt if empty
	finalNegative := strings.TrimSpace(negativePrompt)
	if finalNegative == "" {
		finalNegative = DefaultNegativePrompt(category)
	}
	
	// Ensure negative prompt is also within limits
	if len(finalNegative) > MaxPromptLength {
		finalNegative = truncatePrompt(finalNegative, MaxPromptLength)
	}
	
	return enhancedPrompt, finalNegative
}


