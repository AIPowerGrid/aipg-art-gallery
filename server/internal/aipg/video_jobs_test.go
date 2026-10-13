// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package aipg

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

const videoTestJobID = "00000000-0000-4000-8000-000000000111"
const videoTestRequestKey = "00000000-0000-4000-8000-000000000222"
const videoTestHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func videoTestRequest() VideoJobRequest {
	return VideoJobRequest{Prompt: "A river landscape", Model: "LTX-2.5 Distilled BF16", N: 1,
		Size: "512x320", Frames: 33, FPS: 24, Audio: true, MaxCostMicroUSD: 100000}
}

func videoTestReceipt(state string) VideoJob {
	job := VideoJob{Schema: "aipg.video-job.v1", JobID: videoTestJobID, RequestHash: strings.Repeat("a", 64),
		Model: "LTX-2.5 Distilled BF16", State: state, ReservedMicro: 27500, MaxCostMicro: 100000}
	if state == "completed" {
		charge := job.ReservedMicro
		job.ActualMicro = &charge
		job.Result = &VideoJobResult{Model: job.Model, Worker: "unit-worker", GenTime: 2.5,
			RecipeRoot: "0x" + strings.Repeat("b", 64), Media: []VideoJobMedia{{
				URL: "https://media.example/video.mp4", Key: "outputs/video.mp4", SHA256: strings.Repeat("c", 64), Seed: 0}}}
	}
	return job
}

func writeVideoReceipt(t *testing.T, w http.ResponseWriter, status int, job VideoJob) {
	t.Helper()
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(job); err != nil {
		t.Error(err)
	}
}

func TestVideoSubmissionAndGETOnlyRecovery(t *testing.T) {
	posts, gets := 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("apikey") != "fixture-service" || r.Header.Get("X-Grid-User-Token") != "fixture-user" {
			t.Error("missing delegated identity")
		}
		if r.Method == http.MethodPost {
			posts++
			if r.URL.Path != "/v1/videos/jobs" || r.Header.Get("Idempotency-Key") != videoTestRequestKey {
				t.Error("submission lost durable selector")
			}
			var request VideoJobRequest
			if json.NewDecoder(r.Body).Decode(&request) != nil || request.Frames != 33 || request.MaxCostMicroUSD != 100000 {
				t.Error("submission changed exact-frame request/ceiling")
			}
			writeVideoReceipt(t, w, 202, videoTestReceipt("queued"))
			return
		}
		gets++
		body, err := io.ReadAll(r.Body)
		if err != nil || len(body) != 0 || r.Method != http.MethodGet {
			t.Error("recovery sent source body or resubmitted")
		}
		if r.URL.Path == "/v1/videos/jobs" && r.Header.Get("Idempotency-Key") != videoTestRequestKey {
			t.Error("lost-reply recovery selector missing")
		}
		writeVideoReceipt(t, w, 200, videoTestReceipt("completed"))
	}))
	defer server.Close()
	client := NewClient(server.URL+"/v1", "fixture-client")
	accepted, err := client.SubmitVideoJob(context.Background(), videoTestRequest(), videoTestRequestKey, videoTestHash, "fixture-service", "fixture-user")
	if err != nil {
		t.Fatal(err)
	}
	for _, selector := range []struct{ id, key string }{{"", videoTestRequestKey}, {videoTestJobID, ""}} {
		completed, err := client.RecoverVideoJob(context.Background(), selector.id, selector.key, videoTestHash, "fixture-service", "fixture-user")
		if err != nil || ValidateVideoReplay(accepted, completed) != nil {
			t.Fatalf("same-job recovery failed: %v", err)
		}
	}
	if posts != 1 || gets != 2 {
		t.Fatalf("unexpected requests: POST=%d GET=%d", posts, gets)
	}
}

func TestVideoSubmissionErrorsNeverRetryOrLeakBody(t *testing.T) {
	for _, status := range []int{400, 401, 402, 409, 422, 429, 500, 503} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			requests := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				w.WriteHeader(status)
				_, err := w.Write([]byte("upstream-private-body"))
				if err != nil {
					t.Error(err)
				}
			}))
			defer server.Close()
			_, err := NewClient(server.URL, "fixture").SubmitVideoJob(context.Background(), videoTestRequest(), videoTestRequestKey, videoTestHash, "fixture-service", "fixture-user")
			if err == nil || strings.Contains(err.Error(), "upstream-private-body") || requests != 1 {
				t.Fatalf("invalid error handling: requests=%d err=%v", requests, err)
			}
			if IsGenerationOutcomeUnknown(err) != (status >= 500) {
				t.Fatalf("incorrect uncertainty classification: %v", err)
			}
			var rejection *VideoJobHTTPError
			if status < 500 && (!errors.As(err, &rejection) || rejection.Status != status) {
				t.Fatal("missing structured rejection status")
			}
		})
	}
}

func TestVideoRedirectDoesNotForwardCredentials(t *testing.T) {
	forwarded := 0
	destination := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { forwarded++ }))
	defer destination.Close()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, destination.URL, http.StatusTemporaryRedirect)
	}))
	defer server.Close()
	client := NewClient(server.URL, "fixture")
	_, submitErr := client.SubmitVideoJob(context.Background(), videoTestRequest(), videoTestRequestKey, videoTestHash, "fixture-service", "fixture-user")
	_, recoveryErr := client.RecoverVideoJob(context.Background(), videoTestJobID, "", videoTestHash, "fixture-service", "fixture-user")
	if !IsGenerationOutcomeUnknown(submitErr) || recoveryErr == nil || forwarded != 0 {
		t.Fatal("redirect followed or incorrect uncertain outcome")
	}
}

func TestVideoMalformedSuccessStaysUncertain(t *testing.T) {
	for name, body := range map[string]string{
		"invalid": "{", "empty": "{}", "oversized": strings.Repeat(" ", videoJobResponseLimit+1),
		"trailing": `{} {}`, "null": "null",
	} {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(202)
				if _, err := w.Write([]byte(body)); err != nil {
					t.Error(err)
				}
			}))
			defer server.Close()
			_, err := NewClient(server.URL, "fixture").SubmitVideoJob(context.Background(), videoTestRequest(), videoTestRequestKey, videoTestHash, "fixture-service", "fixture-user")
			if !IsGenerationOutcomeUnknown(err) {
				t.Fatalf("malformed accepted response was not uncertain: %v", err)
			}
		})
	}
}

func TestVideoRecoveryMissingIsNotRefund(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Error("recovery resubmitted")
		}
		w.WriteHeader(404)
	}))
	defer server.Close()
	job, err := NewClient(server.URL, "fixture").RecoverVideoJob(context.Background(), "", videoTestRequestKey, videoTestHash, "fixture-service", "fixture-user")
	if job != nil || err != nil {
		t.Fatalf("missing receipt must remain unknown: %v", err)
	}
}

func TestVideoInvalidInputNeverMakesHTTP(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requests++ }))
	defer server.Close()
	client := NewClient(server.URL, "fixture")
	for _, mutate := range []func(*VideoJobRequest){
		func(r *VideoJobRequest) { r.MaxCostMicroUSD = 0 },
		func(r *VideoJobRequest) { r.N = 2 },
		func(r *VideoJobRequest) { r.Frames = 32 },
		func(r *VideoJobRequest) { r.FPS = 30 },
		func(r *VideoJobRequest) { seed := int64(1 << 53); r.Seed = &seed },
	} {
		request := videoTestRequest()
		mutate(&request)
		if _, err := client.SubmitVideoJob(context.Background(), request, videoTestRequestKey, videoTestHash, "fixture-service", "fixture-user"); err == nil {
			t.Fatal("invalid request accepted")
		}
	}
	for _, selectors := range []struct{ id, key string }{{"", ""}, {videoTestJobID, videoTestRequestKey}, {"../secret", ""}, {"", "bad\r\nkey"}} {
		if _, err := client.RecoverVideoJob(context.Background(), selectors.id, selectors.key, videoTestHash, "fixture-service", "fixture-user"); err == nil {
			t.Fatal("invalid recovery selector accepted")
		}
	}
	if _, err := client.SubmitVideoJob(context.Background(), videoTestRequest(), videoTestRequestKey, videoTestHash, "fixture-service", ""); err == nil {
		t.Fatal("missing user token accepted")
	}
	if requests != 0 {
		t.Fatal("invalid inputs reached transport")
	}
}

func TestVideoReceiptReplayAndAccountingGuards(t *testing.T) {
	for name, mutate := range map[string]func(*VideoJob){
		"identity":            func(j *VideoJob) { j.JobID = videoTestRequestKey },
		"intent":              func(j *VideoJob) { j.RequestHash = strings.Repeat("d", 64) },
		"ceiling":             func(j *VideoJob) { j.MaxCostMicro++ },
		"hold":                func(j *VideoJob) { j.ReservedMicro++ },
		"charge":              func(j *VideoJob) { charge := int64(1); j.ActualMicro = &charge },
		"output":              func(j *VideoJob) { j.Result.Media[0].SHA256 = strings.Repeat("d", 64) },
		"unsafe-url":          func(j *VideoJob) { j.Result.Media[0].URL = "https://user:password@media.example/video" },
		"unknown-state":       func(j *VideoJob) { j.State = "success" },
		"terminal-regression": func(j *VideoJob) { j.State = "queued"; j.Result = nil; j.ActualMicro = nil },
	} {
		t.Run(name, func(t *testing.T) {
			before, after := videoTestReceipt("completed"), videoTestReceipt("completed")
			mutate(&after)
			if ValidateVideoReplay(&before, &after) == nil {
				t.Fatal("changed terminal receipt accepted")
			}
		})
	}
	closed, complete := videoTestReceipt("closed_without_result"), videoTestReceipt("completed")
	if ValidateVideoReplay(&closed, &complete) == nil {
		t.Fatal("closed job resurrected")
	}
}

func TestVideoSavedIntentRequiredOnSubmitAndRecovery(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		status := 200
		if r.Method == http.MethodPost {
			status = 202
		}
		writeVideoReceipt(t, w, status, videoTestReceipt("queued"))
	}))
	defer server.Close()
	client := NewClient(server.URL, "fixture")
	wrongHash := strings.Repeat("f", 64)
	_, err := client.SubmitVideoJob(context.Background(), videoTestRequest(), videoTestRequestKey, wrongHash, "fixture-service", "fixture-user")
	if !IsGenerationOutcomeUnknown(err) {
		t.Fatal("accepted response ignored saved intent")
	}
	if _, err := client.RecoverVideoJob(context.Background(), "", videoTestRequestKey, wrongHash, "fixture-service", "fixture-user"); err == nil {
		t.Fatal("lost-reply recovery ignored saved intent")
	}
}

func TestVideoLostReplyAndCancellationRemainUncertain(t *testing.T) {
	var posts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		posts.Add(1)
		hijacker, ok := w.(http.Hijacker)
		if !ok {
			t.Error("fixture cannot simulate lost reply")
			return
		}
		conn, _, err := hijacker.Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		if err := conn.Close(); err != nil {
			t.Error(err)
		}
	}))
	defer server.Close()
	client := NewClient(server.URL, "fixture")
	_, err := client.SubmitVideoJob(context.Background(), videoTestRequest(), videoTestRequestKey, videoTestHash, "fixture-service", "fixture-user")
	if !IsGenerationOutcomeUnknown(err) || posts.Load() != 1 {
		t.Fatalf("lost reply retried or discarded uncertainty: posts=%d err=%v", posts.Load(), err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := client.SubmitVideoJob(ctx, videoTestRequest(), videoTestRequestKey, videoTestHash, "fixture-service", "fixture-user"); !IsGenerationOutcomeUnknown(err) {
		t.Fatal("cancellation incorrectly treated as refund/non-dispatch")
	}
}

func TestVideoIncompleteOrUncommittedSuccessIsUnknown(t *testing.T) {
	for _, missing := range []string{"actual_micro", "gen_time", "seed"} {
		t.Run(missing, func(t *testing.T) {
			job := videoTestReceipt("completed")
			raw, err := json.Marshal(job)
			if err != nil {
				t.Fatal(err)
			}
			var fields map[string]any
			if err := json.Unmarshal(raw, &fields); err != nil {
				t.Fatal(err)
			}
			result := fields["result"].(map[string]any)
			switch missing {
			case "actual_micro":
				delete(fields, missing)
			case "gen_time":
				delete(result, missing)
			case "seed":
				delete(result["media"].([]any)[0].(map[string]any), missing)
			}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if err := json.NewEncoder(w).Encode(fields); err != nil {
					t.Error(err)
				}
			}))
			defer server.Close()
			_, err = NewClient(server.URL, "fixture").SubmitVideoJob(context.Background(), videoTestRequest(), videoTestRequestKey, videoTestHash, "fixture-service", "fixture-user")
			if !IsGenerationOutcomeUnknown(err) {
				t.Fatal("missing commitment accepted")
			}
		})
	}
}
