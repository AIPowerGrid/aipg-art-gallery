// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import { act, renderHook } from "@testing-library/react";
import { randomUUID } from "crypto";
import { addToGallery, createDurableVideoJob, createJob, ApiError } from "@/lib/api";
import { useJobStore } from "@/lib/stores/job-store";
import { useDurableDirectorClip } from "../use-durable-director-clip";

jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual("@/lib/api").ApiError,
  createDurableVideoJob: jest.fn(), createJob: jest.fn(), addToGallery: jest.fn(),
  fetchJobStatus: jest.fn(), fetchJobByRequest: jest.fn(), updateGalleryItem: jest.fn(),
}));
const mockQuote = { costCeilingMicro: 67500, quote: { estimate: { balance_sufficient: true } }, loading: false, error: null, refresh: jest.fn() };
jest.mock("../use-durable-video-quote", () => ({ useDurableVideoQuote: () => mockQuote }));
const model = "LTX-2.5 Distilled BF16" as const;
const jobId = "b9a21451-405b-447f-8d9c-11abbc0f667a";
const options = { ownerIdentifier: "owner", authenticated: true, enabled: true, models: [{ id: model, onlineWorkers: 2 }] };

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: randomUUID });
  useJobStore.setState({ jobs: [], requests: [], activeOwner: "owner" });
  mockQuote.quote.estimate.balance_sufficient = true;
  (createDurableVideoJob as jest.Mock).mockResolvedValue({ jobId, status: "queued" });
  (addToGallery as jest.Mock).mockResolvedValue({ success: true });
});
afterEach(() => { useJobStore.getState().stopPolling(); useJobStore.setState({ jobs: [], requests: [], activeOwner: null }); jest.useRealTimers(); });
function setup() {
  const hook = renderHook(() => useDurableDirectorClip(options));
  act(() => hook.result.current.setPrompt("camera glides over the ocean"));
  return hook;
}

it("submits one exact-frame credit-capped private clip, without legacy fallback", async () => {
  const { result } = setup();
  await act(async () => { await result.current.submit(); });
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
  expect(createJob).not.toHaveBeenCalled();
  expect((createDurableVideoJob as jest.Mock).mock.calls[0][1]).toMatchObject({ model, frames: 81, fps: 24, n: 1, max_cost_micro_usd: 67500, size: "960x544" });
  expect((createDurableVideoJob as jest.Mock).mock.calls[0][1]).not.toHaveProperty("keyframes");
  expect(addToGallery).toHaveBeenCalledWith(expect.objectContaining({ jobId, isPublic: false }));
  expect(result.current.canSubmit).toBe(false);
});

it("blocks simultaneous clicks even before React updates", async () => {
  const { result } = setup();
  await act(async () => { await Promise.all([result.current.submit(), result.current.submit()]); });
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
});

it("retains the original handle and locks submission after reply loss", async () => {
  (createDurableVideoJob as jest.Mock).mockRejectedValue(new TypeError("reply lost"));
  const { result } = setup();
  await act(async () => { await result.current.submit(); });
  expect(result.current.pending).toHaveLength(1);
  expect(result.current.error).toContain("outcome is unknown");
  expect(result.current.canSubmit).toBe(false);
  await act(async () => { await result.current.submit(); });
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
});

it("does not repeat a paid POST when the private library write fails", async () => {
  (addToGallery as jest.Mock).mockRejectedValue(new Error("library offline"));
  const { result } = setup();
  await act(async () => { await result.current.submit(); });
  expect(result.current.error).toContain("Video submitted");
  await act(async () => { await result.current.submit(); });
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
});

it("surfaces a definite credit rejection without an automatic retry", async () => {
  (createDurableVideoJob as jest.Mock).mockRejectedValue(new ApiError(402, "insufficient credits"));
  const { result } = setup();
  await act(async () => { await result.current.submit(); });
  expect(result.current.error).toContain("402");
  expect(result.current.pending).toEqual([]);
  expect(result.current.prompt).toBe("camera glides over the ocean");
  expect(addToGallery).not.toHaveBeenCalled();
});

it("never submits an unavailable model or an insufficient-balance quote", async () => {
  const { result, rerender } = renderHook((props) => useDurableDirectorClip(props), { initialProps: options });
  act(() => result.current.setPrompt("a scene"));
  rerender({ ...options, enabled: false });
  await act(async () => { await result.current.submit(); });
  rerender(options); mockQuote.quote.estimate.balance_sufficient = false; rerender({ ...options });
  await act(async () => { await result.current.submit(); });
  expect(createDurableVideoJob).not.toHaveBeenCalled();
});

it("hides other-account receipts and stops dispatch on an account change", async () => {
  const { result } = setup();
  act(() => useJobStore.setState({ activeOwner: "someone-else" }));
  await act(async () => { await result.current.submit(); });
  expect(createDurableVideoJob).not.toHaveBeenCalled();
  expect(result.current.jobs).toEqual([]);
});

it("rejects an unsafe seed before saving a request", async () => {
  const { result } = setup();
  act(() => result.current.setSeed("9007199254740992"));
  await act(async () => { await result.current.submit(); });
  expect(result.current.error).toContain("seed");
  expect(createDurableVideoJob).not.toHaveBeenCalled();
  expect(useJobStore.getState().requests).toEqual([]);
});

it("submits a Studio WebP as an ephemeral opening image", async () => {
  jest.useRealTimers();
  const { result } = setup();
  await act(async () => { await result.current.loadImage(new File(["fixture-image"], "studio.webp", { type: "image/webp" })); });
  expect(result.current.image).toMatch(/^data:image\/webp;base64,/);
  expect(result.current.imageName).toBe("studio.webp");
  await act(async () => { await result.current.submit(); });
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
  expect((createDurableVideoJob as jest.Mock).mock.calls[0][1]).toMatchObject({ keyframes: [{ frame: 0, strength: 1, image: expect.stringMatching(/^data:image\/webp;base64,/) }] });
  expect(JSON.stringify(useJobStore.getState().requests)).not.toContain("data:image");
  expect(JSON.stringify(useJobStore.getState().jobs)).not.toContain("data:image");
});

it("rejects unsupported, empty and oversized images without dispatch", async () => {
  const { result } = setup();
  const oversized = new File(["image"], "large.webp", { type: "image/webp" });
  Object.defineProperty(oversized, "size", { value: 10 * 1024 * 1024 + 1 });
  for (const file of [new File(["<svg/>"], "guide.svg", { type: "image/svg+xml" }), new File([], "empty.webp", { type: "image/webp" }), oversized]) {
    await act(async () => { await result.current.loadImage(file); });
    expect(result.current.image).toBeNull();
    expect(result.current.imageLoading).toBe(false);
    expect(result.current.error).toContain("10 MB");
  }
  expect(createDurableVideoJob).not.toHaveBeenCalled();
});
