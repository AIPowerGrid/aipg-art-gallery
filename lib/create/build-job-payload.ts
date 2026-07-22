/**
 * Shared video job-payload shaping — the single source of truth for the rules
 * that turn user-facing video settings into a `CreateJobRequest`. Both the
 * single-shot `useGeneration.generate()` path and the Director's `submitShot`
 * call into this so the two can't drift (dimension fitting, the "omit steps for
 * baked-sigma recipes" rule, the length/fps passthrough).
 *
 * Kept pure and dependency-light so it's trivially unit-testable.
 */
import { CreateJobRequest } from '@/types/models';

const VIDEO_CAP = 1280;
const VIDEO_FLOOR = 512;

/**
 * Clamp a video frame size into the grid's supported band and snap to a
 * 64-pixel grid. Some LTX recipes render at a halved base then 2x-upscale, which
 * requires 64-divisibility (32 would silently snap under the hood). If the
 * longest side exceeds the cap, both sides scale down together to preserve
 * aspect before snapping.
 */
export function fitVideoDimensions(
  width: number,
  height: number
): { width: number; height: number } {
  let w = width;
  let h = height;
  const longest = Math.max(w, h);
  if (longest > VIDEO_CAP) {
    const s = VIDEO_CAP / longest;
    w = Math.round(w * s);
    h = Math.round(h * s);
  }
  const fit = (v: number) =>
    Math.max(VIDEO_FLOOR, Math.min(VIDEO_CAP, Math.round(v / 64) * 64));
  return { width: fit(w), height: fit(h) };
}

export interface VideoJobParams {
  width: number;
  height: number;
  cfgScale: number;
  /** Frame count. */
  length: number;
  fps: number;
  seed?: string;
  /** Only sent when the recipe declares a steps band (LTX-2.3 Audio bakes sigmas → omit). */
  steps?: number;
  sampler?: string;
  scheduler?: string;
}

export interface VideoJobArgs {
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  /** Start frame (base64 data URI). Required — every Director shot is image-conditioned. */
  sourceImage: string;
  /** End frame (base64 data URI) — first-last-frame "fill-between" recipes only. */
  endImage?: string;
  public?: boolean;
  params: VideoJobParams;
}

/**
 * Build a `CreateJobRequest` for one image-conditioned video shot. Applies
 * dimension fitting, omits `steps` unless the caller supplied one, and passes
 * the optional end frame through for fill-between recipes.
 */
export function buildVideoJobPayload(args: VideoJobArgs): CreateJobRequest {
  const { width, height } = fitVideoDimensions(args.params.width, args.params.height);
  const p = args.params;

  return {
    modelId: args.modelId,
    prompt: args.prompt.trim(),
    negativePrompt: args.negativePrompt ?? '',
    nsfw: false,
    public: args.public ?? true,
    mediaType: 'video',
    sourceProcessing: 'img2video',
    sourceImage: args.sourceImage,
    ...(args.endImage ? { sourceImageEnd: args.endImage } : {}),
    params: {
      width,
      height,
      cfgScale: p.cfgScale,
      sampler: p.sampler ?? 'euler',
      scheduler: p.scheduler ?? 'normal',
      length: p.length,
      fps: p.fps,
      n: 1,
      ...(p.steps ? { steps: p.steps } : {}),
      ...(p.seed ? { seed: p.seed } : {}),
    },
  };
}
