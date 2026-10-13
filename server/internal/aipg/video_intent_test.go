// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package aipg

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"math"
	"os"
	"strings"
	"testing"
)

func TestVideoIntentCoreGolden(t *testing.T) {
	for _, test := range []struct {
		variant string
		steps   int
		cfg     float64
		digest  string
	}{
		{"Distilled", 8, 1, "ff5564001dd3f129a4edc10db7d434d8805dc62b5ef71efae37654283f2d9bb4"},
		{"Dev", 40, 3, "196b13865d0062b00c158e8d112c4eee379e02320592df9acf9032105a2fa94b"},
	} {
		t.Run(test.variant, func(t *testing.T) {
			seed := int64(42)
			request := VideoJobRequest{Prompt: "A synthetic red ball rolls on a table",
				Model: "LTX-2.5 " + test.variant + " BF16", N: 1, Size: "256x256", Frames: 33, FPS: 24,
				Seed: &seed, Steps: &test.steps, CFGScale: &test.cfg, Audio: true, MaxCostMicroUSD: 40000}
			digest, err := VideoIntentHash(request)
			if err != nil || digest != test.digest {
				t.Fatalf("Core golden mismatch: digest=%s err=%v", digest, err)
			}
		})
	}
}

func videoIntentImage(t *testing.T) string {
	t.Helper()
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, image.NewRGBA(image.Rect(0, 0, 32, 32))); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(encoded.Bytes())
}

func TestVideoIntentSourceAndOmissionSemantics(t *testing.T) {
	request := videoTestRequest()
	request.Size = ""
	request.Image = videoIntentImage(t)
	original, err := VideoIntentHash(request)
	if err != nil {
		t.Fatal(err)
	}
	request.Image = "data:image/png;base64," + request.Image
	uri, err := VideoIntentHash(request)
	if err != nil || uri != original {
		t.Fatal("data URI spelling changed source-byte commitment")
	}
	request.Size = "768x512"
	explicit, err := VideoIntentHash(request)
	if err != nil || explicit == original {
		t.Fatal("explicit size lost its pinning semantics")
	}
	seed := int64(0)
	request.Seed = &seed
	zero, err := VideoIntentHash(request)
	if err != nil || zero == explicit {
		t.Fatal("seed zero collapsed into generated-seed intent")
	}
}

func TestVideoIntentRejectsInvalidWithoutPrivateErrors(t *testing.T) {
	for name, mutate := range map[string]func(*VideoJobRequest){
		"prompt":            func(r *VideoJobRequest) { r.Prompt = strings.Repeat("x", 8001) },
		"utf8":              func(r *VideoJobRequest) { r.Prompt = string([]byte{255}) },
		"ceiling":           func(r *VideoJobRequest) { r.MaxCostMicroUSD = 0 },
		"seed":              func(r *VideoJobRequest) { seed := int64(1 << 53); r.Seed = &seed },
		"frames":            func(r *VideoJobRequest) { r.Frames = 32 },
		"both-pins":         func(r *VideoJobRequest) { r.Image = "private"; r.Keyframes = []VideoJobKeyframe{{Image: "private"}} },
		"nan":               func(r *VideoJobRequest) { v := math.NaN(); r.CFGScale = &v },
		"infinity":          func(r *VideoJobRequest) { v := math.Inf(1); r.GuideStrength = &v },
		"guide-zero":        func(r *VideoJobRequest) { v := 0.0; r.GuideStrength = &v },
		"base64-newline":    func(r *VideoJobRequest) { r.ReferenceAudio = "cHJp\ndmF0ZQ==" },
		"wrong-role":        func(r *VideoJobRequest) { r.ReferenceVideo = "data:audio/wav;base64,cHJpdmF0ZQ==" },
		"url":               func(r *VideoJobRequest) { r.Image = "https://private.example/source" },
		"keyframe-strength": func(r *VideoJobRequest) { r.Keyframes = []VideoJobKeyframe{{Image: "cHJpdmF0ZQ==", Strength: -1}} },
	} {
		t.Run(name, func(t *testing.T) {
			request := videoTestRequest()
			mutate(&request)
			digest, err := VideoIntentHash(request)
			if digest != "" || err == nil || strings.Contains(err.Error(), "private") {
				t.Fatal("invalid intent accepted or source reflected in error")
			}
		})
	}
}

// Optional generated vectors allow the actual Python Core to independently
// verify defaults, Unicode, float spelling and source-byte commitments.
func TestVideoIntentInteroperabilityVectors(t *testing.T) {
	requests := []VideoJobRequest{videoTestRequest()}
	for _, prompt := range []string{"Unicode: caf\u00e9 \U0001f600", "<tag>& \"quoted\" \\ slash /", "controls:\x00\x01\t\n\x7f\u2028"} {
		r := videoTestRequest()
		r.Prompt = prompt
		requests = append(requests, r)
	}
	for _, strength := range []float64{1, 0.85, 0.00001, 0.0001, math.SmallestNonzeroFloat64, 0.12345678901234568} {
		r := videoTestRequest()
		r.GuideStrength = &strength
		r.ReferenceVideo = base64.StdEncoding.EncodeToString([]byte("synthetic-video-source"))
		requests = append(requests, r)
	}
	for _, size := range []string{"", "768x512"} {
		r := videoTestRequest()
		r.Size = size
		r.Image = videoIntentImage(t)
		requests = append(requests, r)
	}
	for _, strength := range []float64{0, math.Copysign(0, -1), 0.25, 1} {
		r := videoTestRequest()
		r.Keyframes = []VideoJobKeyframe{{Image: videoIntentImage(t), Frame: 0, Strength: strength}}
		requests = append(requests, r)
	}
	r := videoTestRequest()
	r.ReferenceAudio = "data:audio/wav;base64," + base64.StdEncoding.EncodeToString([]byte("synthetic-audio-source"))
	r.ReferenceImage = "data:image/png;base64," + videoIntentImage(t)
	r.Audio = false
	r.Worker = "synthetic-worker"
	r.Style = "synthetic-style"
	requests = append(requests, r)
	type vector struct {
		Request VideoJobRequest `json:"request"`
		Digest  string          `json:"digest"`
	}
	vectors := make([]vector, 0, len(requests))
	for _, request := range requests {
		digest, err := VideoIntentHash(request)
		if err != nil {
			t.Fatal(err)
		}
		vectors = append(vectors, vector{request, digest})
	}
	if path := os.Getenv("VIDEO_INTENT_VECTOR_OUTPUT"); path != "" {
		encoded, err := json.Marshal(vectors)
		if err != nil {
			t.Fatal(err)
		}
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write(encoded); err != nil {
			t.Fatal(err)
		}
		if err := file.Close(); err != nil {
			t.Fatal(err)
		}
	}
}
