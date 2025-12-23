package gallery

import (
	"encoding/json"
	"os"
	"strings"
	"sync"
	"time"
)

// GalleryItem represents a generation (can be public or private)
type GalleryItem struct {
	JobID          string `json:"jobId"`
	ModelID        string `json:"modelId"`
	ModelName      string `json:"modelName"`
	Prompt         string `json:"prompt"`
	NegativePrompt string `json:"negativePrompt,omitempty"`
	Type           string `json:"type"` // "image" or "video"
	IsNSFW         bool   `json:"isNsfw"`
	IsPublic       bool   `json:"isPublic"`
	WalletAddress  string `json:"walletAddress,omitempty"`
	CreatedAt      int64  `json:"createdAt"`
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

// List returns public gallery items, optionally filtered by type
func (s *Store) List(typeFilter string, limit int) []GalleryItem {
	s.mu.RLock()
	defer s.mu.RUnlock()
	
	if limit <= 0 {
		limit = len(s.items)
	}
	
	result := make([]GalleryItem, 0, limit)
	for _, item := range s.items {
		// Only include public items in the gallery listing
		if !item.IsPublic {
			continue
		}
		
		// Apply type filter
		if typeFilter != "" && typeFilter != "all" && item.Type != typeFilter {
			continue
		}
		
		result = append(result, item)
		if len(result) >= limit {
			break
		}
	}
	
	return result
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

