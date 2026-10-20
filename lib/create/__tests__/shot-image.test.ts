// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import {
  buildShotImage,
  DEFAULT_SHOT_MODEL,
  shotImageCeiling,
  shotImageSize,
  shotModelAvailable,
} from "../shot-image";
import { GalleryModel } from "@/types/models";
import { GridCreditQuote } from "@/lib/api";

export const model: GalleryModel = {
  id: "MOSS Image SFT BF16",
  displayName: "MOSS Image SFT",
  type: "image",
  status: "online",
  onlineWorkers: 1,
  capabilities: ["txt2img", "img2img"],
  defaults: { steps: 50, cfgScale: 3, sampler: "euler", scheduler: "simple" },
  limits: {
    width: { min: 512, max: 1344, step: 64 },
    height: { min: 512, max: 1344, step: 64 },
  },
  tags: [],
  description: "",
  samplers: [],
  schedulers: [],
  queueLength: 0,
  estimatedWaitSeconds: 0,
  onChain: true,
};
export const quote = {
  account_id: "owner",
  charging_enabled: true,
  estimate: {
    model: model.id,
    modality: "image",
    n: 1,
    priced: true,
    cost_micro: 5000,
    balance_sufficient: true,
  },
} as GridCreditQuote;

it("composes a private single image with an explicit ceiling and no video fields", () => {
  expect(DEFAULT_SHOT_MODEL).toBe("MOSS Image SFT BF16");
  const payload = buildShotImage({
    model,
    prompt: "a cabin scene",
    reference: "data:image/png;base64,YQ==",
    videoSize: "960x544",
    ceiling: 5000,
  });
  expect(payload).toMatchObject({
    modelId: model.id,
    maxCostMicroUSD: 5000,
    public: false,
    mediaType: "image",
    sourceProcessing: "img2img",
    sourceImage: "data:image/png;base64,YQ==",
    params: {
      width: 1024,
      height: 576,
      n: 1,
      steps: 50,
      cfgScale: 3,
      sampler: "euler",
      scheduler: "simple",
    },
  });
  expect(payload).not.toHaveProperty("video");
  expect(
    buildShotImage({
      model,
      prompt: "scene",
      reference: null,
      videoSize: "512x512",
      ceiling: 5000,
    }),
  ).not.toHaveProperty("sourceImage");
});
it.each(["960x544", "544x960", "704x704"])(
  "uses explicit supported shot-image geometry for %s",
  (size) => {
    const dimensions = shotImageSize(size);
    expect(dimensions.width % 64).toBe(0);
    expect(dimensions.height % 64).toBe(0);
    expect(shotModelAvailable(model, true, size)).toBe(true);
  },
);
it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  "rejects unsafe image ceiling %s",
  (ceiling) => {
    expect(() =>
      buildShotImage({
        model,
        prompt: "scene",
        reference: null,
        videoSize: "512x512",
        ceiling,
      }),
    ).toThrow();
  },
);
it("never substitutes an offline or non-editing model", () => {
  for (const changed of [
    { ...model, status: "offline" as const },
    { ...model, onlineWorkers: 0 },
    { ...model, onlineWorkers: NaN },
    { ...model, capabilities: ["txt2img" as const] },
  ]) {
    expect(shotModelAvailable(changed, true, "960x544")).toBe(false);
  }
  expect(
    shotModelAvailable(
      { ...model, limits: { width: { min: 512, max: 768, step: 64 } } },
      false,
      "960x544",
    ),
  ).toBe(false);
});
it("requires a paid, owner/model/cardinality-bound quote", () => {
  expect(shotImageCeiling(quote, "owner", model.id)).toBe(5000);
  expect(shotImageCeiling(quote, "other", model.id)).toBeNull();
  expect(shotImageCeiling(quote, "owner", "another-model")).toBeNull();
  expect(
    shotImageCeiling({ ...quote, charging_enabled: false }, "owner", model.id),
  ).toBeNull();
  for (const changes of [
    { n: 2 },
    { cost_micro: 0 },
    { modality: "video" as const },
    { priced: false },
  ]) {
    expect(
      shotImageCeiling(
        { ...quote, estimate: { ...quote.estimate, ...changes } },
        "owner",
        model.id,
      ),
    ).toBeNull();
  }
});
