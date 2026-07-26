package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/models"
)

// writeCatalog writes a presets file and loads it, so the test exercises the
// same LoadCatalog path production uses.
func loadTestCatalog(t *testing.T, presetsJSON string) models.Catalog {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "presets.json")
	if err := os.WriteFile(path, []byte(presetsJSON), 0o600); err != nil {
		t.Fatal(err)
	}
	cat, err := models.LoadCatalog(path)
	if err != nil {
		t.Fatal(err)
	}
	return cat
}

func TestMergeStylesWithCatalog(t *testing.T) {
	// Catalog intentionally omits a cfgScale band to prove styles.json's own cap
	// survives the overlay.
	catalog := loadTestCatalog(t, `[
	  {
	    "id": "LTX-2.3", "type": "video",
	    "capabilities": ["txt2video", "img2video"],
	    "defaults": {"width":768,"height":512,"steps":12,"cfgScale":3,"length":96,"fps":24},
	    "limits": {
	      "width":{"min":512,"max":1280,"step":64},
	      "height":{"min":512,"max":1280,"step":64},
	      "steps":{"min":4,"max":20,"step":1},
	      "length":{"min":24,"max":192,"step":24}
	    }
	  }
	]`)

	// styles.json with a divergent LTX-2.3 (wrong fps/steps) and a model that has
	// no preset (must be left untouched).
	styles := `{
	  "dimensions": [{"id":3,"width":1024,"height":1024,"label":"Square","aspectRatio":"1:1"}],
	  "models": [
	    {
	      "id": "LTX-2.3", "name": "LTX-2.3 Video", "type": "video", "enabled": true,
	      "settings": {"steps":99,"cfgScale":9,"sampler":"euler","fps":30},
	      "limits": {"steps":{"min":99,"max":99}, "cfgScale":{"min":1,"max":3}}
	    },
	    {
	      "id": "klein-no-preset", "name": "Klein", "type": "image", "enabled": true,
	      "settings": {"steps":4,"sampler":"euler"},
	      "limits": {"steps":{"min":4,"max":6}}
	    }
	  ]
	}`

	out, err := mergeStylesWithCatalog([]byte(styles), catalog)
	if err != nil {
		t.Fatalf("merge: %v", err)
	}

	var doc struct {
		Dimensions []map[string]any `json:"dimensions"`
		Models     []struct {
			ID           string         `json:"id"`
			Name         string         `json:"name"`
			Enabled      bool           `json:"enabled"`
			Capabilities []string       `json:"capabilities"`
			Settings     map[string]any `json:"settings"`
			Limits       map[string]any `json:"limits"`
		} `json:"models"`
	}
	if err := json.Unmarshal(out, &doc); err != nil {
		t.Fatalf("unmarshal merged: %v", err)
	}

	if len(doc.Dimensions) != 1 {
		t.Fatalf("dimensions dropped by merge: %+v", doc.Dimensions)
	}
	if len(doc.Models) != 2 {
		t.Fatalf("expected 2 models, got %d", len(doc.Models))
	}

	ltx := doc.Models[0]
	// Presentation preserved.
	if ltx.Name != "LTX-2.3 Video" || !ltx.Enabled {
		t.Errorf("presentation fields not preserved: %+v", ltx)
	}
	if len(ltx.Capabilities) != 2 || ltx.Capabilities[1] != "img2video" {
		t.Errorf("capabilities should come from preset, got %v", ltx.Capabilities)
	}
	// Grid-safe sampler preserved (not overwritten by the preset).
	if ltx.Settings["sampler"] != "euler" {
		t.Errorf("sampler should stay euler, got %v", ltx.Settings["sampler"])
	}
	// Recipe wins for numeric defaults + limits.
	if got := ltx.Settings["fps"].(float64); got != 24 {
		t.Errorf("fps should come from preset (24), got %v", got)
	}
	if got := ltx.Settings["steps"].(float64); got != 12 {
		t.Errorf("steps default should be 12 (preset), got %v", got)
	}
	steps := ltx.Limits["steps"].(map[string]any)
	if steps["min"].(float64) != 4 || steps["max"].(float64) != 20 {
		t.Errorf("steps limit should be preset 4-20, got %v", steps)
	}
	// cfg cap came from styles.json (catalog omitted it) — must be preserved.
	cfg := ltx.Limits["cfgScale"].(map[string]any)
	if cfg["max"].(float64) != 3 {
		t.Errorf("styles.json cfg cap (max 3) should survive when the catalog omits it, got %v", cfg)
	}
	if _, ok := ltx.Limits["length"]; !ok {
		t.Errorf("length limit should be injected from preset, got %v", ltx.Limits)
	}
	if _, ok := ltx.Limits["width"]; !ok {
		t.Errorf("width limit should be injected from preset, got %v", ltx.Limits)
	}

	// No-preset model is untouched (styles.json fallback).
	klein := doc.Models[1]
	kSteps := klein.Limits["steps"].(map[string]any)
	if kSteps["max"].(float64) != 6 {
		t.Errorf("no-preset model should keep styles.json limits (max 6), got %v", kSteps)
	}
}

// Runs the merge against the actual repo config so the create page's served
// output stays honest to the real presets (guards against the two files drifting
// apart the way they had). Paths are relative to server/internal/app/.
func TestMergeStylesWithRealConfig(t *testing.T) {
	styles, err := os.ReadFile(filepath.Join("..", "..", "..", "config", "styles.json"))
	if err != nil {
		t.Skipf("repo styles.json unavailable: %v", err)
	}
	catalog, err := models.LoadCatalog(filepath.Join("..", "..", "config", "model_presets.json"))
	if err != nil {
		t.Skipf("server catalog unavailable: %v", err)
	}

	out, err := mergeStylesWithCatalog(styles, catalog)
	if err != nil {
		t.Fatalf("merge real config: %v", err)
	}

	var doc struct {
		Models []struct {
			ID       string         `json:"id"`
			Type     string         `json:"type"`
			Enabled  bool           `json:"enabled"`
			Settings map[string]any `json:"settings"`
			Limits   map[string]any `json:"limits"`
		} `json:"models"`
	}
	if err := json.Unmarshal(out, &doc); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, m := range doc.Models {
		if m.ID == "LTX-2.3" {
			// The preset (server/config) drives this — must gain real video bands.
			for _, k := range []string{"width", "height", "length"} {
				if _, ok := m.Limits[k]; !ok {
					t.Errorf("LTX-2.3 should get %s limit from the catalog, limits=%v", k, m.Limits)
				}
			}
			if m.Settings["sampler"] != "euler" {
				t.Errorf("LTX-2.3 sampler must stay grid-safe 'euler', got %v", m.Settings["sampler"])
			}
		}
	}
}

func TestBuildModelViewPrefersCoreCapabilities(t *testing.T) {
	preset := models.ModelPreset{
		ID:           "z-image-turbo",
		Type:         "image",
		Capabilities: []string{"txt2img"},
	}
	status := aipg.ModelStatus{
		Capabilities: []string{"txt2img", "img2img"},
	}

	view := buildModelView(preset, status, nil)
	if len(view.Capabilities) != 2 || view.Capabilities[1] != "img2img" {
		t.Fatalf("expected Core capabilities to replace preset fallback, got %v", view.Capabilities)
	}
}
