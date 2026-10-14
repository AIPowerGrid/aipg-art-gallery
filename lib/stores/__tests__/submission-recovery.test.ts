// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import { randomUUID } from "crypto";
import { ApiError, createJob, createDurableVideoJob, fetchJobByRequest, fetchJobStatus, addToGallery } from "@/lib/api";
import { useJobStore } from "../job-store";
import { CreateJobRequest, DurableVideoSubmission, JobStatus } from "@/types/models";

jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual("@/lib/api").ApiError,
  createJob: jest.fn(), fetchJobByRequest: jest.fn(), fetchJobStatus: jest.fn(),
  createDurableVideoJob: jest.fn(),
  addToGallery: jest.fn(), updateGalleryItem: jest.fn(() => Promise.resolve({})),
}));

const payload: CreateJobRequest = {
  modelId: "test-model", prompt: "a test scene", mediaType: "video", params: { n: 1 },
  timelineData: "uploaded-media-must-not-be-copied", sourceImage: "private-upload",
};
const videoPayload: DurableVideoSubmission = {
  video: {
    model: "LTX-2.5 Distilled BF16", prompt: "a test scene", n: 1,
    frames: 81, fps: 24, size: "960x544", audio: true, max_cost_micro_usd: 80000,
    image: "private-opening-image", reference_audio: "private-source-sound",
    reference_video: "private-source-motion",
    keyframes: [{ image: "private-ending-image", frame: 80, strength: 0.5 }],
  },
};
const videoJobId = "b9a21451-405b-447f-8d9c-11abbc0f667a";
const completed: JobStatus = {
  jobId: "server-job", gridJobId: "core-receipt", status: "completed", faulted: false,
  waitTime: 0, queuePosition: 0, processing: 0, finished: 1, waiting: 0,
  generations: [{ id: "output", kind: "video", seed: "1", url: "https://images.example/result.mp4" }],
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: randomUUID });
  useJobStore.getState().stopPolling();
  useJobStore.setState({ jobs: [], requests: [], activeOwner: "owner" });
  (createJob as jest.Mock).mockResolvedValue({ jobId: "server-job", status: "queued" });
  (createDurableVideoJob as jest.Mock).mockResolvedValue({ jobId: videoJobId, status: "queued" });
  (fetchJobByRequest as jest.Mock).mockResolvedValue(completed);
  (fetchJobStatus as jest.Mock).mockResolvedValue(completed);
  (addToGallery as jest.Mock).mockResolvedValue({ success: true });
});

afterEach(() => {
  jest.restoreAllMocks();
  useJobStore.getState().stopPolling();
  useJobStore.setState({ jobs: [], requests: [], activeOwner: null });
  jest.useRealTimers();
});

it("persists a minimal owner-bound handle before dispatch", async () => {
  (createJob as jest.Mock).mockImplementation(async (request) => {
    const saved = JSON.parse(localStorage.getItem("aipg-job-store")!);
    expect(saved.state.requests[0]).toMatchObject({ owner: "owner", requestId: request.requestId });
    expect(JSON.stringify(saved)).not.toContain("private-upload");
    expect(JSON.stringify(saved)).not.toContain("uploaded-media-must-not-be-copied");
    return { jobId: "server-job", status: "queued" };
  });
  await useJobStore.getState().submitJob(payload, "owner");
  expect(createJob).toHaveBeenCalledTimes(1);
  expect(useJobStore.getState().requests).toEqual([]);
  expect(useJobStore.getState().jobs[0].requestId).toBeTruthy();
});

it("does not dispatch when browser storage is full", async () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("quota exceeded"); });
  await expect(useJobStore.getState().submitJob(payload, "owner")).rejects.toThrow("No generation was submitted");
  expect(createJob).not.toHaveBeenCalled();
  expect(useJobStore.getState().requests).toHaveLength(0);
});

it("blocks a second matching submission while the first outcome is unknown", async () => {
  (createJob as jest.Mock).mockRejectedValue(new TypeError("lost"));
  await expect(useJobStore.getState().submitJob(payload, "owner")).rejects.toThrow("outcome is unknown");
  await expect(useJobStore.getState().submitJob(payload, "owner")).rejects.toThrow("outcome is unknown");
  expect(createJob).toHaveBeenCalledTimes(1);
});

it("recovers a lost submission response after rehydration without another POST", async () => {
  (createJob as jest.Mock).mockRejectedValue(new TypeError("network lost"));
  await expect(useJobStore.getState().submitJob(payload, "owner")).rejects.toThrow("outcome is unknown");
  const stored = localStorage.getItem("aipg-job-store")!;
  useJobStore.getState().stopPolling();
  useJobStore.setState({ requests: [], jobs: [] });
  localStorage.setItem("aipg-job-store", stored);
  await useJobStore.persist.rehydrate();
  await useJobStore.getState().pollOnce();
  expect(fetchJobByRequest).toHaveBeenCalledTimes(1);
  expect(createJob).toHaveBeenCalledTimes(1);
  expect(useJobStore.getState().jobs[0]).toMatchObject({ jobId: "server-job", status: "completed", result: { gridJobId: "core-receipt" } });
  expect(useJobStore.getState().requests).toEqual([]);
});

it.each([404, 409, 503])("keeps recovery HTTP %s unresolved, never assumes a refund", async (code) => {
  (createJob as jest.Mock).mockRejectedValue(new TypeError("lost"));
  await expect(useJobStore.getState().submitJob(payload, "owner")).rejects.toThrow();
  (fetchJobByRequest as jest.Mock).mockRejectedValue(new ApiError(code, "unavailable"));
  await useJobStore.getState().pollOnce();
  expect(useJobStore.getState().requests).toHaveLength(1);
  expect(useJobStore.getState().jobs).toHaveLength(0);
  expect(createJob).toHaveBeenCalledTimes(1);
});

it("does not recover another account's request after switching accounts", async () => {
  (createJob as jest.Mock).mockRejectedValue(new TypeError("lost"));
  await expect(useJobStore.getState().submitJob(payload, "owner")).rejects.toThrow();
  useJobStore.setState({ activeOwner: "other" });
  await useJobStore.getState().pollOnce();
  expect(fetchJobByRequest).not.toHaveBeenCalled();
  await expect(useJobStore.getState().submitJob(payload, "owner")).rejects.toThrow("session changed");
  expect(createJob).toHaveBeenCalledTimes(1);
});

it("removes a definite insufficient-credit rejection without recovery", async () => {
  (createJob as jest.Mock).mockRejectedValue(new ApiError(402, "insufficient credits"));
  await expect(useJobStore.getState().submitJob(payload, "owner")).rejects.toThrow("402");
  expect(useJobStore.getState().requests).toHaveLength(0);
  expect(useJobStore.getState().jobs).toHaveLength(0);
});

it("does not mark paid work failed after repeated status outages", async () => {
  await useJobStore.getState().submitJob(payload, "owner");
  (fetchJobStatus as jest.Mock).mockRejectedValue(new ApiError(503, "unavailable"));
  for (let i = 0; i < 12; i++) {
    jest.setSystemTime(Date.now() + 31000);
    await useJobStore.getState().pollOnce();
  }
  expect(useJobStore.getState().jobs[0]).toMatchObject({ status: "queued", pollFailures: 12 });
  expect(createJob).toHaveBeenCalledTimes(1);
});

it("persists only a handle before a durable-video POST and never uses the legacy route", async () => {
  (createDurableVideoJob as jest.Mock).mockImplementation(async (requestId, video) => {
    const saved = localStorage.getItem("aipg-job-store")!;
    expect(JSON.parse(saved).state.requests[0]).toMatchObject({ requestId, owner: "owner", job: { modelId: video.model, type: "video", width: 960, height: 544 } });
    for (const source of ["private-opening-image", "private-ending-image", "private-source-sound", "private-source-motion"]) {
      expect(saved).not.toContain(source);
    }
    return { jobId: videoJobId, status: "queued" };
  });
  await useJobStore.getState().submitJob(videoPayload, "owner");
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
  expect(createJob).not.toHaveBeenCalled();
  expect(useJobStore.getState().requests).toEqual([]);
});

it("recovers durable video after reply loss and reload with no second POST", async () => {
  (fetchJobByRequest as jest.Mock).mockResolvedValue({ ...completed, jobId: videoJobId });
  (fetchJobStatus as jest.Mock).mockResolvedValue({ ...completed, jobId: videoJobId });
  (createDurableVideoJob as jest.Mock).mockRejectedValue(new TypeError("lost reply"));
  await expect(useJobStore.getState().submitJob(videoPayload, "owner")).rejects.toThrow("outcome is unknown");
  await expect(useJobStore.getState().submitJob(videoPayload, "owner")).rejects.toThrow("outcome is unknown");
  const saved = localStorage.getItem("aipg-job-store")!;
  useJobStore.getState().stopPolling();
  useJobStore.setState({ requests: [], jobs: [] });
  localStorage.setItem("aipg-job-store", saved);
  await useJobStore.persist.rehydrate();
  await useJobStore.getState().pollOnce();
  expect(fetchJobByRequest).toHaveBeenCalledTimes(1);
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
  expect(createJob).not.toHaveBeenCalled();
  expect(useJobStore.getState().jobs[0]).toMatchObject({ status: "completed", result: { gridJobId: "core-receipt" } });
});

it("never dispatches durable video when storage cannot save the recovery handle", async () => {
  jest.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("full"); });
  await expect(useJobStore.getState().submitJob(videoPayload, "owner")).rejects.toThrow("No generation was submitted");
  expect(createDurableVideoJob).not.toHaveBeenCalled();
});

it.each([0, -1, 0.1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects invalid video ceiling %s before storing or dispatching", async (ceiling) => {
  await expect(useJobStore.getState().submitJob({ video: { ...videoPayload.video, max_cost_micro_usd: ceiling } }, "owner")).rejects.toThrow("positive video cost ceiling");
  expect(createDurableVideoJob).not.toHaveBeenCalled();
  expect(useJobStore.getState().requests).toHaveLength(0);
});

it.each([404, 409, 503])("keeps durable-video HTTP %s unresolved without legacy fallback", async (status) => {
  (createDurableVideoJob as jest.Mock).mockRejectedValue(new ApiError(status, "unavailable"));
  await expect(useJobStore.getState().submitJob(videoPayload, "owner")).rejects.toThrow("outcome is unknown");
  expect(useJobStore.getState().requests).toHaveLength(1);
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
  expect(createJob).not.toHaveBeenCalled();
});

it.each([
  { jobId: 123, status: "queued" },
  { jobId: " ", status: "queued" },
  { jobId: "not-a-job", status: "queued" },
  { jobId: videoJobId, status: "completed" },
  { jobId: videoJobId },
])("keeps malformed durable-video success %j recoverable", async (response) => {
  (createDurableVideoJob as jest.Mock).mockResolvedValue(response);
  await expect(useJobStore.getState().submitJob(videoPayload, "owner")).rejects.toThrow("outcome is unknown");
  expect(useJobStore.getState().requests).toHaveLength(1);
  expect(useJobStore.getState().jobs).toHaveLength(0);
});

it("does not recover durable video under a different active account", async () => {
  (createDurableVideoJob as jest.Mock).mockRejectedValue(new TypeError("lost reply"));
  await expect(useJobStore.getState().submitJob(videoPayload, "owner")).rejects.toThrow("outcome is unknown");
  useJobStore.setState({ activeOwner: "other" });
  await useJobStore.getState().pollOnce();
  expect(fetchJobByRequest).not.toHaveBeenCalled();
  expect(createDurableVideoJob).toHaveBeenCalledTimes(1);
});

it("does not send a durable video after the account changes during handle preparation", async () => {
  await expect(useJobStore.getState().submitJob(videoPayload, "owner", () => {
    useJobStore.setState({ activeOwner: "other" });
  })).rejects.toThrow("No generation was submitted");
  expect(createDurableVideoJob).not.toHaveBeenCalled();
  expect(useJobStore.getState().requests).toHaveLength(0);
});

it("discards a definite durable-video credit rejection before dispatch", async () => {
  (createDurableVideoJob as jest.Mock).mockRejectedValue(new ApiError(402, "insufficient credits"));
  await expect(useJobStore.getState().submitJob(videoPayload, "owner")).rejects.toThrow("402");
  expect(useJobStore.getState().requests).toHaveLength(0);
  expect(useJobStore.getState().jobs).toHaveLength(0);
  expect(createJob).not.toHaveBeenCalled();
});
