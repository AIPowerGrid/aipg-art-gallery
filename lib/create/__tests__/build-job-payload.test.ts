import { fitVideoDimensions, buildVideoJobPayload } from "@/lib/create/build-job-payload";

describe("fitVideoDimensions", () => {
  it("leaves an in-band, 64-aligned size unchanged", () => {
    expect(fitVideoDimensions(768, 512)).toEqual({ width: 768, height: 512 });
  });

  it("scales down to the cap preserving aspect, then snaps to /64", () => {
    // 1920x1080 → *0.6667 → 1280x720 → 720 snaps to 704
    expect(fitVideoDimensions(1920, 1080)).toEqual({ width: 1280, height: 704 });
  });

  it("floors tiny sizes to 512", () => {
    expect(fitVideoDimensions(100, 100)).toEqual({ width: 512, height: 512 });
  });

  it("snaps a non-64 multiple to the nearest 64", () => {
    expect(fitVideoDimensions(736, 512)).toEqual({ width: 768, height: 512 });
  });
});

describe("buildVideoJobPayload", () => {
  const base = {
    modelId: "LTX-2.3 Audio",
    prompt: "  a fox in snow  ",
    sourceImage: "data:image/jpeg;base64,AAAA",
    params: { width: 768, height: 512, cfgScale: 1, length: 96, fps: 24 },
  };

  it("shapes an i2v payload and omits steps when none supplied", () => {
    const p = buildVideoJobPayload(base);
    expect(p.mediaType).toBe("video");
    expect(p.sourceProcessing).toBe("img2video");
    expect(p.sourceImage).toBe(base.sourceImage);
    expect(p.prompt).toBe("a fox in snow"); // trimmed
    expect(p.params.width).toBe(768);
    expect(p.params.length).toBe(96);
    expect(p.params.n).toBe(1);
    expect("steps" in p.params).toBe(false);
    expect(p.sourceImageEnd).toBeUndefined();
  });

  it("passes an end frame through for fill-between recipes", () => {
    const p = buildVideoJobPayload({ ...base, endImage: "data:image/jpeg;base64,BBBB" });
    expect(p.sourceImageEnd).toBe("data:image/jpeg;base64,BBBB");
  });

  it("includes steps and seed only when provided", () => {
    const p = buildVideoJobPayload({
      ...base,
      params: { ...base.params, steps: 12, seed: "42" },
    });
    expect(p.params.steps).toBe(12);
    expect(p.params.seed).toBe("42");
  });

  it("fits out-of-band dimensions before emitting", () => {
    const p = buildVideoJobPayload({ ...base, params: { ...base.params, width: 1920, height: 1080 } });
    expect(p.params.width).toBe(1280);
    expect(p.params.height).toBe(704);
  });
});
