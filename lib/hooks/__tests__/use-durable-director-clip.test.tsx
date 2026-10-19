// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import { act, renderHook } from "@testing-library/react";
import { randomUUID } from "crypto";
import { addToGallery, createDurableVideoJob, createJob, fetchJobByRequest, fetchJobStatus, prepareVideoSource, ApiError } from "@/lib/api";
import { useJobStore } from "@/lib/stores/job-store";
import { useDurableDirectorClip } from "../use-durable-director-clip";

jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual("@/lib/api").ApiError,
  createDurableVideoJob: jest.fn(), createJob: jest.fn(), addToGallery: jest.fn(),
  prepareVideoSource: jest.fn(),
  fetchJobStatus: jest.fn(), fetchJobByRequest: jest.fn(), updateGalleryItem: jest.fn(),
}));
const mockQuote = { costCeilingMicro: 67500, quote: { estimate: { balance_sufficient: true } }, loading: false, error: null, refresh: jest.fn() };
jest.mock("../use-durable-video-quote", () => ({ useDurableVideoQuote: () => mockQuote }));
const model = "LTX-2.5 Distilled BF16" as const;
const jobId = "b9a21451405b447f8d9c11abbc0f667a";
const options = { ownerIdentifier: "owner", authenticated: true, enabled: true, models: [{ id: model, onlineWorkers: 2 }] };

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: randomUUID });
  useJobStore.setState({ jobs: [], requests: [], activeOwner: "owner" });
  mockQuote.quote.estimate.balance_sufficient = true;
  URL.createObjectURL = jest.fn(() => "blob:fixture-source");
  URL.revokeObjectURL = jest.fn();
  (createDurableVideoJob as jest.Mock).mockResolvedValue({ jobId, status: "queued" });
  (addToGallery as jest.Mock).mockResolvedValue({ success: true });
});
afterEach(() => { useJobStore.getState().stopPolling(); useJobStore.setState({ jobs: [], requests: [], activeOwner: null }); jest.useRealTimers(); });
function setup() {
  const hook = renderHook(() => useDurableDirectorClip(options));
  act(() => hook.result.current.setPrompt("camera glides over the ocean"));
  return hook;
}

it.each([
  ["544x960", "512x960"], ["960x544", "960x512"],
  ["448x768", "448x768"], ["768x448", "768x448"],
  ["512x512", "512x512"], ["704x704", "704x704"],
])("preserves the %s resolution tier while changing source modes", (size, motionSize) => {
  const { result } = setup();
  act(() => result.current.setSize(size));
  act(() => result.current.setMode("video"));
  expect(result.current.size).toBe(motionSize);
  act(() => result.current.setMode("audio"));
  expect(result.current.size).toBe(size);
  expect(createDurableVideoJob).not.toHaveBeenCalled();
});

it("submits one exact-frame credit-capped private clip, without legacy fallback", async () => {
  const { result } = setup();
  await act(async () => { await result.current.submit(); });
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
  expect(createJob).not.toHaveBeenCalled();
  expect((createDurableVideoJob as jest.Mock).mock.calls[0][1]).toMatchObject({ model, frames: 81, fps: 24, n: 1, max_cost_micro_usd: 67500, size: "960x544" });
  expect((createDurableVideoJob as jest.Mock).mock.calls[0][1]).not.toHaveProperty("keyframes");
  expect((createDurableVideoJob as jest.Mock).mock.calls[0][1]).not.toHaveProperty("seed");
  expect(addToGallery).toHaveBeenCalledWith(expect.objectContaining({ jobId, isPublic: false }));
  expect(result.current.error).toBeNull();
  expect(result.current.pending).toEqual([]);
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

it.each(["0", "31337", "9007199254740991"])("submits an explicit seed %s without randomizing it", async (seed) => {
  const { result } = setup();
  act(() => result.current.setSeed(seed));
  await act(async () => { await result.current.submit(); });
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
  expect((createDurableVideoJob as jest.Mock).mock.calls[0][1].seed).toBe(Number(seed));
  expect(result.current.error).toBeNull();
});

it.each(["-1", "1.5", "1e3", "not-a-seed", "9007199254740992"])("rejects unsafe seed %s before saving a request", async (seed) => {
  const { result } = setup();
  act(() => result.current.setSeed(seed));
  await act(async () => { await result.current.submit(); });
  expect(result.current.error).toMatch(/seed/i);
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

it.each(["audio", "video"] as const)("prepares %s once and sends only ephemeral source bytes", async (mode) => {
  const { result } = renderHook(() => useDurableDirectorClip({ ...options, sourceModes: ["audio", "video"] }));
  act(() => { result.current.setMode(mode); result.current.setPrompt("a boat on the water"); });
  const height = mode === "video" ? 512 : 544;
  (prepareVideoSource as jest.Mock).mockResolvedValue({ audio: "data:audio/wav;base64,YQ==", ...(mode === "video" ? { video: "data:video/mp4;base64,dg==" } : {}), frames:81,width:960,height,startSeconds:0 });
  act(() => result.current.loadSource(new File(["private-source-bytes"], mode === "audio" ? "sound.mp3" : "source.mp4")));
  await act(async () => { await Promise.all([result.current.submit(),result.current.submit()]); });
  expect(prepareVideoSource).toHaveBeenCalledTimes(1);
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
  expect((createDurableVideoJob as jest.Mock).mock.calls[0][1]).toMatchObject({reference_audio:"data:audio/wav;base64,YQ==", ...(mode === "video" ? {reference_video:"data:video/mp4;base64,dg==",guide_strength:0.85} : {})});
  expect(JSON.stringify(useJobStore.getState().jobs)).not.toContain("data:audio");
  expect(JSON.stringify(useJobStore.getState().requests)).not.toContain("private-source");
});

it("never dispatches source work when closed, malformed, cancelled or prepared for another account", async () => {
  const { result,rerender } = renderHook((props) => useDurableDirectorClip(props), {initialProps:{...options,sourceModes:[] as Array<"audio"|"video">}});
  act(() => {result.current.setMode("audio");result.current.setPrompt("a scene");result.current.loadSource(new File(["source"],"a.mp3"));});
  await act(async()=>{await result.current.submit();});
  expect(prepareVideoSource).not.toHaveBeenCalled();
  rerender({...options,sourceModes:["audio"]});
  (prepareVideoSource as jest.Mock).mockResolvedValue({audio:"data:audio/wav;base64,YQ==",frames:33,width:960,height:544,startSeconds:0});
  await act(async()=>{await result.current.submit();});
  expect(result.current.error).toContain("did not match");
  (prepareVideoSource as jest.Mock).mockRejectedValue(new Error("source too short"));
  await act(async()=>{await result.current.submit();});
  expect(result.current.error).toContain("too short");
  let finish!: (value:unknown)=>void;
  (prepareVideoSource as jest.Mock).mockReturnValue(new Promise((resolve)=>{finish=resolve;}));
  let pending!:Promise<void>;
  act(()=>{pending=result.current.submit();});
  act(()=>useJobStore.setState({activeOwner:"someone-else"}));
  await act(async()=>{finish({audio:"data:audio/wav;base64,YQ==",frames:81,width:960,height:544,startSeconds:0});await pending;});
  expect(createDurableVideoJob).not.toHaveBeenCalled();
  expect(useJobStore.getState().requests).toEqual([]);
});

it.each(["audio", "video"] as const)("accepts larger %s uploads but not unsupported source output length", (mode) => {
  const { result } = renderHook(() => useDurableDirectorClip({ ...options, sourceModes: ["audio", "video"] }));
  const file = new File(["fixture"], "long-source");
  Object.defineProperty(file, "size", { value: 65 * 1024 * 1024 });
  act(() => { result.current.setMode(mode); result.current.setPrompt("a scene"); result.current.loadSource(file); });
  expect(result.current.sourceFile).toBe(file);
  expect(result.current.error).toBeNull();
  act(() => result.current.setFrames(625));
  expect(result.current.canSubmit).toBe(false);
  expect(prepareVideoSource).not.toHaveBeenCalled();
});

it.each(["processing", "completed", "faulted"])("clears a stale unknown notice when the original request is confirmed %s", async(status)=>{
  (createDurableVideoJob as jest.Mock).mockRejectedValue(new TypeError("reply lost"));
  const {result}=setup();
  await act(async()=>{await result.current.submit();});
  expect(result.current.error).toContain("outcome is unknown");
  const observed = { jobId, status, faulted: status === "faulted", waitTime: 0, queuePosition: 0,
    processing: status === "processing" ? 1 : 0, finished: 0, waiting: 0, generations: [] };
  (fetchJobByRequest as jest.Mock).mockResolvedValue(observed);
  (fetchJobStatus as jest.Mock).mockResolvedValue(observed);
  await act(async()=>{await useJobStore.getState().pollOnce();});
  expect(result.current.error).toBeNull();
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
  if (status === "processing") expect(result.current.canSubmit).toBe(false);
});

it("keeps the warning when the recovered original result is still uncertain", async()=>{
  (createDurableVideoJob as jest.Mock).mockRejectedValue(new TypeError("reply lost"));
  const {result}=setup();
  await act(async()=>{await result.current.submit();});
  const uncertain = { jobId, status: "uncertain", faulted: false, waitTime: 0, queuePosition: 0,
    processing: 1, finished: 0, waiting: 0, generations: [], error: "Video outcome is unknown" };
  (fetchJobByRequest as jest.Mock).mockResolvedValue(uncertain);
  (fetchJobStatus as jest.Mock).mockResolvedValue(uncertain);
  await act(async()=>{await useJobStore.getState().pollOnce();});
  expect(result.current.error).toContain("outcome is unknown");
  expect(result.current.canSubmit).toBe(false);
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
});

it("does not clear a submission warning for an unrelated completed request", async()=>{
  (createDurableVideoJob as jest.Mock).mockRejectedValue(new TypeError("reply lost"));
  const {result}=setup();
  await act(async()=>{await result.current.submit();});
  act(()=>useJobStore.getState().addJob({jobId,modelId:model,modelName:model,prompt:"other",type:"video",
    isNsfw:false,isPublic:false,walletAddress:"owner",requestId:"unrelated",status:"completed"}));
  expect(result.current.error).toContain("outcome is unknown");
  expect(result.current.canSubmit).toBe(false);
});
