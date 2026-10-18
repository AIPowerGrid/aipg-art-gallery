// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package aipg

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// VideoIntentHash commits the request before generated seeds or source uploads.
// It mirrors Core's aipg.video-intent.v1, not the resolved execution recipe.
// Core remains responsible for media decoding, recipe and admission validation.
func VideoIntentHash(request VideoJobRequest) (string, error) {
	invalid := errors.New("invalid durable video intent")
	if !videoText(request.Prompt, 8000, true) || !videoText(request.Model, 255, true) ||
		!videoText(request.NegativePrompt, 8000, false) || request.N != 1 ||
		request.Frames < 9 || request.Frames > MaxVideoFrames(request.Model) || request.Frames%8 != 1 || request.FPS != 24 ||
		request.MaxCostMicroUSD <= 0 || !videoText(request.Size, 32, false) ||
		!videoText(request.Worker, 255, false) || !videoText(request.Style, 128, false) ||
		len(request.Keyframes) > 16 || (request.Image != "" && len(request.Keyframes) != 0) {
		return "", invalid
	}
	if request.Seed != nil && (*request.Seed < 0 || *request.Seed > 1<<53-1) ||
		request.Steps != nil && (*request.Steps < 4 || *request.Steps > 40) {
		return "", invalid
	}
	intent := map[string]any{
		"prompt": request.Prompt, "model": request.Model, "n": request.N,
		"seconds": nil, "frames": request.Frames, "fps": request.FPS,
		"image": nil, "keyframes": []any{}, "loras": nil,
		"response_format": "url", "worker": nil, "style": nil, "progress_token": nil,
		"negative_prompt": request.NegativePrompt, "seed": request.Seed, "steps": request.Steps,
		"cfg_scale": nil, "sampler": "euler_ancestral_cfg_pp", "audio": request.Audio,
		"max_cost_micro_usd": request.MaxCostMicroUSD,
	}
	if request.Size != "" {
		intent["size"] = request.Size
	}
	if request.Worker != "" {
		intent["worker"] = request.Worker
	}
	if request.Style != "" {
		intent["style"] = request.Style
	}
	if request.CFGScale != nil {
		if !videoFloat(*request.CFGScale, 1, 5) {
			return "", invalid
		}
		intent["cfg_scale"] = pythonVideoFloat(*request.CFGScale)
	}
	for _, control := range []struct {
		name  string
		value *float64
	}{
		{"guide_strength", request.GuideStrength}, {"reference_strength", request.ReferenceStrength},
		{"reference_attention_strength", request.ReferenceAttentionStrength},
		{"motion_attention_strength", request.MotionAttentionStrength},
	} {
		if control.value != nil {
			if !videoFloat(*control.value, math.SmallestNonzeroFloat64, 1) {
				return "", invalid
			}
			intent[control.name] = pythonVideoFloat(*control.value)
		}
	}
	encodedImages, decodedImages := 0, 0
	imageCommitment := func(value string) (map[string]string, error) {
		encodedImages += len(value)
		if encodedImages > 32*1024*1024 {
			return nil, invalid
		}
		digest, length, err := videoSourceDigest(value, "", 12*1024*1024)
		decodedImages += length
		if err != nil || decodedImages > 24*1024*1024 {
			return nil, invalid
		}
		return map[string]string{"sha256": digest}, nil
	}
	if request.Image != "" {
		commitment, err := imageCommitment(request.Image)
		if err != nil {
			return "", invalid
		}
		intent["image"] = commitment
	}
	pins := make([]any, 0, len(request.Keyframes))
	for _, pin := range request.Keyframes {
		if pin.Frame < 0 || pin.Frame >= MaxVideoFrames(request.Model) || !videoFloat(pin.Strength, 0, 1) {
			return "", invalid
		}
		commitment, err := imageCommitment(pin.Image)
		if err != nil {
			return "", invalid
		}
		pins = append(pins, map[string]any{"image": commitment, "frame": pin.Frame,
			"strength": pythonVideoFloat(pin.Strength)})
	}
	intent["keyframes"] = pins
	for _, source := range []struct {
		name, mime, value string
		limit             int
	}{
		{"reference_audio", "audio/wav", request.ReferenceAudio, 12 * 1024 * 1024},
		{"reference_video", "video/mp4", request.ReferenceVideo, 32 * 1024 * 1024},
		{"reference_image", "image/png", request.ReferenceImage, 12 * 1024 * 1024},
	} {
		if source.value != "" {
			digest, _, err := videoSourceDigest(source.value, source.mime, source.limit)
			if err != nil {
				return "", invalid
			}
			intent[source.name] = map[string]string{"sha256": digest}
		}
	}
	// Check the actual wire size as well as each decoded source's cap.
	body, err := json.Marshal(request)
	if err != nil || len(body) > videoJobBodyLimit {
		return "", invalid
	}
	var encoded bytes.Buffer
	encoder := json.NewEncoder(&encoded)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(map[string]any{"schema": "aipg.video-intent.v1", "request": intent}); err != nil {
		return "", invalid
	}
	// Python ensure_ascii emits UTF-16 escapes, including astral surrogate pairs.
	var ascii strings.Builder
	for _, value := range strings.TrimSuffix(encoded.String(), "\n") {
		if value < 127 {
			ascii.WriteRune(value)
		} else if value <= 0xffff {
			fmt.Fprintf(&ascii, "\\u%04x", value)
		} else {
			hi, lo := utf16.EncodeRune(value)
			fmt.Fprintf(&ascii, "\\u%04x\\u%04x", hi, lo)
		}
	}
	digest := sha256.Sum256([]byte(ascii.String()))
	return hex.EncodeToString(digest[:]), nil
}

func videoText(value string, limit int, required bool) bool {
	return utf8.ValidString(value) && utf8.RuneCountInString(value) <= limit && (!required || value != "")
}

func videoFloat(value, min, max float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= min && value <= max
}

// Python retains .0 for whole floats and uses scientific notation below 1e-4.
func pythonVideoFloat(value float64) json.Number {
	// The Go wire encoder emits -0 as an integer; Python then parses it as 0.
	if value == 0 {
		return json.Number("0.0")
	}
	scientific := strconv.FormatFloat(value, 'e', -1, 64)
	index := strings.IndexByte(scientific, 'e')
	exponent, _ := strconv.Atoi(scientific[index+1:]) // FormatFloat always emits a decimal exponent.
	if exponent >= -4 && exponent < 16 {
		fixed := strconv.FormatFloat(value, 'f', -1, 64)
		if !strings.Contains(fixed, ".") {
			fixed += ".0"
		}
		return json.Number(fixed)
	}
	return json.Number(scientific)
}

func videoSourceDigest(value, mime string, limit int) (string, int, error) {
	invalid := errors.New("invalid inline video source")
	if len(value) > 4*((limit+2)/3)+64 {
		return "", 0, invalid
	}
	if mime == "" {
		value = strings.TrimSpace(value)
	}
	if strings.HasPrefix(value, "data:") {
		prefix, data, found := strings.Cut(value, ",")
		if !found || (mime != "" && prefix != "data:"+mime+";base64") {
			return "", 0, invalid
		}
		value = data
	}
	// Go's decoder ignores CR/LF; Core's strict base64 decoder rejects them.
	if strings.ContainsAny(value, "\r\n") {
		return "", 0, invalid
	}
	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(raw) == 0 || len(raw) > limit {
		return "", 0, invalid
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), len(raw), nil
}
