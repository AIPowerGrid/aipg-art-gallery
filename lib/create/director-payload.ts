/**
 * Director v2 payload builder — ONE segment → ONE grid job against the live
 * "LTX Director 2.0" recipe.
 *
 * Wire contract (live-verified against the grid; see
 * ~/ltx-directory-delivery/WEB_DIRECTOR_DELIVERY.md):
 *  - `timelineData` is the LTXDirector editor-state JSON. Keyframe images and
 *    audio ride INLINE as base64 (`imageB64` / `audioB64`) — no upload step.
 *  - `segment_lengths` is FRAMES at 24fps (not seconds, whatever the API guide
 *    says) and must pair 1:1 with `local_prompts`.
 *  - The timeline's `global_prompt` stays empty — the top-level `prompt` wins.
 *  - `normalDurationFrames` is frames+1.
 *  - Audio segments MUST carry a truthy `audioFile` or the node's inpaint mask
 *    treats the whole track as a gap and regenerates over the upload; the
 *    worker's file lookup fails and falls back to decoding `audioB64`.
 *  - Audio `trimStart` (frames) windows into the source file: segment N gets
 *    the full track + trimStart = its offset on the assembled timeline, so its
 *    job hears exactly its slice.
 *
 * Kept pure for unit testing.
 */

import { CreateJobRequest } from '@/types/models';
import {
  DirectorSegment,
  DirectorSettings,
  DirectorAudio,
  DIRECTOR_FPS,
  audioSlices,
} from '@/lib/types/director';

export const DIRECTOR_MODEL_ID = 'LTX Director 2.0';
/** Live i2v recipe used as an automatic fallback when the Director recipe is
 *  offline and the timeline has no audio track (plain image→video+audio). */
export const FALLBACK_MODEL_ID = 'LTX-2.3 Audio';

/** Grid total-request budget is 25MB; leave headroom for the JSON around it. */
export const MAX_TIMELINE_BYTES = 24 * 1024 * 1024;

export interface BuildSegmentPayloadArgs {
  segment: DirectorSegment;
  /** The segment's frame offset on the assembled timeline (for audio slicing). */
  offsetFrames: number;
  globalPrompt: string;
  settings: DirectorSettings;
  /** All audio tracks; every track contributes its overlapping slices. */
  audios?: DirectorAudio[];
  walletAddress?: string;
  /** Resolved seed for this job (segment override / locked shared seed). */
  seed?: string;
}

/** The serialized single-segment LTXDirector timeline for one job. */
export function buildSegmentTimeline(args: BuildSegmentPayloadArgs): string {
  const { segment, offsetFrames, audios } = args;
  const frames = segment.lengthFrames;

  const audioSegments = (audios ?? [])
    .filter((a) => a.audioB64)
    .flatMap((a) => buildAudioSegments(a, offsetFrames, frames));

  return JSON.stringify({
    mainTrackEnabled: true,
    audioTrackEnabled: true,
    motionTrackEnabled: false,
    propHeight: 90,
    globalPropHeight: 60,
    showFilenames: false,
    overrideAudio: false,
    inpaint_audio: true,
    global_prompt: '',
    retake_global_prompt: '',
    retakeMode: false,
    retakeStart: 24,
    retakeLength: 48,
    retakePrompt: '',
    retakeStrength: 1,
    retakeVideo: null,
    normalStartFrame: 0,
    normalDurationFrames: frames + 1,
    segments: [
      {
        id: segment.id,
        start: 0,
        length: frames,
        prompt: segment.prompt,
        type: 'image',
        imageFile: '',
        fileName: segment.startImageName ?? '',
        imageB64: segment.startImage ?? '',
        guideStrength: segment.strength,
      },
    ],
    motionSegments: [],
    audioSegments,
  });
}

/**
 * Audio for ONE video segment's job: intersect the segment's timeline window
 * [offsetFrames, offsetFrames+frames) with the track's contiguous slice layout
 * and emit one audioSegment per overlap (start is RELATIVE to this job's clip;
 * trimStart windows into the file). With no decoded duration (legacy uploads)
 * the whole file rides along with the plain offset, as before.
 */
export function buildAudioSegments(
  audio: DirectorAudio,
  offsetFrames: number,
  frames: number
): Array<{
  audioB64: string;
  audioFile: string;
  fileName: string;
  start: number;
  length: number;
  trimStart: number;
}> {
  const base = {
    audioB64: audio.audioB64,
    // Truthy audioFile is REQUIRED (inpaint-mask gotcha, see header). Prefix
    // with the track id so two tracks with the same filename stay distinct in
    // the worker's file lookup (a miss just falls back to decoding audioB64).
    audioFile: audio.id ? `${audio.id.slice(0, 8)}_${audio.fileName || 'audio.wav'}` : audio.fileName || 'audio.wav',
    fileName: audio.fileName,
  };
  const slices = audioSlices(audio);
  if (slices.length === 0) {
    return [{ ...base, start: 0, length: frames, trimStart: offsetFrames }];
  }
  const out: Array<{
    audioB64: string;
    audioFile: string;
    fileName: string;
    start: number;
    length: number;
    trimStart: number;
  }> = [];
  const segStart = offsetFrames;
  const segEnd = offsetFrames + frames;
  let cursor = 0; // slice's start position on the assembled timeline (frames)
  for (const slice of slices) {
    const sliceFrames = Math.max(0, Math.round((slice.trimEndSec - slice.trimStartSec) * DIRECTOR_FPS));
    const overlapStart = Math.max(segStart, cursor);
    const overlapEnd = Math.min(segEnd, cursor + sliceFrames);
    if (overlapEnd > overlapStart) {
      out.push({
        ...base,
        start: overlapStart - segStart,
        length: overlapEnd - overlapStart,
        trimStart: Math.round(slice.trimStartSec * DIRECTOR_FPS) + (overlapStart - cursor),
      });
    }
    cursor += sliceFrames;
    if (cursor >= segEnd) break;
  }
  return out;
}

export function buildSegmentPayload(args: BuildSegmentPayloadArgs): CreateJobRequest {
  const { segment, globalPrompt, settings, walletAddress, seed } = args;
  const frames = segment.lengthFrames;
  const timelineData = buildSegmentTimeline(args);
  const segPrompt = segment.prompt.trim();

  return {
    modelId: DIRECTOR_MODEL_ID,
    prompt: globalPrompt.trim() || segPrompt || 'video',
    negativePrompt: segment.negativePrompt?.trim() || settings.negativePrompt,
    nsfw: false,
    public: false,
    walletAddress,
    mediaType: 'video',
    sourceProcessing: 'txt2video',
    timelineData,
    // Relay pair: counts must match, so both or neither. A single segment with
    // no own prompt just runs on the global prompt.
    ...(segPrompt ? { localPrompts: segPrompt, segmentLengths: String(frames) } : {}),
    guideStrength: segment.strength.toFixed(2),
    params: {
      width: settings.width,
      height: settings.height,
      steps: settings.steps,
      cfgScale: settings.cfgScale,
      sampler: 'euler',
      scheduler: 'normal',
      length: frames,
      fps: DIRECTOR_FPS,
      n: 1,
      ...(seed ? { seed } : {}),
    },
  };
}

/**
 * The same segment compiled for the plain LTX-2.3 Audio i2v recipe — used when
 * the grid reports the Director recipe unavailable. No timeline/relay support,
 * so the global and segment prompts merge into one; audio is NOT possible on
 * this path (callers must gate on that).
 */
export function buildSegmentFallbackPayload(args: BuildSegmentPayloadArgs): CreateJobRequest {
  const { segment, globalPrompt, settings, walletAddress, seed } = args;
  const prompt = [globalPrompt.trim(), segment.prompt.trim()].filter(Boolean).join('. ') || 'video';
  return {
    modelId: FALLBACK_MODEL_ID,
    prompt,
    negativePrompt: segment.negativePrompt?.trim() || settings.negativePrompt,
    nsfw: false,
    public: false,
    walletAddress,
    mediaType: 'video',
    sourceProcessing: 'img2video',
    sourceImage: segment.startImage ?? undefined,
    params: {
      width: settings.width,
      height: settings.height,
      cfgScale: settings.cfgScale,
      length: segment.lengthFrames,
      fps: DIRECTOR_FPS,
      n: 1,
      ...(seed ? { seed } : {}),
    },
  };
}

/** True when a submit error means "this model/recipe isn't on the grid". */
export function isModelUnavailableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not available|unknown model|404/i.test(msg);
}

/** Validation reasons a segment can't render yet (empty array = ready). */
export function segmentBlockers(
  segment: DirectorSegment,
  index: number,
  globalPrompt: string
): string[] {
  const blockers: string[] = [];
  if (!segment.startImage) {
    blockers.push(
      segment.chained && index > 0
        ? 'waiting for the previous segment’s last frame'
        : 'needs a start image'
    );
  }
  if (!globalPrompt.trim() && !segment.prompt.trim()) {
    blockers.push('needs a prompt (segment or global)');
  }
  return blockers;
}

export function randomSeed(): string {
  return String(Math.floor(Math.random() * 2_147_483_646) + 1);
}
