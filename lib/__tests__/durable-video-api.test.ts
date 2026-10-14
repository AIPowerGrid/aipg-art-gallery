import { ApiError, createDurableVideoJob, fetchDurableVideoQuote } from "../api";
import { DurableVideoRequest } from "@/types/models";

const video: DurableVideoRequest = {
  model: "LTX-2.5 Distilled BF16", prompt: "synthetic scene", n: 1,
  frames: 81, fps: 24, audio: true, size: "960x544", max_cost_micro_usd: 80000,
};
const originalFetch = global.fetch;

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { global.fetch = originalFetch; });

it("submits the exact typed video body once through the same-origin cookie broker", async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ jobId: "gallery-job", status: "queued" }) });
  await expect(createDurableVideoJob("saved-request", video)).resolves.toEqual({ jobId: "gallery-job", status: "queued" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/videos/jobs", expect.objectContaining({
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: "saved-request", video }),
  }));
});

it("surfaces the broker rejection without a retry or legacy fallback", async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "durable video admission is disabled" }) });
  await expect(createDurableVideoJob("saved-request", video)).rejects.toEqual(new ApiError(503, "durable video admission is disabled"));
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("preserves transport uncertainty for the job store to recover", async () => {
  (fetch as jest.Mock).mockRejectedValue(new TypeError("connection lost"));
  await expect(createDurableVideoJob("saved-request", video)).rejects.toThrow("connection lost");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("requests an exact-frame quote without a source body or rounded duration", async () => {
  const quote = { account_id: "fixture-owner", estimate: { frames: 81, fps: 24, model: video.model, cost_micro: 80000 } };
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => quote });
  const signal = new AbortController().signal;
  const request = { model: video.model, frames: video.frames, fps: video.fps };
  await expect(fetchDurableVideoQuote(request, signal)).resolves.toEqual(quote);
  expect(fetch).toHaveBeenCalledWith("/api/videos/quote", expect.objectContaining({
    method: "POST", credentials: "include", cache: "no-store", signal,
    body: JSON.stringify(request),
  }));
  expect(fetch).toHaveBeenCalledTimes(1);
});
