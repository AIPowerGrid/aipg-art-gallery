// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
package aipg

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestImageCostFeatureFailsClosed(t *testing.T) {
	for _, body := range []string{`{"features":["image-max-cost-micro-usd-v1"]}`, `{}`, `{"features":["other"]}`, `invalid`, strings.Repeat("x", 16385)} {
		t.Run(body[:min(len(body), 35)], func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/health" || r.Header.Get("apikey") != "" || r.Header.Get("X-Grid-User-Token") != "" {
					t.Error("invalid public health read")
				}
				if _, err := w.Write([]byte(body)); err != nil {
					t.Error(err)
				}
			}))
			defer server.Close()
			err := NewClient(server.URL+"/v1", "fixture").RequireImageCostLimit(context.Background())
			if (err == nil) != strings.Contains(body, `"image-max-cost-micro-usd-v1"`) {
				t.Fatalf("unexpected feature result: %v", err)
			}
		})
	}
}

func TestImageCostFeatureDoesNotFollowRedirects(t *testing.T) {
	var calls atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer target.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, http.StatusFound) }))
	defer server.Close()
	if NewClient(server.URL, "fixture").RequireImageCostLimit(context.Background()) == nil || calls.Load() != 0 {
		t.Fatal("redirect accepted")
	}
}

func TestImageRequestCarriesExactCeilingToCore(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if string(body["max_cost_micro_usd"]) != "5000" || r.Header.Get("X-Grid-User-Token") != "fixture-user" {
			t.Error("lost exact ceiling or delegated identity")
		}
		w.Header().Set("Content-Type", "application/json")
		if _, err := w.Write([]byte(`{"created":1,"data":[{"url":"https://images.aipg.art/test.png"}]}`)); err != nil {
			t.Error(err)
		}
	}))
	defer server.Close()
	ceiling := int64(5000)
	_, err := NewClient(server.URL, "fixture").GenerateMedia(context.Background(), "image", GenerateRequest{Model: "FLUX.2 Klein 4B FP8", Prompt: "fixture", MaxCostMicroUSD: &ceiling}, "fixture-service", "fixture-user", "fixture")
	if err != nil {
		t.Fatal(err)
	}
}
