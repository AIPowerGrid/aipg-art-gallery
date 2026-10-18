import { DurableVideoRequest, DurableVideoSubmission } from "@/types/models";
import { DirectorSegment, DirectorSettings } from "@/lib/types/director";
import { maxDurableVideoFrames, validDurableVideoFrames } from "./durable-video-limits";

interface DurableSegmentArgs {
  model: DurableVideoRequest["model"];
  segment: Pick<DirectorSegment, "prompt" | "negativePrompt">;
  globalPrompt: string;
  settings: DirectorSettings;
  /** Exact output count, never inferred or rounded from a legacy duration. */
  frames: number;
  maxCostMicroUSD: number;
  seed?: number;
  /** Explicit guides only; an old segment portrait is never inserted implicitly. */
  keyframes?: NonNullable<DurableVideoRequest["keyframes"]>;
  /** Already prepared exact-duration stereo 48k WAV and optional normalized MP4. */
  source?: { audio: string; video?: string; motionStrength?: number };
}

function requireInline(value: string, mime: string): void {
  const prefix = `data:${mime};base64,`;
  if (!value.startsWith(prefix) || value.length <= prefix.length) {
    throw new Error(`A prepared inline ${mime} source is required.`);
  }
}

/** Pure preparation. Core still validates actual media, admission and charges. */
export function buildDurableSegmentPayload(args: DurableSegmentArgs): DurableVideoSubmission {
  const { segment, settings, frames, source } = args;
  if (args.model !== "LTX-2.5 Distilled BF16" && args.model !== "LTX-2.5 Distilled NVFP4") {
    throw new Error("Select a reviewed LTX-2.5 Distilled model.");
  }
  if (!validDurableVideoFrames(args.model, frames)) {
    throw new Error(`Choose an exact frame count from 9 to ${maxDurableVideoFrames(args.model)} in steps of 8.`);
  }
  if (!Number.isSafeInteger(args.maxCostMicroUSD) || args.maxCostMicroUSD <= 0) {
    throw new Error("A positive quoted video cost ceiling is required.");
  }
  const videoSource = source?.video !== undefined;
  const multiple = videoSource ? 64 : 32;
  const { width, height } = settings;
  if (![width, height].every((v) => Number.isSafeInteger(v) && v >= 256 && v <= 960 && v % multiple === 0) || width * height > 960 * 544) {
    throw new Error(`Video dimensions must fit the model limit and be multiples of ${multiple}.`);
  }
  if (!Number.isSafeInteger(settings.steps) || settings.steps < 4 || settings.steps > 40 || !Number.isFinite(settings.cfgScale) || settings.cfgScale < 1 || settings.cfgScale > 5) {
    throw new Error("Video sampling settings are outside the model limit.");
  }
  if (args.seed !== undefined && (!Number.isSafeInteger(args.seed) || args.seed < 0)) {
    throw new Error("The video seed must be a non-negative safe integer.");
  }
  const prompt = [args.globalPrompt.trim(), segment.prompt.trim()].filter(Boolean).join(". ");
  const negative = segment.negativePrompt?.trim() || settings.negativePrompt.trim();
  if (!prompt || Array.from(prompt).length > 8000 || Array.from(negative).length > 8000) {
    throw new Error("A video prompt of at most 8000 characters is required.");
  }
  const pins = args.keyframes ?? [];
  if (pins.length > 16) {
    throw new Error("A video request allows at most 16 image guides.");
  }
  if (videoSource && (pins.length > 1 || (pins.length === 1 && pins[0].frame !== 0))) {
    throw new Error("Video references allow only one explicit opening-image guide.");
  }
  let previous = -1;
  for (const pin of pins) {
    if (!Number.isSafeInteger(pin.frame) || pin.frame <= previous || pin.frame >= frames || !Number.isFinite(pin.strength) || pin.strength < 0 || pin.strength > 1) {
      throw new Error("Image guides must have distinct ordered frames and bounded strength.");
    }
    if (!/^data:image\/(png|jpeg|webp);base64,.+/.test(pin.image)) {
      throw new Error("An inline PNG, JPEG or WebP image guide is required.");
    }
    previous = pin.frame;
  }
  if (source) {
    requireInline(source.audio, "audio/wav");
    if (videoSource) requireInline(source.video!, "video/mp4");
    if (source.motionStrength !== undefined && (!videoSource || !Number.isFinite(source.motionStrength) || source.motionStrength <= 0 || source.motionStrength > 1)) {
      throw new Error("Motion strength requires a video source and must be greater than zero and at most one.");
    }
  }
  return {
    video: {
      model: args.model, prompt, negative_prompt: negative, n: 1,
      size: `${width}x${height}`, frames, fps: 24, audio: true,
      steps: settings.steps, cfg_scale: settings.cfgScale,
      max_cost_micro_usd: args.maxCostMicroUSD,
      ...(args.seed !== undefined ? { seed: args.seed } : {}),
      ...(pins.length ? { keyframes: pins.map((pin) => ({ ...pin })) } : {}),
      ...(source ? { reference_audio: source.audio } : {}),
      ...(videoSource ? { reference_video: source!.video } : {}),
      ...(source?.motionStrength !== undefined ? { guide_strength: source.motionStrength } : {}),
    },
  };
}
