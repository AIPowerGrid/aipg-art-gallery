// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import { randomUUID } from "crypto";
import { ApiError, createJob, fetchJobByRequest, fetchJobStatus, addToGallery } from "@/lib/api";
import { useJobStore } from "../job-store";
import { CreateJobRequest, JobStatus } from "@/types/models";

jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual("@/lib/api").ApiError,
  createJob: jest.fn(), fetchJobByRequest: jest.fn(), fetchJobStatus: jest.fn(),
  addToGallery: jest.fn(), updateGalleryItem: jest.fn(() => Promise.resolve({})),
}));

const payload: CreateJobRequest = {
  modelId: "test-model", prompt: "a test scene", mediaType: "video", params: { n: 1 },
  timelineData: "uploaded-media-must-not-be-copied", sourceImage: "private-upload",
};
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
