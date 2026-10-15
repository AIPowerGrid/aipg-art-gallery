import type { DurableVideoRequest } from "@/types/models";

export const MAX_DURABLE_VIDEO_FRAMES = 721;

export function maxDurableVideoFrames(model: DurableVideoRequest["model"]): number {
  return model === "LTX-2.5 Distilled BF16" ? MAX_DURABLE_VIDEO_FRAMES : 337;
}

export function validDurableVideoFrames(model: DurableVideoRequest["model"], frames: number): boolean {
  return Number.isSafeInteger(frames) && frames >= 9 && frames <= maxDurableVideoFrames(model) && frames % 8 === 1;
}
