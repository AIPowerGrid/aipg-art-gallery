// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import { DEFAULT_DIRECTOR_SETTINGS } from "@/lib/types/director";
import { buildDurableSegmentPayload } from "../durable-director-payload";
import { durableVideoResolutions, durableVideoSizeForMode } from "../durable-video-resolutions";

it.each(["text", "audio", "video"] as const)("every %s preset fits the unchanged payload geometry contract", (mode) => {
  const presets = durableVideoResolutions(mode);
  expect(presets).toHaveLength(6);
  expect(new Set(presets.map((preset) => preset.size)).size).toBe(6);
  for (const { size } of presets) {
    const [width, height] = size.split("x").map(Number);
    for (const model of ["LTX-2.5 Distilled BF16", "LTX-2.5 Distilled NVFP4"] as const) {
      const payload = buildDurableSegmentPayload({
        model, frames: 81, maxCostMicroUSD: 67500,
        segment: { prompt: "A camera pans across a landscape" }, globalPrompt: "",
        settings: { ...DEFAULT_DIRECTOR_SETTINGS, width, height },
        ...(mode !== "text" ? { source: { audio: "data:audio/wav;base64,YQ==",
          ...(mode === "video" ? { video: "data:video/mp4;base64,dg==" } : {}) } } : {}),
      });
      expect(payload.video.size).toBe(size);
    }
  }
});

it.each(durableVideoResolutions("text"))("round-trips $size through motion alignment without losing orientation", ({size, shape}) => {
  const motion = durableVideoSizeForMode(size, "video");
  expect(durableVideoResolutions("video")).toContainEqual({ size: motion, shape });
  expect(durableVideoSizeForMode(motion, "audio")).toBe(size);
  expect(durableVideoSizeForMode(motion, "text")).toBe(size);
});

it("does not silently replace an unknown size with a default", () => {
  expect(durableVideoSizeForMode("1920x1080", "video")).toBe("1920x1080");
});
