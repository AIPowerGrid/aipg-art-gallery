package models

import (
	"encoding/json"
	"fmt"
	"os"
)

type RangeInt struct {
	Min  int `json:"min"`
	Max  int `json:"max"`
	Step int `json:"step"`
}

type RangeFloat struct {
	Min  float64 `json:"min"`
	Max  float64 `json:"max"`
	Step float64 `json:"step"`
}

type ModelLimits struct {
	Width    *RangeInt   `json:"width,omitempty"`
	Height   *RangeInt   `json:"height,omitempty"`
	Steps    *RangeInt   `json:"steps,omitempty"`
	CfgScale *RangeFloat `json:"cfgScale,omitempty"`
	Length   *RangeInt   `json:"length,omitempty"`
	FPS      *RangeInt   `json:"fps,omitempty"`
}

type ModelDefaults struct {
	Width     int     `json:"width,omitempty"`
	Height    int     `json:"height,omitempty"`
	Steps     int     `json:"steps,omitempty"`
	CfgScale  float64 `json:"cfgScale,omitempty"`
	Sampler   string  `json:"sampler,omitempty"`
	Scheduler string  `json:"scheduler,omitempty"`
	Denoise   float64 `json:"denoise,omitempty"`
	Length    int     `json:"length,omitempty"`
	FPS       int     `json:"fps,omitempty"`
	Tiling    bool    `json:"tiling,omitempty"`
	HiresFix  bool    `json:"hiresFix,omitempty"`
}

type ModelPreset struct {
	ID           string        `json:"id"`
	DisplayName  string        `json:"displayName"`
	Type         string        `json:"type"`
	Description  string        `json:"description"`
	Tags         []string      `json:"tags"`
	Samplers     []string      `json:"samplers"`
	Schedulers   []string      `json:"schedulers"`
	Capabilities []string      `json:"capabilities"`
	Defaults     ModelDefaults `json:"defaults"`
	Limits       ModelLimits   `json:"limits"`
}

type Catalog struct {
	items map[string]ModelPreset
}

func LoadCatalog(path string) (Catalog, error) {
	file, err := os.ReadFile(path)
	if err != nil {
		return Catalog{}, fmt.Errorf("read presets: %w", err)
	}

	var presets []ModelPreset
	if err := json.Unmarshal(file, &presets); err != nil {
		return Catalog{}, fmt.Errorf("decode presets: %w", err)
	}

	items := make(map[string]ModelPreset, len(presets))
	for _, p := range presets {
		if p.ID == "" {
			continue
		}
		items[p.ID] = p
	}

	return Catalog{items: items}, nil
}

func (c Catalog) Get(id string) (ModelPreset, bool) {
	v, ok := c.items[id]
	return v, ok
}

func (c Catalog) List() []ModelPreset {
	out := make([]ModelPreset, 0, len(c.items))
	for _, v := range c.items {
		out = append(out, v)
	}
	return out
}
