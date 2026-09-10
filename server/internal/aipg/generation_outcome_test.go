// SPDX-FileCopyrightText: 2026 AI Power Grid
// SPDX-License-Identifier: AGPL-3.0-or-later

package aipg

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type generationTransport func(*http.Request) (*http.Response, error)

func (f generationTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type brokenGenerationBody struct{ read bool }

func (b *brokenGenerationBody) Read(p []byte) (int, error) {
	if b.read {
		return 0, io.ErrUnexpectedEOF
	}
	b.read = true
	return copy(p, `{"data":[{"url":"https://images.example/result.png"}]}`), io.ErrUnexpectedEOF
}
func (*brokenGenerationBody) Close() error { return nil }

func TestGenerationAmbiguousOutcomeNeverLooksLikeSafeRecipeFallback(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		body   io.ReadCloser
		err    error
	}{
		{"lost connection", 0, nil, context.DeadlineExceeded},
		{"upstream gateway failure", 504, io.NopCloser(strings.NewReader("404 unknown model: private upstream detail")), nil},
		{"generic unavailable", 503, io.NopCloser(strings.NewReader(`{"detail":"upstream unavailable"}`)), nil},
		{"admission words inside gateway error", 503, io.NopCloser(strings.NewReader(`{"detail":"gateway: This generation path is temporarily unavailable."}`)), nil},
		{"admission body with wrong status", 502, io.NopCloser(strings.NewReader(`{"detail":"This generation path is temporarily unavailable."}`)), nil},
		{"truncated admission JSON", 503, io.NopCloser(strings.NewReader(`{"detail":"This generation path is temporarily unavailable."`)), nil},
		{"truncated success body", 200, &brokenGenerationBody{}, nil},
		{"invalid success JSON", 200, io.NopCloser(strings.NewReader("{")), nil},
		{"empty success results", 200, io.NopCloser(strings.NewReader(`{"data":[]}`)), nil},
		{"missing output", 200, io.NopCloser(strings.NewReader(`{"data":[{}]}`)), nil},
		{"unexpected result count", 200, io.NopCloser(strings.NewReader(`{"data":[{"url":"https://images.example/1.png"},{"url":"https://images.example/2.png"}]}`)), nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			client := NewClient("https://grid.example/v1", "test")
			client.mediaClient.Transport = generationTransport(func(r *http.Request) (*http.Response, error) {
				calls++
				if tc.err != nil {
					return nil, tc.err
				}
				return &http.Response{StatusCode: tc.status, Body: tc.body, Header: make(http.Header)}, nil
			})
			result, err := client.GenerateMedia(context.Background(), "video", GenerateRequest{Model: "test-model", N: 1}, "", "", "test")
			if err == nil || result != nil {
				t.Fatalf("ambiguous response must not succeed: result=%v err=%v", result, err)
			}
			message := err.Error()
			for _, want := range []string{"outcome is unknown", "may still complete and be charged", "Retrying starts a new generation"} {
				if !strings.Contains(message, want) {
					t.Errorf("missing %q in %q", want, message)
				}
			}
			for _, forbidden := range []string{"404", "unknown model", "not available", "private upstream detail"} {
				if strings.Contains(message, forbidden) {
					t.Errorf("unsafe fallback or private detail in %q", message)
				}
			}
			if tc.err != nil && !errors.Is(err, tc.err) {
				t.Error("transport cause should remain available internally")
			}
			if calls != 1 {
				t.Fatalf("must not retry a potentially paid request: %d calls", calls)
			}
		})
	}
}

func TestGenerationAdmissionRejectionIsTerminalWithoutRetry(t *testing.T) {
	for _, kind := range []string{"image", "video", "3d"} {
		t.Run(kind, func(t *testing.T) {
			calls := 0
			client := NewClient("https://grid.example/v1", "test")
			client.mediaClient.Transport = generationTransport(func(*http.Request) (*http.Response, error) {
				calls++
				return &http.Response{StatusCode: 503, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(
					`{"detail":"This generation path is temporarily unavailable."}`))}, nil
			})
			result, err := client.GenerateMedia(context.Background(), kind, GenerateRequest{Model: "test-model", N: 1}, "", "", "test")
			if err == nil || result != nil || IsGenerationOutcomeUnknown(err) {
				t.Fatalf("pre-dispatch rejection must be terminal: result=%v err=%v", result, err)
			}
			if !strings.Contains(err.Error(), "No job was started") || calls != 1 {
				t.Fatalf("rejection must explain admission without retrying: calls=%d err=%v", calls, err)
			}
			for _, fallback := range []string{"not available", "unknown model", "404"} {
				if strings.Contains(err.Error(), fallback) {
					t.Fatalf("rejection must not trigger a recipe fallback: %v", err)
				}
			}
		})
	}
}

func TestGenerationDefiniteRejectionAndSuccessRemainCompatible(t *testing.T) {
	for _, status := range []int{200, 402, 404} {
		client := NewClient("https://grid.example/v1", "test")
		client.mediaClient.Transport = generationTransport(func(*http.Request) (*http.Response, error) {
			body := `{"detail":"rejected"}`
			if status == 200 {
				body = `{"data":[{"url":"https://images.example/result.png"}],"grid":{"job_id":"receipt"}}`
			}
			return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
		})
		result, err := client.GenerateMedia(context.Background(), "image", GenerateRequest{Model: "test-model", N: 1}, "", "", "test")
		if status == 200 {
			if err != nil || result.Grid.JobID != "receipt" {
				t.Fatalf("successful receipt lost: %v %v", result, err)
			}
		} else if err == nil || strings.Contains(err.Error(), "outcome is unknown") {
			t.Fatalf("definite rejection changed: %v", err)
		}
	}
}
