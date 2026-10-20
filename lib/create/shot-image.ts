// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import { GridCreditQuote } from "@/lib/api";
import { CreateJobRequest, GalleryModel } from "@/types/models";

export const DEFAULT_SHOT_MODEL = "MOSS Image SFT BF16";

export function shotImageSize(videoSize: string) {
  const match = /^(\d+)x(\d+)$/.exec(videoSize);
  if (!match) throw new Error("Choose a video resolution.");
  const [width, height] = [Number(match[1]), Number(match[2])];
  return width === height
    ? { width: 1024, height: 1024 }
    : width > height
      ? { width: 1024, height: 576 }
      : { width: 576, height: 1024 };
}

export function shotModelAvailable(
  model: GalleryModel | undefined,
  reference: boolean,
  size: string,
) {
  if (
    !model ||
    model.type !== "image" ||
    model.status !== "online" ||
    !Number.isSafeInteger(model.onlineWorkers) ||
    model.onlineWorkers < 1 ||
    !model.capabilities?.includes(reference ? "img2img" : "txt2img")
  )
    return false;
  const dimensions = shotImageSize(size);
  return (Object.keys(dimensions) as Array<keyof typeof dimensions>).every(
    (axis) => {
      const value = dimensions[axis];
      const limit = model.limits?.[axis];
      return (
        !limit ||
        (value >= limit.min &&
          value <= limit.max &&
          (!limit.step || (value - limit.min) % limit.step === 0))
      );
    },
  );
}

export function shotImageCeiling(
  quote: GridCreditQuote | null,
  owner: string | undefined,
  model: string,
): number | null {
  const estimate = quote?.estimate;
  return owner &&
    quote?.account_id === owner &&
    quote.charging_enabled &&
    estimate?.model === model &&
    estimate.modality === "image" &&
    estimate.n === 1 &&
    estimate.priced &&
    Number.isSafeInteger(estimate.cost_micro) &&
    estimate.cost_micro! > 0
    ? estimate.cost_micro
    : null;
}

export function buildShotImage(args: {
  model: GalleryModel;
  prompt: string;
  reference: string | null;
  videoSize: string;
  ceiling: number;
}): CreateJobRequest {
  if (
    !shotModelAvailable(args.model, Boolean(args.reference), args.videoSize) ||
    !args.prompt.trim() ||
    args.prompt.length > 4000 ||
    !Number.isSafeInteger(args.ceiling) ||
    args.ceiling <= 0
  ) {
    throw new Error(
      "Choose an available image model, a scene prompt and a current quote.",
    );
  }
  if (
    args.reference &&
    (!/^data:image\/(png|jpeg|webp);base64,.+/.test(args.reference) ||
      args.reference.length > 14 * 1024 * 1024)
  ) {
    throw new Error("Choose a PNG, JPEG or WebP reference of at most 10 MB.");
  }
  const defaults = args.model.defaults;
  return {
    modelId: args.model.id,
    prompt: args.prompt.trim(),
    public: false,
    nsfw: false,
    mediaType: "image",
    sourceProcessing: args.reference ? "img2img" : "txt2img",
    maxCostMicroUSD: args.ceiling,
    ...(args.reference ? { sourceImage: args.reference } : {}),
    params: {
      ...shotImageSize(args.videoSize),
      n: 1,
      steps: defaults.steps,
      cfgScale: defaults.cfgScale,
      sampler: defaults.sampler,
      scheduler: defaults.scheduler,
    },
  };
}
