/**
 * Director v2 — the merged Storyboard + Director model.
 *
 * One timeline of contiguous, image-conditioned segments. Every segment
 * renders as its OWN grid job against the live "LTX Director 2.0" recipe
 * (image keyframe at frame 0 + one prompt + optional audio slice), which is
 * why a single segment is capped at the recipe's 8s clamp while the timeline
 * as a whole is unbounded: N segments = N jobs = N × 8s max.
 *
 * A segment either CHAINS (starts from the previous segment's extracted last
 * frame — seamless join) or carries its own uploaded start image (hard cut).
 */

export const DIRECTOR_FPS = 24;
export const MIN_SEGMENT_SECONDS = 1;
/** Per-JOB cap from the recipe's seconds clamp [1,8]. The timeline total is uncapped. */
export const MAX_SEGMENT_SECONDS = 8;
export const MIN_SEGMENT_FRAMES = MIN_SEGMENT_SECONDS * DIRECTOR_FPS;
export const MAX_SEGMENT_FRAMES = MAX_SEGMENT_SECONDS * DIRECTOR_FPS;

export type SegmentStatus = 'idle' | 'queued' | 'rendering' | 'done' | 'error';

export interface DirectorSegment {
  /** Stable identity — anchors chaining across reorders. */
  id: string;
  /** Per-segment prompt (what changes in this stretch of the video). */
  prompt: string;
  /** Clip length in frames at 24fps (24..192). */
  lengthFrames: number;
  /** true = start from the previous segment's last frame (seamless join). */
  chained: boolean;
  /** Start image as a data URI. For chained segments this is backfilled from
   *  the previous segment's extracted last frame. */
  startImage: string | null;
  /** Original filename of an uploaded start image (label only). */
  startImageName?: string;
  /** Image-guide strength 0..1. */
  strength: number;
  /** Per-segment seed override (empty = the shared/locked seed or random). */
  seed?: string;

  /** Per-segment negative prompt (falls back to the shared settings one). */
  negativePrompt?: string;

  // --- render state ---
  jobId?: string;
  /** Which recipe the current jobId was submitted against. */
  modelUsed?: string;
  /** Guard: this segment already auto-resubmitted via the fallback recipe. */
  autoFellBack?: boolean;
  /** The previous segment's jobId at the time this segment's startImage was
   *  backfilled — lets us detect a re-rendered source (stale join). */
  sourceJobId?: string;
  status: SegmentStatus;
  /** Live worker progress 0-100 while rendering. */
  progress?: number;
  outputUrl?: string;
  /** Extracted last frame (data URI) — feeds the next chained segment. */
  lastFrame?: string | null;
  error?: string;
  /** Rendered before its chained source was re-rendered — join may no longer match. */
  anchorStale?: boolean;
}

/** One window into the audio file. Slices are laid CONTIGUOUSLY on the
 *  timeline starting at second 0 (in array order); each is independently
 *  cropable/expandable, and splitting a slice adds a breakpoint. */
export interface DirectorAudioSlice {
  id: string;
  /** Window into the FILE, in seconds. */
  trimStartSec: number;
  trimEndSec: number;
}

/** One uploaded audio track laid over the timeline as an ordered list of
 *  slices; each segment's job receives the file plus trimStart offsets that
 *  window exactly what that stretch of the timeline should hear. */
export interface DirectorAudio {
  /** Key into the IndexedDB track store — lets audioB64 survive reloads. */
  id?: string;
  /** Data URI (WAV/MP3). Stripped from localStorage; restored from IndexedDB. */
  audioB64: string;
  fileName: string;
  /** Real decoded duration of the uploaded file (seconds). */
  durationSec?: number;
  /** Ordered slices laid from timeline 0. Absent = whole file (or the legacy
   *  trim window below) as one slice. */
  slices?: DirectorAudioSlice[];
  /** Legacy single crop window (pre-slices) — migrated by audioSlices(). */
  trimStartSec?: number;
  trimEndSec?: number;
}

/** Normalized slice list. Falls back to the legacy trim window, then to the
 *  whole file. Empty when the duration was never decoded (no crop support). */
export function audioSlices(audio: DirectorAudio): DirectorAudioSlice[] {
  if (audio.slices && audio.slices.length > 0) return audio.slices;
  if (audio.durationSec === undefined) return [];
  return [
    {
      id: 'full',
      trimStartSec: audio.trimStartSec ?? 0,
      trimEndSec: audio.trimEndSec ?? audio.durationSec,
    },
  ];
}

export interface DirectorSettings {
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  negativePrompt: string;
  /** Reuse ONE seed for every segment — with chaining this keeps the look
   *  identical across joins (the "no visible cut" ingredient). */
  lockSeed: boolean;
  /** The shared seed when lockSeed is on (auto-generated on first render). */
  seed?: string;
}

/** Persisted panel geometry for the console's draggable dividers. */
export interface DirectorPanelSizes {
  /** Right rail width in px (console layout). */
  railWidth: number;
  /** Bottom timeline section height in px. */
  timelineHeight: number;
  /** Timeline zoom: pixels per second. */
  pxPerSec: number;
  /** Experimental arrangement: 'console' = stage + right rail (default);
   *  'rows' = controls band on top, preview middle, timeline bottom. */
  layout?: 'console' | 'rows';
  /** Top controls band height in px (rows layout). */
  controlsHeight?: number;
}

export const DEFAULT_DIRECTOR_SETTINGS: DirectorSettings = {
  width: 768,
  height: 512,
  steps: 8,
  cfgScale: 1,
  negativePrompt: '',
  lockSeed: true,
};

export const DEFAULT_PANEL_SIZES: DirectorPanelSizes = {
  railWidth: 336,
  timelineHeight: 190,
  pxPerSec: 88,
  layout: 'console',
  controlsHeight: 280,
};

export function framesToSeconds(frames: number): number {
  return frames / DIRECTOR_FPS;
}

export function secondsToFrames(seconds: number): number {
  return Math.round(seconds * DIRECTOR_FPS);
}

export function clampSegmentFrames(frames: number): number {
  return Math.min(MAX_SEGMENT_FRAMES, Math.max(MIN_SEGMENT_FRAMES, Math.round(frames)));
}

/** Frame offset of each segment from the start of the assembled timeline. */
export function segmentOffsets(segments: DirectorSegment[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const s of segments) {
    offsets.push(acc);
    acc += s.lengthFrames;
  }
  return offsets;
}

export function totalFrames(segments: DirectorSegment[]): number {
  return segments.reduce((acc, s) => acc + s.lengthFrames, 0);
}
