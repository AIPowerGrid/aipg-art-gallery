package aipg

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGenerateAudioUsesGovernedRouteAndUserAttribution(t *testing.T) {
	seed := int64(0)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/audio/generations" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("apikey") != "test" || r.Header.Get("X-Grid-User-Token") != "user-token" {
			t.Fatalf("missing Grid attribution headers: %#v", r.Header)
		}
		var request AudioRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if request.InferenceSteps != 8 || request.Seed == nil || *request.Seed != 0 {
			t.Fatalf("audio controls drifted: %#v", request)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"created":1,"data":[{"url":"https://media.aipg.art/audio/job/0.wav","seed":0}],"grid":{"worker":"rig-1","model":"ace-step-v1.5-turbo"}}`))
	}))
	defer server.Close()

	client := NewClient(server.URL+"/v1", "gallery-test")
	response, err := client.GenerateAudio(context.Background(), AudioRequest{
		Prompt: "clean pulse", Model: "ace-step-v1.5-turbo", Seconds: 30,
		InferenceSteps: 8, Seed: &seed,
	}, "test", "user-token", "gallery-test")
	if err != nil {
		t.Fatal(err)
	}
	if len(response.Data) != 1 || response.Data[0].URL == "" || response.Grid.Worker != "rig-1" {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestGenerateAudioRejectsEmptySuccessEnvelope(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"created":1,"data":[]}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "gallery-test")
	if _, err := client.GenerateAudio(context.Background(), AudioRequest{
		Prompt: "x", Model: "ace-step-v1.5-turbo", Seconds: 30, InferenceSteps: 8,
	}, "test", "user-token", "gallery-test"); err == nil {
		t.Fatal("empty success envelope was accepted")
	}
}
