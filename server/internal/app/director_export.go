package app

// TEMPORARY DEV DEBUG UTILITY — Director web → ComfyUI workflow export.
//
// Purpose: when DIRECTOR_EXPORT_DIR is set, every submission from the web
// Director tab is written to disk as a runnable ComfyUI API-format graph, so
// you can see EXACTLY what the timeline/prompt/settings translate into and open
// it in ComfyUI to debug output that isn't "as intended".
//
// This reproduces what the grid coordinator does before it hands the graph to
// the worker: load the recipe (`_grid.vars` maps a client input name → a dotted
// "<node>.inputs.<field>" path), inject each supplied value at its path, drop
// the `_grid` block, and run the resulting plain ComfyUI graph. We inject from
// the same `gen` (aipg.GenerateRequest) we send to the grid, so the values here
// are exactly the values the grid receives (post prompt-processing, size split,
// seconds derivation, relay strings, timeline blob).
//
// Faithfulness caveat: this mirrors grid-core's documented injection semantics
// against your LOCAL recipe file (DIRECTOR_RECIPE_PATH). It is faithful to that
// recipe; the authoritative injector lives in grid-core. Keep the local recipe
// in sync with the deployed one (or point DIRECTOR_RECIPE_PATH at the exact
// deployed file) if you want the export to match live-grid behaviour. When you
// edit the recipe to experiment, the export reflects your edits — run the
// exported graph in your own ComfyUI to see the effect.
//
// To remove this feature entirely: delete this file, the two Config fields in
// internal/config/config.go, and the exportDirectorWorkflow() call in
// handleCreateJob. Nothing else depends on it.

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
)

// directorModelName is the catalog + grid model name for the LTX Director
// timeline recipe. Kept here (not in app.go) so this whole feature is
// self-contained and deletable.
const directorModelName = "LTX Director 2.0"

// gridBlock is the subset of a recipe's `_grid` metadata we need to replay the
// coordinator's value injection.
type gridBlock struct {
	Name   string                     `json:"name"`
	Vars   map[string]json.RawMessage `json:"vars"`   // value is a path string OR []string
	Clamps map[string][]float64       `json:"clamps"` // [min, max] per client var
}

// exportDirectorWorkflow writes the injected ComfyUI graph + a debug sidecar for
// one Director submission. It is best-effort and fully error-swallowed: an
// export failure must never affect the real job. No-op unless configured and
// unless this is a Director-model job.
func (a *App) exportDirectorWorkflow(gen aipg.GenerateRequest, req CreateJobRequest, jobID string) {
	dir := a.cfg.DirectorExportDir
	if dir == "" {
		return
	}
	// Only the Director timeline recipe carries a timeline_data var; gate on the
	// model name so ordinary image/video jobs are never exported.
	if req.ModelID != directorModelName && gen.Model != directorModelName {
		return
	}

	recipeBytes, err := os.ReadFile(a.cfg.DirectorRecipePath)
	if err != nil {
		log.Printf("⚠️  director-export: cannot read recipe %s: %v", a.cfg.DirectorRecipePath, err)
		return
	}

	graph := map[string]json.RawMessage{}
	if err := json.Unmarshal(recipeBytes, &graph); err != nil {
		log.Printf("⚠️  director-export: recipe is not valid JSON: %v", err)
		return
	}

	var grid gridBlock
	if raw, ok := graph["_grid"]; ok {
		_ = json.Unmarshal(raw, &grid)
	}
	delete(graph, "_grid")

	// Re-parse the graph into a mutable node map we can inject into.
	nodes := map[string]map[string]any{}
	for id, raw := range graph {
		var node map[string]any
		if err := json.Unmarshal(raw, &node); err != nil {
			log.Printf("⚠️  director-export: node %s not an object: %v", id, err)
			return
		}
		nodes[id] = node
	}

	// The client-facing values, keyed by the recipe's var names. Only values the
	// backend actually sends get injected; anything left unset keeps the recipe's
	// baked default — exactly the grid's omitempty behaviour.
	values := directorVarValues(gen)

	injected := map[string]any{}
	var warnings []string

	for name, val := range values {
		pathRaw, ok := grid.Vars[name]
		if !ok {
			// Var not exposed by this recipe (e.g. recipe edited to drop it).
			continue
		}
		for _, path := range decodePaths(pathRaw) {
			if err := injectAtPath(nodes, path, val); err != nil {
				warnings = append(warnings, fmt.Sprintf("%s → %s: %v", name, path, err))
				continue
			}
		}
		injected[name] = val
		if w := clampWarning(name, val, grid.Clamps[name]); w != "" {
			warnings = append(warnings, w)
		}
	}

	// Reassemble the plain (no _grid) graph for ComfyUI.
	outGraph := map[string]any{}
	for id, node := range nodes {
		outGraph[id] = node
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		log.Printf("⚠️  director-export: cannot create %s: %v", dir, err)
		return
	}

	stamp := time.Now().Format("20060102_150405")
	base := fmt.Sprintf("%s_%s", stamp, shortID(jobID))

	workflowPath := filepath.Join(dir, base+".workflow.json")
	if err := writeJSONFile(workflowPath, outGraph); err != nil {
		log.Printf("⚠️  director-export: write workflow failed: %v", err)
		return
	}

	debug := map[string]any{
		"jobId":      jobID,
		"model":      gen.Model,
		"recipe":     grid.Name,
		"recipePath": a.cfg.DirectorRecipePath,
		"createdAt":  time.Now().Format(time.RFC3339),
		"webPayload": map[string]any{
			"prompt":         req.Prompt,
			"negativePrompt": req.NegativePrompt,
			"localPrompts":   req.LocalPrompts,
			"segmentLengths": req.SegmentLengths,
			"guideStrength":  req.GuideStrength,
			"params":         req.Params,
			"timelineBytes":  len(req.TimelineData),
		},
		// The values injected into the graph (post backend processing). timeline
		// is elided here (it's large + already in the graph) — see graph node 131.
		"injectedVars": redactTimeline(injected),
		"clampWarnings": warnings,
		"howToRun": "Open the .workflow.json in ComfyUI (Dev Mode → 'Load (API Format)') " +
			"or POST it to /prompt. It is the recipe graph with these vars injected.",
	}
	debugPath := filepath.Join(dir, base+".debug.json")
	if err := writeJSONFile(debugPath, debug); err != nil {
		log.Printf("⚠️  director-export: write debug failed: %v", err)
		// The workflow already wrote; not fatal.
	}

	log.Printf("🎬 director-export: wrote %s (%d vars injected, %d warnings)",
		workflowPath, len(injected), len(warnings))
}

// directorVarValues maps the grid request onto the recipe's client-facing var
// names with the correct JSON types (matching the widget types baked in the
// recipe). Only set fields are included, so unset ones keep recipe defaults.
func directorVarValues(gen aipg.GenerateRequest) map[string]any {
	v := map[string]any{}

	if gen.Prompt != "" {
		v["prompt"] = gen.Prompt
	}
	if gen.NegativePrompt != "" {
		v["negative_prompt"] = gen.NegativePrompt
	}
	if gen.Seed != "" {
		if n, err := strconv.ParseInt(gen.Seed, 10, 64); err == nil {
			v["seed"] = n
		}
	}
	if gen.Seconds > 0 {
		v["seconds"] = int(math.Round(gen.Seconds)) // 135.inputs.value is an INTConstant
	}
	if gen.Steps > 0 {
		v["steps"] = gen.Steps
	}
	if gen.CfgScale > 0 {
		v["cfg"] = gen.CfgScale
	}
	if w, h, ok := splitSize(gen.Size); ok {
		v["width"] = w
		v["height"] = h
	}
	if gen.LocalPrompts != "" {
		v["local_prompts"] = gen.LocalPrompts
	}
	if gen.SegmentLengths != "" {
		v["segment_lengths"] = gen.SegmentLengths
	}
	if gen.GuideStrength != "" {
		v["guide_strength"] = gen.GuideStrength
	}
	if gen.TimelineData != "" {
		v["timeline"] = gen.TimelineData
	}
	return v
}

// decodePaths handles a var whose target is a single path string or a list of
// paths (e.g. cfg → both CFGGuider nodes).
func decodePaths(raw json.RawMessage) []string {
	var one string
	if err := json.Unmarshal(raw, &one); err == nil {
		return []string{one}
	}
	var many []string
	if err := json.Unmarshal(raw, &many); err == nil {
		return many
	}
	return nil
}

// injectAtPath sets nodes[<id>].inputs.<field> = val for a "<id>.inputs.<field>"
// path, matching the coordinator's dotted-path injection.
func injectAtPath(nodes map[string]map[string]any, path string, val any) error {
	parts := strings.SplitN(path, ".", 3)
	if len(parts) != 3 || parts[1] != "inputs" {
		return fmt.Errorf("unexpected path shape %q", path)
	}
	node, ok := nodes[parts[0]]
	if !ok {
		return fmt.Errorf("no node %q", parts[0])
	}
	inputs, ok := node["inputs"].(map[string]any)
	if !ok {
		return fmt.Errorf("node %q has no inputs object", parts[0])
	}
	inputs[parts[2]] = val
	return nil
}

// clampWarning flags a value that grid-core's clamps would reject (422) or that
// sits at a known-bad edge — a common cause of "not as intended" output.
func clampWarning(name string, val any, clamp []float64) string {
	if len(clamp) != 2 {
		return ""
	}
	f, ok := toFloat(val)
	if !ok {
		return ""
	}
	if f < clamp[0] || f > clamp[1] {
		return fmt.Sprintf("%s=%v is OUTSIDE clamp [%v, %v] — the grid would 422 this", name, val, clamp[0], clamp[1])
	}
	if name == "cfg" && f > 1 {
		return "cfg>1 on a distilled model degrades output (recipe expects 1)"
	}
	return ""
}

func toFloat(val any) (float64, bool) {
	switch n := val.(type) {
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case float64:
		return n, true
	}
	return 0, false
}

func splitSize(size string) (int, int, bool) {
	if size == "" {
		return 0, 0, false
	}
	parts := strings.SplitN(strings.ToLower(size), "x", 2)
	if len(parts) != 2 {
		return 0, 0, false
	}
	w, err1 := strconv.Atoi(strings.TrimSpace(parts[0]))
	h, err2 := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	return w, h, true
}

// redactTimeline replaces the (large) timeline string with a length marker in
// the debug sidecar; the full value is already in the workflow graph.
func redactTimeline(in map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range in {
		if k == "timeline" {
			if s, ok := v.(string); ok {
				out[k] = fmt.Sprintf("<%d bytes — see node 131.inputs.timeline_data in the workflow>", len(s))
				continue
			}
		}
		out[k] = v
	}
	return out
}

func shortID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

func writeJSONFile(path string, v any) error {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o644)
}
