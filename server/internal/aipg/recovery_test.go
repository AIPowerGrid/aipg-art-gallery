// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package aipg

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestRecoverMediaResponseBoundary(t *testing.T) {
	for _, tc := range []struct {
		name, body             string
		status                 int
		wantError, wantMissing bool
	}{
		{"completed", `{"job_id":"receipt","state":"completed","result":{"media":[{"url":"https://images.example/one.webp"}]}}`, 200, false, false},
		{"pending", `{"job_id":"receipt","state":"pending"}`, 200, false, false},
		{"closed is not refund proof", `{"job_id":"receipt","state":"closed_without_result"}`, 200, false, false},
		{"not found stays unknown", `not a refund`, 404, false, true},
		{"ambiguous", `private upstream details`, 409, true, false},
		{"unavailable", `private upstream details`, 503, true, false},
		{"truncated", `{"job_id":"receipt"`, 200, true, false},
		{"missing job", `{"state":"pending"}`, 200, true, false},
		{"unknown state", `{"job_id":"receipt","state":"refunded"}`, 200, true, false},
		{"no outputs", `{"job_id":"receipt","state":"completed","result":{"media":[]}}`, 200, true, false},
		{"missing result", `{"job_id":"receipt","state":"completed"}`, 200, true, false},
		{"uncommitted output", `{"job_id":"receipt","state":"pending","result":{"media":[]}}`, 200, true, false},
		{"non-http", `{"job_id":"receipt","state":"completed","result":{"media":[{"url":"file:///private"}]}}`, 200, true, false},
		{"url credentials", `{"job_id":"receipt","state":"completed","result":{"media":[{"url":"https://user:pass@images.example/x"}]}}`, 200, true, false},
		{"oversized", strings.Repeat(" ", 131073), 200, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.Method != "GET" || r.URL.Path != "/v1/media/results" || r.URL.Query().Get("client_ref") != "correlation & id" {
					t.Error("recovery changed method, path or correlation")
				}
				if r.Header.Get("apikey") != "test-service" || r.Header.Get("X-Grid-User-Token") != "test-delegation" {
					t.Error("missing delegated identity")
				}
				w.WriteHeader(tc.status)
				fmt.Fprint(w, tc.body)
			}))
			defer upstream.Close()
			result, err := NewClient(upstream.URL+"/v1", "test").RecoverMedia(context.Background(), "correlation & id", "test-service", "test-delegation")
			if (err != nil) != tc.wantError || (result == nil && err == nil) != tc.wantMissing {
				t.Fatalf("result=%+v error=%v", result, err)
			}
			if calls != 1 {
				t.Fatalf("recovery retried: %d calls", calls)
			}
			if err != nil && strings.Contains(err.Error(), "private upstream") {
				t.Fatal("upstream error details leaked")
			}
		})
	}
}

func TestRecoverMediaDoesNotRedirectCredentials(t *testing.T) {
	var leaked atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaked.Add(1) }))
	defer target.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer source.Close()
	_, err := NewClient(source.URL, "test").RecoverMedia(context.Background(), "correlation", "test-service", "test-delegation")
	if err == nil || leaked.Load() != 0 {
		t.Fatal("recovery followed a redirect")
	}
}
