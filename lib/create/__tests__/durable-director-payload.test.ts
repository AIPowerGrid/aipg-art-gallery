import { buildDurableSegmentPayload } from "../durable-director-payload";
import { DEFAULT_DIRECTOR_SETTINGS } from "@/lib/types/director";

const base = {
  model: "LTX-2.5 Distilled BF16" as const,
  segment: { prompt: "camera pans", negativePrompt: "no text", startImage: "unused-legacy-portrait", lengthFrames: 96 },
  globalPrompt: "coastal landscape", settings: { ...DEFAULT_DIRECTOR_SETTINGS },
  frames: 81, maxCostMicroUSD: 80000,
};
const audio = "data:audio/wav;base64,YXVkaW8=";
const video = "data:video/mp4;base64,dmlkZW8=";
const image = "data:image/png;base64,aW1hZ2U=";

it.each(["LTX-2.5 Distilled BF16", "LTX-2.5 Distilled NVFP4"] as const)("prepares %s without legacy timeline or implicit image", (model) => {
  const payload = buildDurableSegmentPayload({ ...base, model, seed: 0 });
  expect(payload.video).toMatchObject({ model, prompt: "coastal landscape. camera pans", negative_prompt: "no text", frames: 81, fps: 24, max_cost_micro_usd: 80000, seed: 0 });
  expect(payload.video.keyframes).toBeUndefined();
  expect(JSON.stringify(payload)).not.toContain("unused-legacy-portrait");
  expect(JSON.stringify(payload)).not.toContain("timeline");
  expect(base.segment.lengthFrames).toBe(96);
});

it("copies only explicitly supplied timed-image guides", () => {
  const pins = [{ image, frame: 0, strength: 0.8 }, { image, frame: 80, strength: 0.5 }];
  const p = buildDurableSegmentPayload({ ...base, keyframes: pins });
  expect(p.video.keyframes).toEqual(pins);
  pins[0].strength = 0.1;
  expect(p.video.keyframes![0].strength).toBe(0.8);
});

it.each(["png", "jpeg", "webp"])("preserves an inline %s opening image", (format) => {
  const pin = { image: `data:image/${format};base64,aW1hZ2U=`, frame: 0, strength: 1 };
  expect(buildDurableSegmentPayload({ ...base, keyframes: [pin] }).video.keyframes).toEqual([pin]);
});

it.each(["data:image/svg+xml;base64,PHN2Zy8+", "https://example.test/image.webp"])("rejects unsupported guide %s", (image) => {
  expect(() => buildDurableSegmentPayload({ ...base, keyframes: [{ image, frame: 0, strength: 1 }] })).toThrow("inline PNG, JPEG or WebP");
});

it("preserves prepared audio without reusing raw legacy timeline slices", () => {
  expect(buildDurableSegmentPayload({ ...base, source: { audio } }).video.reference_audio).toBe(audio);
});

it("keeps video/audio controls separate from an optional opening image", () => {
  const p = buildDurableSegmentPayload({ ...base, source: { audio, video, motionStrength: 0.85 } });
  expect(p.video).toMatchObject({ reference_video: video, reference_audio: audio, guide_strength: 0.85 });
  expect(p.video.keyframes).toBeUndefined();
});

it.each([0, 8, 80, 96, 338, 81.5, Number.NaN])("rejects frame count %s instead of rounding it", (frames) => {
  expect(() => buildDurableSegmentPayload({ ...base, frames })).toThrow("exact frame count");
});

it.each([385, 433, 481])("preserves a longer BF16 clip of %s frames", (frames) => {
  const payload = buildDurableSegmentPayload({ ...base, frames, maxCostMicroUSD: 400834 });
  expect(payload.video.frames).toBe(frames);
  expect(payload.video.max_cost_micro_usd).toBe(400834);
  expect(() => buildDurableSegmentPayload({ ...base, model: "LTX-2.5 Distilled NVFP4", frames })).toThrow("exact frame count");
});

it.each([480, 482, 489])("rejects invalid or over-limit long clips at %s frames", (frames) => {
  expect(() => buildDurableSegmentPayload({ ...base, frames })).toThrow("exact frame count");
});

it("rejects 32-aligned but not 64-aligned reference-video geometry", () => {
  const settings = { ...base.settings, width: 960, height: 544 };
  expect(() => buildDurableSegmentPayload({ ...base, settings })).not.toThrow();
  expect(() => buildDurableSegmentPayload({ ...base, settings, source: { audio, video } })).toThrow("multiples of 64");
});

it.each([{ keyframes: [] }, { keyframes: [{ image, frame: 0, strength: 1 }] }])("accepts only explicit opening-image conditioning with motion", ({ keyframes }) => {
  expect(() => buildDurableSegmentPayload({ ...base, keyframes, source: { audio, video } })).not.toThrow();
});

it("rejects later/two-frame pins on the reference-video path", () => {
  for (const keyframes of [[{ image, frame: 8, strength: 1 }], [{ image, frame: 0, strength: 1 }, { image, frame: 80, strength: 1 }]]) {
    expect(() => buildDurableSegmentPayload({ ...base, keyframes, source: { audio, video } })).toThrow("opening-image guide");
  }
});

it("rejects unordered, repeated or out-of-clip guides", () => {
  for (const frames of [[8, 0], [0, 0], [-1], [81]]) {
    expect(() => buildDurableSegmentPayload({ ...base, keyframes: frames.map((frame) => ({ image, frame, strength: 1 })) })).toThrow("distinct ordered");
  }
});

it("rejects raw/unprepared sound and video-only input", () => {
  expect(() => buildDurableSegmentPayload({ ...base, source: { audio: "data:audio/mp3;base64,YQ==" } })).toThrow("audio/wav");
  expect(() => buildDurableSegmentPayload({ ...base, source: { audio: "", video } })).toThrow("audio/wav");
});

it("never ignores motion strength on an audio-only request", () => {
  expect(() => buildDurableSegmentPayload({ ...base, source: { audio, motionStrength: 0.5 } })).toThrow("requires a video source");
});

it.each([0, -1, 0.1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("rejects invalid ceiling %s", (maxCostMicroUSD) => {
  expect(() => buildDurableSegmentPayload({ ...base, maxCostMicroUSD })).toThrow("positive quoted");
});

it.each([-1, 0.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects invalid seed %s", (seed) => {
  expect(() => buildDurableSegmentPayload({ ...base, seed })).toThrow("safe integer");
});

it("rejects invalid geometry, sampling and overlong input rather than silently changing it", () => {
  expect(() => buildDurableSegmentPayload({ ...base, settings: { ...base.settings, width: 1024 } })).toThrow("dimensions");
  expect(() => buildDurableSegmentPayload({ ...base, settings: { ...base.settings, width: 960, height: 960 } })).toThrow("dimensions");
  expect(() => buildDurableSegmentPayload({ ...base, settings: { ...base.settings, steps: 41 } })).toThrow("sampling");
  expect(() => buildDurableSegmentPayload({ ...base, settings: { ...base.settings, cfgScale: Number.NaN } })).toThrow("sampling");
  expect(() => buildDurableSegmentPayload({ ...base, globalPrompt: "", segment: { prompt: "" } })).toThrow("prompt");
  expect(() => buildDurableSegmentPayload({ ...base, globalPrompt: "x".repeat(8001) })).toThrow("prompt");
  expect(() => buildDurableSegmentPayload({ ...base, keyframes: Array.from({ length: 17 }, (_, frame) => ({ image, frame, strength: 1 })) })).toThrow("at most 16");
});
