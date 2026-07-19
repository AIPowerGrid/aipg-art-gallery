/**
 * Director v2 engine.
 *
 * - renderSegment(id): compile one segment → one grid job (Director recipe).
 * - renderPending(): arm the auto-queue — segments render strictly in order,
 *   one at a time (single GPU); each chained segment waits for its source's
 *   last frame before it submits.
 * - useDirectorSync(): the reconciler. Mirrors job status/progress into
 *   segments, extracts the last frame on completion, backfills chained start
 *   images (and re-backfills + flags stale joins when a source re-renders),
 *   recovers orphaned statuses after reload, and advances the queue.
 *
 * Polling stays in the shared useJobStore — this never polls the API itself.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createJob, addToGallery } from '@/lib/api';
import { useJobStore } from '@/lib/stores/job-store';
import { useDirectorStore } from '@/lib/stores/director-store';
import {
  buildSegmentPayload,
  buildSegmentFallbackPayload,
  isModelUnavailableError,
  segmentBlockers,
  randomSeed,
  DIRECTOR_MODEL_ID,
  FALLBACK_MODEL_ID,
  MAX_TIMELINE_BYTES,
} from '@/lib/create/director-payload';
import { extractFrame } from '@/lib/utils/video-frames';
import { cropImageToRenderSize } from '@/lib/utils/crop-image';
import { DirectorSegment, segmentOffsets } from '@/lib/types/director';
import { StylesConfig } from '@/lib/types/create';

interface UseDirectorOptions {
  styles: StylesConfig | null;
  walletAddress?: string;
  authenticated: boolean;
}

// Once the grid reports the Director recipe missing, submit straight to the
// fallback for the rest of the session (an audio track still forces the
// Director attempt, since only that recipe supports audio). The 404 surfaces
// ASYNCHRONOUSLY (the backend bridges the blocking grid call behind a 202 +
// poll), so this flag is set by the sync reconciler, not the submit path.
let directorOffline = false;
export function __setDirectorOfflineForTests(v: boolean) {
  directorOffline = v;
}

export function useDirector({ styles, walletAddress, authenticated }: UseDirectorOptions) {
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef<Set<string>>(new Set());
  const { addJob } = useJobStore();

  const model = styles?.models.find((m) => m.id === DIRECTOR_MODEL_ID) ?? null;

  const renderSegment = useCallback(
    async (segmentId: string, opts?: { manual?: boolean }): Promise<boolean> => {
      // A manual render is a fresh chance for the Director recipe — it may have
      // been (re-)registered since the session flagged it offline. The queue's
      // automated calls keep the flag so its auto-fallback stays loop-free.
      if (opts?.manual) {
        directorOffline = false;
        useDirectorStore.getState().updateSegment(segmentId, { autoFellBack: false });
      }
      const state = useDirectorStore.getState();
      const idx = state.segments.findIndex((s) => s.id === segmentId);
      const segment = state.segments[idx];
      if (!segment || submitting.current.has(segmentId)) return false;

      const blockers = segmentBlockers(segment, idx, state.globalPrompt);
      if (blockers.length > 0) {
        setError(`Segment ${idx + 1} ${blockers.join('; ')}.`);
        return false;
      }
      const missingTrack = state.audios.find((a) => !a.audioB64);
      if (missingTrack) {
        setError(`Audio track "${missingTrack.fileName}" is missing its file — re-add or remove it.`);
        return false;
      }
      const hasAudio = state.audios.length > 0;

      // Locked seed: mint one on first use so every segment shares it.
      let seed = segment.seed?.trim() || undefined;
      if (!seed && state.settings.lockSeed) {
        seed = state.settings.seed?.trim() || randomSeed();
        if (seed !== state.settings.seed) state.setSettings({ seed });
      }

      const offsets = segmentOffsets(state.segments);
      const buildArgs = {
        segment,
        offsetFrames: offsets[idx],
        globalPrompt: state.globalPrompt,
        settings: state.settings,
        audios: state.audios,
        walletAddress,
        seed,
      };
      const payload = buildSegmentPayload(buildArgs);

      if (payload.timelineData && payload.timelineData.length > MAX_TIMELINE_BYTES) {
        setError('Segment payload too large (max ~24MB) — use a smaller image or shorter audio.');
        return false;
      }

      submitting.current.add(segmentId);
      setError(null);
      const prev = idx > 0 ? state.segments[idx - 1] : undefined;
      state.updateSegment(segmentId, { status: 'queued', error: undefined, progress: undefined });

      try {
        let usedModelId = DIRECTOR_MODEL_ID;
        let resp;
        if (directorOffline && !hasAudio) {
          // Known-offline this session: skip the doomed Director attempt.
          usedModelId = FALLBACK_MODEL_ID;
          resp = await createJob(buildSegmentFallbackPayload(buildArgs));
        } else {
          try {
            resp = await createJob(payload);
          } catch (err) {
            // Synchronous 404 (e.g. unknown model at the backend catalog).
            // Audio needs the Director recipe, so don't mask that case with a
            // silently-audioless render.
            if (isModelUnavailableError(err) && !hasAudio) {
              directorOffline = true;
              console.warn('[Director] recipe unavailable — falling back to', FALLBACK_MODEL_ID);
              usedModelId = FALLBACK_MODEL_ID;
              resp = await createJob(buildSegmentFallbackPayload(buildArgs));
            } else if (isModelUnavailableError(err) && hasAudio) {
              throw new Error(
                'The Director recipe is offline and audio needs it — remove the audio track to render via the fallback, or try again later.'
              );
            } else {
              throw err;
            }
          }
        }
        useDirectorStore.getState().updateSegment(segmentId, {
          jobId: resp.jobId,
          modelUsed: usedModelId,
          status: 'queued',
          outputUrl: undefined,
          lastFrame: null,
          anchorStale: false,
          sourceJobId: segment.chained ? prev?.jobId : undefined,
        });

        addJob({
          jobId: resp.jobId,
          modelId: usedModelId,
          modelName: usedModelId,
          prompt: segment.prompt.trim() || state.globalPrompt.trim() || 'director segment',
          type: 'video',
          isNsfw: false,
          isPublic: false,
          walletAddress,
          width: state.settings.width,
          height: state.settings.height,
          expectedGenerations: 1,
        });

        if (authenticated) {
          addToGallery({
            jobId: resp.jobId,
            modelId: usedModelId,
            modelName: usedModelId,
            prompt: segment.prompt.trim() || state.globalPrompt.trim() || 'director segment',
            type: 'video',
            isNsfw: false,
            isPublic: false,
            walletAddress,
            params: {
              width: state.settings.width,
              height: state.settings.height,
              steps: state.settings.steps,
              cfgScale: state.settings.cfgScale,
              ...(seed ? { seed } : {}),
            },
            mediaUrls: [],
          }).catch((err) => console.error('[Director] gallery save failed:', err));
        }
        return true;
      } catch (err) {
        useDirectorStore.getState().updateSegment(segmentId, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Submit failed',
        });
        setError(err instanceof Error ? err.message : 'Submit failed');
        return false;
      } finally {
        submitting.current.delete(segmentId);
      }
    },
    [walletAddress, authenticated, addJob, model]
  );

  const renderPending = useCallback(() => {
    setError(null);
    useDirectorStore.getState().setQueueActive(true);
  }, []);

  const stopQueue = useCallback(() => {
    useDirectorStore.getState().setQueueActive(false);
  }, []);

  return { renderSegment, renderPending, stopQueue, error, clearError: () => setError(null), model };
}

/** Segments the auto-queue may submit: idle ONLY. An errored segment stops the
 *  queue instead of being resubmitted forever — retrying it is a user action
 *  (the async-404 fallback resets to idle explicitly, which is the exception). */
function isPending(s: DirectorSegment): boolean {
  return s.status === 'idle';
}

export function useDirectorSync(renderSegment: (id: string) => Promise<boolean>) {
  const jobs = useJobStore((s) => s.jobs);
  const segments = useDirectorStore((s) => s.segments);
  const audios = useDirectorStore((s) => s.audios);
  const queueActive = useDirectorStore((s) => s.queueActive);
  const updateSegment = useDirectorStore((s) => s.updateSegment);
  const inflightFrames = useRef<Set<string>>(new Set());
  const queueSubmitting = useRef(false);

  // 0. Reload recovery: a segment stuck queued/rendering with no tracked job
  //    (job store pruned it, or the tab died mid-submit) returns to idle so it
  //    can render again. Completed-but-untracked keeps its outputUrl.
  useEffect(() => {
    for (const seg of segments) {
      if ((seg.status === 'queued' || seg.status === 'rendering') && seg.jobId) {
        const job = jobs.find((j) => j.jobId === seg.jobId);
        if (!job) updateSegment(seg.id, { status: seg.outputUrl ? 'done' : 'idle', progress: undefined });
      } else if ((seg.status === 'queued' || seg.status === 'rendering') && !seg.jobId) {
        updateSegment(seg.id, { status: 'idle' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once, on mount

  // 1. Mirror tracked-job status + live progress into segments.
  useEffect(() => {
    for (const seg of segments) {
      if (!seg.jobId) continue;
      const job = jobs.find((j) => j.jobId === seg.jobId);
      if (!job) continue;

      const patch: Partial<DirectorSegment> = {};
      let status: DirectorSegment['status'] | null = null;
      if (job.status === 'completed') status = 'done';
      else if (job.status === 'faulted' || job.status === 'cancelled') status = 'error';
      else if (job.status === 'processing') status = 'rendering';
      else if (job.status === 'queued') status = 'queued';

      if (status && status !== seg.status) patch.status = status;

      const progress = job.result?.progress ?? undefined;
      if (status === 'rendering' && progress !== seg.progress) patch.progress = progress ?? undefined;

      if (job.status === 'completed') {
        const url = job.result?.generations?.find((g) => !!g.url)?.url;
        if (url && url !== seg.outputUrl) patch.outputUrl = url;
        if (seg.progress !== undefined) patch.progress = undefined;
        if (seg.error) patch.error = undefined; // a successful re-render clears stale failures
      }
      if (status === 'error') {
        const msg = job.error ?? 'Render failed';
        // The Director-recipe 404 arrives asynchronously (async 202+poll
        // bridge). Reset the segment to idle ONCE so it resubmits via the
        // fallback recipe; the guard prevents a resubmit loop if the fallback
        // is missing too.
        if (
          isModelUnavailableError(msg) &&
          seg.modelUsed === DIRECTOR_MODEL_ID &&
          audios.length === 0 &&
          !seg.autoFellBack
        ) {
          directorOffline = true;
          console.warn('[Director] recipe offline (async) — re-queueing via fallback');
          updateSegment(seg.id, {
            status: 'idle',
            error: undefined,
            jobId: undefined,
            progress: undefined,
            autoFellBack: true,
          });
          continue;
        }
        if (msg !== seg.error) patch.error = msg;
      }
      if (Object.keys(patch).length > 0) updateSegment(seg.id, patch);
    }
  }, [jobs, segments, audios, updateSegment]);

  // 2. Extract the last frame once a segment has a playable output. The frame
  //    is cropped/scaled to the EXACT render size (same as uploads) so the
  //    next chained segment's keyframe is geometry-identical — the recipe
  //    derives output dims from the keyframe, so any mismatch drifts the join.
  useEffect(() => {
    for (const seg of segments) {
      if (seg.status !== 'done' || !seg.outputUrl || seg.lastFrame) continue;
      const key = `${seg.id}:${seg.jobId ?? seg.outputUrl}`;
      if (inflightFrames.current.has(key)) continue;
      inflightFrames.current.add(key);
      const url = seg.outputUrl;
      extractFrame(url, 'last')
        .then(async (dataUri) => {
          const { width, height } = useDirectorStore.getState().settings;
          try {
            return await cropImageToRenderSize(dataUri, width, height);
          } catch {
            return dataUri;
          }
        })
        .then((dataUri) => updateSegment(seg.id, { lastFrame: dataUri }))
        .catch((err) => console.warn('[Director] last-frame extract failed', err))
        .finally(() => inflightFrames.current.delete(key));
    }
  }, [segments, updateSegment]);

  // 3. Chained backfill: segment i's start image := segment i-1's last frame.
  //    Re-backfills when the source re-renders; if this segment already
  //    rendered against the OLD frame, flag the join stale (suggest re-render).
  useEffect(() => {
    segments.forEach((seg, i) => {
      if (!seg.chained || i === 0) return;
      const src = segments[i - 1];
      if (!src?.lastFrame) return;

      const sourceMoved = seg.sourceJobId !== undefined && seg.sourceJobId !== src.jobId;
      if (!seg.startImage || sourceMoved) {
        updateSegment(seg.id, {
          startImage: src.lastFrame,
          sourceJobId: src.jobId,
          anchorStale: sourceMoved && seg.status === 'done' ? true : seg.anchorStale,
        });
      }
    });
  }, [segments, updateSegment]);

  // 4. Render queue: while armed, submit the first pending segment as soon as
  //    it's ready; stop when a submit fails or nothing is pending.
  useEffect(() => {
    if (!queueActive || queueSubmitting.current) return;

    const busy = segments.some((s) => s.status === 'queued' || s.status === 'rendering');
    if (busy) return;

    const state = useDirectorStore.getState();
    const nextIdx = segments.findIndex(isPending);
    if (nextIdx === -1) {
      state.setQueueActive(false);
      return;
    }
    const next = segments[nextIdx];
    const blockers = segmentBlockers(next, nextIdx, state.globalPrompt);
    if (blockers.length > 0) {
      // Waiting on a frame extraction resolves itself; anything else is a
      // user-fixable dead end — disarm instead of spinning.
      const waitingOnChain =
        next.chained && nextIdx > 0 && segments[nextIdx - 1].status === 'done' && !next.startImage;
      if (!waitingOnChain) state.setQueueActive(false);
      return;
    }

    queueSubmitting.current = true;
    renderSegment(next.id)
      .then((ok) => {
        if (!ok) useDirectorStore.getState().setQueueActive(false);
      })
      .finally(() => {
        queueSubmitting.current = false;
      });
  }, [queueActive, segments, renderSegment]);
}
