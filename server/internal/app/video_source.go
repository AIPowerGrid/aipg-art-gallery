// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package app

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/aipowergrid/aipg-art-gallery/server/internal/videosource"
)

var videoUploadSlots = make(chan struct{}, 2)

func videoSourceToolsAvailable() bool { return videosource.Available() }
func verifyVideoSourceRuntime() error { return videosource.VerifyRuntime() }

func (a *App) validateVideoSourceAdmission(request aipg.VideoJobRequest, account string) error {
	if request.ReferenceImage != "" {
		return errors.New("Appearance-only references are not enabled.")
	}
	if request.ReferenceAudio == "" && request.ReferenceVideo == "" {
		return nil
	}
	if !a.cfg.AllowsDurableVideoSourceAccount(account, time.Now()) || request.Model != durableVideoModel {
		return errors.New("Audio/video source generation is not enabled.")
	}
	if request.Frames > videosource.MaxFrames {
		return errors.New("Audio/video source clips support up to 625 frames (26.04 seconds).")
	}
	if request.ReferenceAudio == "" || !request.Audio {
		return errors.New("Source video requires an explicit soundtrack; source modes retain audio.")
	}
	return nil
}

// Preparation is authenticated and bounded but never reserves credits or starts a job.
func (a *App) handlePrepareVideoSource(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if !a.cfg.DurableVideoEnabled || !a.cfg.DurableVideoSourcesEnabled || a.cfg.DefaultAPIKey == "" || !videosource.Available() {
		writeError(w, http.StatusServiceUnavailable, errors.New("Source video preparation is not enabled."))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 75*time.Second)
	defer cancel()
	stopRead := context.AfterFunc(ctx, func() { _ = r.Body.Close() })
	defer stopRead()
	_, identity, err := a.gridAccountOwnership(ctx, r)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("Account identity is temporarily unavailable."))
		return
	}
	if !a.cfg.AllowsDurableVideoAccount(identity.AccountID, time.Now()) || !a.cfg.AllowsDurableVideoSourceAccount(identity.AccountID, time.Now()) {
		writeError(w, http.StatusForbidden, errors.New("Source preparation is not available for this account."))
		return
	}
	select {
	case videoUploadSlots <- struct{}{}:
		defer func() { <-videoUploadSlots }()
	default:
		writeError(w, http.StatusTooManyRequests, videosource.ErrBusy)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, videosource.MaxUploadBytes+64*1024)
	if err := r.ParseMultipartForm(1024 * 1024); err != nil {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
		writeError(w, http.StatusBadRequest, errors.New("Upload one audio/video file up to 64 MB."))
		return
	}
	defer r.MultipartForm.RemoveAll()
	if len(r.MultipartForm.File) != 1 || len(r.MultipartForm.File["file"]) != 1 || len(r.MultipartForm.Value) != 5 {
		writeError(w, http.StatusBadRequest, errors.New("A single file and exact source settings are required."))
		return
	}
	for _, name := range []string{"mode", "frames", "width", "height", "startSeconds"} {
		values := r.MultipartForm.Value[name]
		if len(values) != 1 || len(values[0]) > 32 {
			writeError(w, http.StatusBadRequest, errors.New("Invalid source settings."))
			return
		}
	}
	value := func(name string) string { return r.MultipartForm.Value[name][0] }
	frames, framesErr := strconv.Atoi(value("frames"))
	width, widthErr := strconv.Atoi(value("width"))
	height, heightErr := strconv.Atoi(value("height"))
	start, startErr := strconv.ParseFloat(value("startSeconds"), 64)
	options := videosource.Options{Mode: value("mode"), Frames: frames, Width: width, Height: height, StartSeconds: start}
	if framesErr != nil || widthErr != nil || heightErr != nil || startErr != nil || !options.Valid() {
		writeError(w, http.StatusBadRequest, errors.New("Invalid source mode, exact frames, resolution or start time."))
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, errors.New("Source file is required."))
		return
	}
	defer file.Close()
	result, err := videosource.Prepare(ctx, file, options)
	if err != nil {
		status := http.StatusUnprocessableEntity
		if errors.Is(err, videosource.ErrBusy) {
			status = http.StatusTooManyRequests
		}
		writeError(w, status, err)
		return
	}
	if !a.cfg.AllowsDurableVideoAccount(identity.AccountID, time.Now()) || !a.cfg.AllowsDurableVideoSourceAccount(identity.AccountID, time.Now()) {
		writeError(w, http.StatusForbidden, errors.New("Source preparation eligibility expired."))
		return
	}
	writeJSON(w, http.StatusOK, result)
}
