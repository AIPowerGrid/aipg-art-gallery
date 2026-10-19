// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
	"github.com/go-chi/chi/v5"
)

func TestChunkUploadsRequireSessionAndSourceGate(t *testing.T) {
	a := &App{}
	for _, route := range []struct{ method, path string }{
		{"POST", "/api/videos/source-uploads"}, {"PUT", "/api/videos/source-uploads/unknown?offset=0"},
		{"DELETE", "/api/videos/source-uploads/unknown"}, {"POST", "/api/videos/source-uploads/unknown/prepare"},
	} {
		w := httptest.NewRecorder()
		a.Router().ServeHTTP(w, httptest.NewRequest(route.method, route.path, nil))
		if w.Code != 401 {
			t.Fatalf("%s %s: %d", route.method, route.path, w.Code)
		}
	}
	w := httptest.NewRecorder()
	a.handleStartVideoSourceUpload(w, sourceUploadFixture("POST", "{}"))
	if w.Code != 503 {
		t.Fatal("closed source gate admitted chunk upload")
	}
}

func sourceUploadFixture(method, body string) *http.Request {
	r := httptest.NewRequest(method, "/api/videos/source-uploads", strings.NewReader(body))
	return r.WithContext(requestWithClaims(&auth.Claims{GoogleID: "fixture-google", GridAccountID: brokerOwner}).Context())
}

func TestChunkUploadSettingsAreFrozenAndNeverGenerate(t *testing.T) {
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/auth/service/exchange":
			writeJSON(w, 200, map[string]string{"access_token": "fixture-user", "account_id": brokerOwner})
		case "/account/ownership":
			writeJSON(w, 200, map[string]any{"account_id": brokerOwner, "account_aliases": []string{}})
		default:
			t.Error("upload reached billing/storage/generation")
			w.WriteHeader(500)
		}
	}))
	defer core.Close()
	cfg := brokerPilotConfig("fixture-service")
	cfg.DurableVideoSourcesEnabled = true
	cfg.DurableVideoSourcesAdmissionMode = "open"
	a := &App{cfg: cfg, client: aipg.NewClient(core.URL, "fixture")}
	for _, body := range []string{
		`{"size":0}`, `{"size":536870913}`, `{"size":3,"url":"http://127.0.0.1"}`,
		`{"size":3,"mode":"video","frames":33,"width":512,"height":512,"startSeconds":0} {}`,
	} {
		w := httptest.NewRecorder()
		a.handleStartVideoSourceUpload(w, sourceUploadFixture("POST", body))
		if w.Code != 400 {
			t.Fatalf("invalid settings: %d %s", w.Code, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	a.handleStartVideoSourceUpload(w, sourceUploadFixture("POST", `{"size":3,"mode":"video","frames":33,"width":512,"height":512,"startSeconds":0}`))
	if w.Code != 201 {
		t.Fatalf("start: %d %s", w.Code, w.Body.String())
	}
	var ticket struct {
		ID string `json:"uploadId"`
	}
	if json.Unmarshal(w.Body.Bytes(), &ticket) != nil || ticket.ID == "" {
		t.Fatal("no upload id")
	}
	defer videoSourceUploads.Delete(brokerOwner, ticket.ID)
	r := sourceUploadFixture("PUT", "abc")
	r.URL.RawQuery = "offset=0"
	ctx := chi.NewRouteContext()
	ctx.URLParams.Add("uploadID", ticket.ID)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, ctx))
	w = httptest.NewRecorder()
	a.handleAppendVideoSourceUpload(w, r)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"offset":3`) {
		t.Fatalf("append: %d %s", w.Code, w.Body.String())
	}
	// Malformed media consumes/removes the temporary file, not a generation.
	w = httptest.NewRecorder()
	a.handleFinishVideoSourceUpload(w, r)
	if w.Code != 422 {
		t.Fatalf("prepare: %d %s", w.Code, w.Body.String())
	}
}
