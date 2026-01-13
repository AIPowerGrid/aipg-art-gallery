package gallery

import (
	"encoding/json"
	"os"
	"strings"
	"sync"
	"time"
)

// JobParams represents the parameters used to create a generation
type JobParams struct {
	Width      *int     `json:"width,omitempty"`
	Height     *int     `json:"height,omitempty"`
	Steps      *int     `json:"steps,omitempty"`
	CfgScale   *float64 `json:"cfgScale,omitempty"`
	Sampler    *string  `json:"sampler,omitempty"`
	Scheduler  *string  `json:"scheduler,omitempty"`
	Seed       *string  `json:"seed,omitempty"`
	Denoise    *float64 `json:"denoise,omitempty"`
	Length     *int     `json:"length,omitempty"`
	Fps        *int     `json:"fps,omitempty"`
	Tiling     *bool    `json:"tiling,omitempty"`
	HiresFix   *bool    `json:"hiresFix,omitempty"`
}

// GalleryItem represents a generation (can be public or private)
type GalleryItem struct {
	JobID          string   `json:"jobId"`
	ModelID        string   `json:"modelId"`
	ModelName      string   `json:"modelName"`
	Prompt         string   `json:"prompt"`
	NegativePrompt string   `json:"negativePrompt,omitempty"`
	Type           string   `json:"type"` // "image" or "video"
	IsNSFW         bool     `json:"isNsfw"`
	IsPublic       bool     `json:"isPublic"`
	WalletAddress  string   `json:"walletAddress,omitempty"`
	CreatedAt      int64    `json:"createdAt"`
	// GenerationIDs are the R2 object keys for the generated media
	// Format: {procgen_id}.webp for images, {procgen_id}.mp4 for videos
	GenerationIDs  []string `json:"generationIds,omitempty"`
	// MediaURLs are the cached R2 URLs (may be expired)
	MediaURLs      []string `json:"mediaUrls,omitempty"`
	// Parameters used to create this generation
	Params         *JobParams `json:"params,omitempty"`
}

// Store manages the public gallery
type Store struct {
	mu       sync.RWMutex
	items    []GalleryItem
	filePath string
	maxItems int
}

// NewStore creates a new gallery store
func NewStore(filePath string, maxItems int) *Store {
	s := &Store{
		items:    make([]GalleryItem, 0),
		filePath: filePath,
		maxItems: maxItems,
	}
	
	// Load existing data
	s.load()
	
	return s
}

// Add adds a new item to the gallery
func (s *Store) Add(item GalleryItem) {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	// Check for duplicate
	for _, existing := range s.items {
		if existing.JobID == item.JobID {
			return // Already exists
		}
	}
	
	// Add timestamp if not set
	if item.CreatedAt == 0 {
		item.CreatedAt = time.Now().UnixMilli()
	}
	
	// Prepend (newest first)
	s.items = append([]GalleryItem{item}, s.items...)
	
	// Trim to max
	if len(s.items) > s.maxItems {
		s.items = s.items[:s.maxItems]
	}
	
	// Persist
	s.save()
}

// ListResult contains paginated gallery items
type ListResult struct {
	Items      []GalleryItem `json:"items"`
	Total      int           `json:"total"`
	HasMore    bool          `json:"hasMore"`
	NextOffset int           `json:"nextOffset"`
}

// List returns public gallery items, optionally filtered by type and search, with pagination
func (s *Store) List(typeFilter string, limit int, offset int, searchQuery string) ListResult {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	if limit <= 0 {
		limit = 25
	}
	if offset < 0 {
		offset = 0
	}
	
	searchLower := strings.ToLower(searchQuery)
	
	// First, collect all matching items to get total count
	allMatching := make([]GalleryItem, 0)
	for _, item := range s.items {
		// Only include public items in the gallery listing
		if !item.IsPublic {
			continue
		}
		
		// Apply type filter
		if typeFilter != "" && typeFilter != "all" && item.Type != typeFilter {
			continue
		}
		
		// Apply search filter
		if searchQuery != "" && !strings.Contains(strings.ToLower(item.Prompt), searchLower) {
			continue
		}
		
		allMatching = append(allMatching, item)
	}
	
	total := len(allMatching)
	
	// Apply offset
	if offset >= total {
		return ListResult{
			Items:      []GalleryItem{},
			Total:      total,
			HasMore:    false,
			NextOffset: offset,
		}
	}
	
	// Get the page of items
	end := offset + limit
	if end > total {
		end = total
	}
	
	result := allMatching[offset:end]
	
	return ListResult{
		Items:      result,
		Total:      total,
		HasMore:    end < total,
		NextOffset: end,
	}
}

// ListByWallet returns all items for a specific wallet address
func (s *Store) ListByWallet(walletAddress string, limit int) []GalleryItem {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	if walletAddress == "" {
		return []GalleryItem{}
	}
	
	// Normalize wallet address (lowercase)
	walletAddress = strings.ToLower(walletAddress)
	
	if limit <= 0 {
		limit = len(s.items)
	}
	
	result := make([]GalleryItem, 0, limit)
	for _, item := range s.items {
		if strings.ToLower(item.WalletAddress) == walletAddress {
			result = append(result, item)
			if len(result) >= limit {
				break
			}
		}
	}
	
	return result
}

// Remove removes an item by job ID (for moderation)
func (s *Store) Remove(jobID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	for i, item := range s.items {
		if item.JobID == jobID {
			s.items = append(s.items[:i], s.items[i+1:]...)
			s.save()
			return true
		}
	}
	
	return false
}

// Delete removes an item by job ID (implements GalleryStore interface)
func (s *Store) Delete(jobID string) error {
	if s.Remove(jobID) {
		return nil
	}
	return nil // Item not found is not an error
}

// Get returns a single item by job ID
func (s *Store) Get(jobID string) *GalleryItem {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	for i := range s.items {
		if s.items[i].JobID == jobID {
			item := s.items[i] // Copy to avoid returning reference
			return &item
		}
	}
	return nil
}

// UpdateGenerations updates the generation IDs and media URLs for an item
func (s *Store) UpdateGenerations(jobID string, generationIDs []string, mediaURLs []string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	for i := range s.items {
		if s.items[i].JobID == jobID {
			s.items[i].GenerationIDs = generationIDs
			s.items[i].MediaURLs = mediaURLs
			s.save()
			return true
		}
	}
	return false
}

func (s *Store) load() {
	if s.filePath == "" {
		return
	}
	
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return // File doesn't exist yet
	}
	
	var items []GalleryItem
	if err := json.Unmarshal(data, &items); err != nil {
		return
	}
	
	s.items = items
}

func (s *Store) save() {
	if s.filePath == "" {
		return
	}
	
	data, err := json.MarshalIndent(s.items, "", "  ")
	if err != nil {
		return
	}
	
	os.WriteFile(s.filePath, data, 0644)
}

