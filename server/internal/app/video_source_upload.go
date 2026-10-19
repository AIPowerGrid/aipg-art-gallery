// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/videosource"
	"github.com/go-chi/chi/v5"
)

var videoSourceUploads = videosource.NewUploads()

func (a *App) videoSourceUploadOwner(w http.ResponseWriter, r *http.Request) (string, bool) {
	w.Header().Set("Cache-Control", "no-store")
	if !a.cfg.DurableVideoEnabled || !a.cfg.DurableVideoSourcesEnabled || a.cfg.DefaultAPIKey == "" || !videosource.Available() {
		writeError(w, http.StatusServiceUnavailable, errors.New("Source video preparation is not enabled."))
		return "", false
	}
	_, identity, err := a.gridAccountOwnership(r.Context(), r)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, errors.New("Account identity is temporarily unavailable."))
		return "", false
	}
	if !a.cfg.AllowsDurableVideoAccount(identity.AccountID, time.Now()) || !a.cfg.AllowsDurableVideoSourceAccount(identity.AccountID, time.Now()) {
		writeError(w, http.StatusForbidden, errors.New("Source preparation is not available for this account."))
		return "", false
	}
	return identity.AccountID, true
}

func sourceUploadRequest(w http.ResponseWriter, r *http.Request, timeout time.Duration) (*http.Request, func()) {
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	stop := context.AfterFunc(ctx, func() { _ = r.Body.Close() })
	return r.WithContext(ctx), func() { stop(); cancel() }
}

func sourceUploadError(w http.ResponseWriter, err error) {
	status := http.StatusUnprocessableEntity
	switch {
	case errors.Is(err, videosource.ErrBusy):
		status = http.StatusTooManyRequests
	case errors.Is(err, videosource.ErrUploadNotFound):
		status = http.StatusNotFound
	case errors.Is(err, videosource.ErrUploadOrder):
		status = http.StatusConflict
	case errors.Is(err, videosource.ErrUploadSize):
		status = http.StatusBadRequest
	}
	writeError(w, status, err)
}

func (a *App) handleStartVideoSourceUpload(w http.ResponseWriter, r *http.Request) {
	r, cancel := sourceUploadRequest(w, r, 15*time.Second)
	defer cancel()
	owner, ok := a.videoSourceUploadOwner(w, r)
	if !ok {
		return
	}
	var request struct {
		Size         int64   `json:"size"`
		Mode         string  `json:"mode"`
		Frames       int     `json:"frames"`
		Width        int     `json:"width"`
		Height       int     `json:"height"`
		StartSeconds float64 `json:"startSeconds"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&request) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		writeError(w, http.StatusBadRequest, errors.New("Invalid source upload settings."))
		return
	}
	ticket, err := videoSourceUploads.Start(owner, request.Size, videosource.Options{
		Mode: request.Mode, Frames: request.Frames, Width: request.Width, Height: request.Height, StartSeconds: request.StartSeconds,
	})
	if err != nil {
		sourceUploadError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, ticket)
}

func (a *App) handleAppendVideoSourceUpload(w http.ResponseWriter, r *http.Request) {
	r, cancel := sourceUploadRequest(w, r, 45*time.Second)
	defer cancel()
	owner, ok := a.videoSourceUploadOwner(w, r)
	if !ok {
		return
	}
	values := r.URL.Query()
	offset, err := strconv.ParseInt(values.Get("offset"), 10, 64)
	if err != nil || offset < 0 || len(values) != 1 || len(values["offset"]) != 1 {
		writeError(w, http.StatusBadRequest, errors.New("Invalid source upload offset."))
		return
	}
	next, err := videoSourceUploads.Append(owner, chi.URLParam(r, "uploadID"), offset, http.MaxBytesReader(w, r.Body, videosource.UploadChunkBytes))
	if err != nil {
		sourceUploadError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"offset": next})
}

func (a *App) handleDeleteVideoSourceUpload(w http.ResponseWriter, r *http.Request) {
	// Deletion uses the signed session owner even after cohort expiry/Core outage.
	// It is idempotent and never reveals another owner's upload existence.
	w.Header().Set("Cache-Control", "no-store")
	claims := getClaimsFromContext(r)
	if claims == nil || claims.GridAccountID == "" {
		writeError(w, http.StatusUnauthorized, errors.New("Sign in required."))
		return
	}
	videoSourceUploads.Delete(claims.GridAccountID, chi.URLParam(r, "uploadID"))
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleFinishVideoSourceUpload(w http.ResponseWriter, r *http.Request) {
	r, cancel := sourceUploadRequest(w, r, 75*time.Second)
	defer cancel()
	owner, ok := a.videoSourceUploadOwner(w, r)
	if !ok {
		return
	}
	result, err := videoSourceUploads.Prepare(r.Context(), owner, chi.URLParam(r, "uploadID"))
	if err != nil {
		sourceUploadError(w, err)
		return
	}
	if !a.cfg.AllowsDurableVideoAccount(owner, time.Now()) || !a.cfg.AllowsDurableVideoSourceAccount(owner, time.Now()) {
		writeError(w, http.StatusForbidden, errors.New("Source preparation eligibility expired."))
		return
	}
	writeJSON(w, http.StatusOK, result)
}
