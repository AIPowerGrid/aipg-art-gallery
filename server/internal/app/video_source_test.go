// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
package app

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/auth"
)

func sourceWAV() []byte {
	data := make([]byte, 44+48000*2*2*2)
	copy(data, "RIFF")
	binary.LittleEndian.PutUint32(data[4:], uint32(len(data)-8))
	copy(data[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(data[16:], 16)
	binary.LittleEndian.PutUint16(data[20:], 1)
	binary.LittleEndian.PutUint16(data[22:], 2)
	binary.LittleEndian.PutUint32(data[24:], 48000)
	binary.LittleEndian.PutUint32(data[28:], 192000)
	binary.LittleEndian.PutUint16(data[32:], 4)
	binary.LittleEndian.PutUint16(data[34:], 16)
	copy(data[36:], "data")
	binary.LittleEndian.PutUint32(data[40:], uint32(len(data)-44))
	return data
}

func sourceRequest(t *testing.T, content []byte, extra bool) *http.Request {
	t.Helper()
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	part, err := form.CreateFormFile("file", "private-upload.wav")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(content)
	for name, value := range map[string]string{"mode": "audio", "frames": "33", "width": "512", "height": "512", "startSeconds": "0"} {
		if err := form.WriteField(name, value); err != nil {
			t.Fatal(err)
		}
	}
	if extra {
		_ = form.WriteField("url", "http://127.0.0.1/private")
	}
	_ = form.Close()
	r := httptest.NewRequest(http.MethodPost, "/api/videos/prepare-source", &body)
	r.Header.Set("Content-Type", form.FormDataContentType())
	return r.WithContext(requestWithClaims(&auth.Claims{GoogleID: "fixture-google", GridAccountID: brokerOwner}).Context())
}

func TestSourcePreparationRequiresSessionAndIndependentGate(t *testing.T) {
	app := &App{}
	w := httptest.NewRecorder()
	app.Router().ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/videos/prepare-source", nil))
	if w.Code != 401 {
		t.Fatal("anonymous source upload accepted")
	}
	w = httptest.NewRecorder()
	app.handlePrepareVideoSource(w, sourceRequest(t, sourceWAV(), false))
	if w.Code != 503 {
		t.Fatal("default-off preparation admitted")
	}
}

func TestSourcePreparationNormalizesWithoutQuotesOrGeneration(t *testing.T) {
	if !videoSourceToolsAvailable() {
		t.Fatal("real codec tools are required")
	}
	core := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/auth/service/exchange":
			writeJSON(w, 200, map[string]string{"access_token": "fixture-user", "account_id": brokerOwner})
		case "/account/ownership":
			writeJSON(w, 200, map[string]any{"account_id": brokerOwner, "account_aliases": []string{}})
		default:
			t.Error("preparation reached pricing, storage or generation")
			w.WriteHeader(500)
		}
	}))
	defer core.Close()
	cfg := brokerPilotConfig("fixture-service")
	cfg.DurableVideoSourcesEnabled = true
	cfg.DurableVideoSourcesAdmissionMode = "open"
	app := &App{cfg: cfg, client: aipg.NewClient(core.URL, "fixture")}
	for _, item := range []struct {
		content []byte
		extra   bool
		want    int
	}{{sourceWAV(), false, 200}, {[]byte("invalid"), false, 422}, {sourceWAV(), true, 400}} {
		w := httptest.NewRecorder()
		app.handlePrepareVideoSource(w, sourceRequest(t, item.content, item.extra))
		if w.Code != item.want {
			t.Fatalf("preparation status %d: %s", w.Code, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "fixture-user") || strings.Contains(w.Body.String(), brokerOwner) || strings.Contains(w.Body.String(), "private-upload") {
			t.Fatal("private request data leaked")
		}
		if item.want == 200 {
			var result map[string]any
			if json.Unmarshal(w.Body.Bytes(), &result) != nil || result["frames"] != float64(33) || result["video"] != nil || !strings.HasPrefix(result["audio"].(string), "data:audio/wav;base64,") {
				t.Fatal("invalid prepared source")
			}
		}
	}
}

func TestSourceAdmissionCannotBypassModeGate(t *testing.T) {
	cfg := brokerPilotConfig("fixture-service")
	app := &App{cfg: cfg}
	request := aipg.VideoJobRequest{Model: durableVideoModel, Audio: true}
	if app.validateVideoSourceAdmission(request, brokerOwner) != nil {
		t.Fatal("text mode regressed")
	}
	request.ReferenceAudio = "private-sound"
	if app.validateVideoSourceAdmission(request, brokerOwner) == nil {
		t.Fatal("closed source mode admitted")
	}
	app.cfg.DurableVideoSourcesEnabled = true
	app.cfg.DurableVideoSourcesAdmissionMode = "open"
	if app.validateVideoSourceAdmission(request, brokerOwner) != nil {
		t.Fatal("allowed source rejected")
	}
	request.ReferenceVideo = "private-motion"
	request.ReferenceAudio = ""
	if app.validateVideoSourceAdmission(request, brokerOwner) == nil {
		t.Fatal("motion without sound admitted")
	}
	request.ReferenceAudio = "private-sound"
	request.Audio = false
	if app.validateVideoSourceAdmission(request, brokerOwner) == nil {
		t.Fatal("source sound silently discarded")
	}
	request.Audio = true
	request.ReferenceImage = "portrait"
	if app.validateVideoSourceAdmission(request, brokerOwner) == nil {
		t.Fatal("unqualified appearance reference admitted")
	}
}
