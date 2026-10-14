// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

package app

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/aipowergrid/aipg-art-gallery/server/internal/aipg"
	"github.com/google/uuid"
)

const durableVideoModel = "LTX-2.5 Distilled BF16"

func isDurableVideoModel(model string) bool {
	return model == durableVideoModel || model == "LTX-2.5 Distilled NVFP4"
}

type durableVideoQuoteRequest struct {
	Model  string `json:"model"`
	Frames int    `json:"frames"`
	FPS    int    `json:"fps"`
}

// Only commitments/receipts are durable; never retain prompts or source bodies.
type pendingVideo struct {
	Key     string
	Model   string
	MaxCost int64
	Seed    *int64
	Receipt *aipg.VideoJob
}

type durableVideoRequest struct {
	RequestID string               `json:"requestId"`
	Video     aipg.VideoJobRequest `json:"video"`
}

func newDurableVideoRequest() durableVideoRequest {
	return durableVideoRequest{Video: aipg.VideoJobRequest{Model: durableVideoModel, N: 1, FPS: 24, Audio: true}}
}

func validateDurableVideoEstimate(quote aipg.CreditQuote, model string, frames, fps int, owner string) (int, error) {
	if quote.AccountID != owner || quote.Estimate.Model != model || quote.Estimate.Modality != "video" ||
		quote.Estimate.Frames == nil || *quote.Estimate.Frames != frames ||
		quote.Estimate.FPS == nil || *quote.Estimate.FPS != fps {
		return http.StatusBadGateway, errors.New("Grid video quote commitment mismatch")
	}
	if !quote.ChargingEnabled || !quote.Estimate.Priced || quote.Estimate.CostMicro == nil || *quote.Estimate.CostMicro <= 0 {
		return http.StatusServiceUnavailable, errors.New("live credit-backed video pricing is required")
	}
	return 0, nil
}

func validateDurableVideoQuote(quote aipg.CreditQuote, request aipg.VideoJobRequest, owner string) (int, error) {
	if status, err := validateDurableVideoEstimate(quote, request.Model, request.Frames, request.FPS, owner); err != nil {
		return status, err
	}
	if !quote.Estimate.BalanceSufficient || *quote.Estimate.CostMicro > request.MaxCostMicroUSD {
		return http.StatusPaymentRequired, errors.New("insufficient credits or video cost ceiling")
	}
	return 0, nil
}

func (a *App) dispatchDurableVideo(jobID, owner string, request aipg.VideoJobRequest, key, digest, token string) {
	defer a.pending.finish(jobID)
	ctx, cancel := context.WithTimeout(context.Background(), aipg.MediaGenerationTimeout)
	defer cancel()
	receipt, err := a.client.SubmitVideoJob(ctx, request, key, digest, a.cfg.DefaultAPIKey, token)
	saveCtx, saveCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer saveCancel()
	if saveErr := a.pending.observeVideo(saveCtx, jobID, owner, receipt, err); saveErr != nil {
		log.Print("Video receipt journal unavailable; recover the original request")
	}
}

// observeVideo uses the indexed owner/hash and a cross-process JSON compare-and-
// swap. A late queued reply cannot regress a completed receipt or erase its hold.
func (s *pendingStore) observeVideo(ctx context.Context, id, owner string, receipt *aipg.VideoJob, failure error) error {
	if s.journal == nil {
		return errors.New("durable video storage required")
	}
	for range 5 {
		job, found, err := s.get(ctx, id, owner)
		if err != nil || !found || job.Video == nil {
			return errors.New("video journal unavailable")
		}
		previous, err := json.Marshal(job)
		if err != nil {
			return err
		}
		if receipt != nil {
			if err := aipg.ValidateVideoReplay(receipt, receipt); err != nil {
				return err
			}
			if receipt.RequestHash != job.RequestHash || receipt.Model != job.Video.Model || receipt.MaxCostMicro != job.Video.MaxCost ||
				(receipt.Result != nil && job.Video.Seed != nil && receipt.Result.Media[0].Seed != *job.Video.Seed) {
				return errors.New("video receipt commitment changed")
			}
			if job.Video.Receipt != nil {
				if err := aipg.ValidateVideoReplay(job.Video.Receipt, receipt); err != nil {
					return err
				}
			}
		}
		if job.Status == "completed" || job.Status == "faulted" {
			if receipt != nil && job.Video.Receipt == nil {
				return errors.New("closed video job cannot be replaced")
			}
			return nil
		}
		if receipt == nil {
			job.Status, job.Err = "uncertain", "Video outcome is unknown. Recover this request; do not resubmit automatically."
			// HTTP status alone cannot prove that Core committed nothing. Retain
			// recovery even for a rejected POST; only a terminal receipt closes it.
			var rejected *aipg.VideoJobHTTPError
			if errors.As(failure, &rejected) {
				job.Err = rejected.Error() + ". Recover this request and check its credit record; do not resubmit automatically."
			}
		} else {
			job.Video.Receipt = receipt
			job.Status, job.Err = "processing", ""
			switch receipt.State {
			case "completed":
				item := receipt.Result.Media[0]
				genTime := receipt.Result.GenTime
				job.Status = "completed"
				job.Items = []aipg.GeneratedItem{{URL: item.URL, Seed: &item.Seed}}
				job.Grid = &aipg.GridMeta{JobID: receipt.JobID, Model: receipt.Model, Worker: receipt.Result.Worker, GenTime: &genTime}
			case "closed_without_result":
				job.Status, job.Err = "faulted", "The video is closed without a result. Check its credit record before starting another generation."
			}
		}
		job.UpdatedAt = time.Now()
		payload, err := json.Marshal(job)
		if err != nil {
			return err
		}
		updated, err := s.journal.CompareAndUpdate(ctx, id, owner, previous, job.Status, payload)
		if err != nil || updated {
			return err
		}
	}
	return errors.New("video journal observation raced; recover the same request")
}

func (a *App) recoverDurableVideo(ctx context.Context, r *http.Request, jobID string, job pendingJob) error {
	_, identity, err := a.gridAccountOwnership(ctx, r)
	if err != nil {
		return errors.New("account identity is temporarily unavailable")
	}
	// Always recover by the saved key, even before the first Core reply survived.
	receipt, err := a.client.RecoverVideoJob(ctx, "", job.Video.Key, job.RequestHash, a.cfg.DefaultAPIKey, identity.AccessToken)
	if err != nil {
		return errors.New("video recovery temporarily unavailable")
	}
	return a.pending.observeVideo(ctx, jobID, job.Owner, receipt, nil)
}

func validVideoRequestID(value string) bool {
	id, err := uuid.Parse(value)
	return err == nil && id.Version() == 4 && id.String() == value
}
