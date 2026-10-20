// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import { act, renderHook, waitFor } from "@testing-library/react";
import { randomUUID } from "crypto";
import {
  addToGallery,
  createJob,
  createDurableVideoJob,
  fetchCreditQuote,
  fetchModels,
  ApiError,
} from "@/lib/api";
import { useJobStore } from "@/lib/stores/job-store";
import { useShotImage } from "../use-shot-image";
import { cropImageToRenderSize } from "@/lib/utils/crop-image";
import { GalleryModel } from "@/types/models";

jest.mock("@/lib/api", () => ({
  ApiError: jest.requireActual("@/lib/api").ApiError,
  fetchModels: jest.fn(),
  fetchCreditQuote: jest.fn(),
  createJob: jest.fn(),
  createDurableVideoJob: jest.fn(),
  addToGallery: jest.fn(),
  fetchJobStatus: jest.fn(),
  fetchJobByRequest: jest.fn(),
  updateGalleryItem: jest.fn(),
}));
jest.mock("@/lib/utils/crop-image", () => ({
  cropImageToRenderSize: jest.fn(),
}));
const model = {
  id: "MOSS Image SFT BF16",
  displayName: "MOSS Image SFT",
  type: "image",
  status: "online",
  onlineWorkers: 1,
  capabilities: ["txt2img", "img2img"],
  defaults: { steps: 50, cfgScale: 3, sampler: "euler", scheduler: "simple" },
  limits: {},
} as GalleryModel;
const jobId = "b9a21451405b447f8d9c11abbc0f667a";
const quote = {
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
};
const onSelect = jest.fn();
const onBusy = jest.fn();
const options = {
  owner: "owner",
  authenticated: true,
  videoSize: "960x544",
  disabled: false,
  onSelect,
  onBusy,
};
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: randomUUID,
  });
  useJobStore.setState({ jobs: [], requests: [], activeOwner: "owner" });
  (fetchModels as jest.Mock).mockResolvedValue({ models: [model] });
  (fetchCreditQuote as jest.Mock).mockResolvedValue(quote);
  (createJob as jest.Mock).mockResolvedValue({ jobId, status: "queued" });
  (addToGallery as jest.Mock).mockResolvedValue({ success: true });
  (cropImageToRenderSize as jest.Mock).mockResolvedValue(
    "data:image/jpeg;base64,aW1n",
  );
  onSelect.mockResolvedValue(undefined);
});
afterEach(() => {
  useJobStore.getState().stopPolling();
  useJobStore.setState({ jobs: [], requests: [], activeOwner: null });
});
async function setup() {
  const hook = renderHook((props) => useShotImage(props), {
    initialProps: options,
  });
  act(() => hook.result.current.setPrompt("character in a cabin"));
  await waitFor(() => expect(hook.result.current.canCompose).toBe(true));
  return hook;
}
it("submits one private capped image, never animation or automatic selection", async () => {
  const { result } = await setup();
  await act(async () => {
    await result.current.loadReference(
      new File(["portrait"], "portrait.png", { type: "image/png" }),
    );
  });
  await act(async () => {
    await Promise.all([result.current.compose(), result.current.compose()]);
  });
  expect(createJob).toHaveBeenCalledTimes(1);
  expect(createJob).toHaveBeenCalledWith(
    expect.objectContaining({
      modelId: "MOSS Image SFT BF16",
      public: false,
      sourceProcessing: "img2img",
      sourceImage: expect.stringMatching(/^data:image\/png/),
      maxCostMicroUSD: 5000,
      params: expect.objectContaining({
        n: 1,
        steps: 50,
        cfgScale: 3,
        sampler: "euler",
        scheduler: "simple",
      }),
    }),
  );
  expect(addToGallery).toHaveBeenCalledWith(
    expect.objectContaining({ isPublic: false, jobId }),
  );
  expect(createDurableVideoJob).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
  expect(JSON.stringify({ ...localStorage })).not.toContain("data:image");
});
it("keeps reply loss recoverable without repeating or selecting", async () => {
  (createJob as jest.Mock).mockRejectedValue(new TypeError("lost reply"));
  const { result } = await setup();
  await act(async () => {
    await result.current.compose();
  });
  expect(result.current.pending).toHaveLength(1);
  await act(async () => {
    await result.current.compose();
  });
  expect(createJob).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
  expect(result.current.error).toContain("unknown");
});
it("surfaces credit rejection with no automatic retry", async () => {
  (createJob as jest.Mock).mockRejectedValue(
    new ApiError(402, "insufficient credits"),
  );
  const { result } = await setup();
  await act(async () => {
    await result.current.compose();
  });
  expect(result.current.pending).toEqual([]);
  expect(result.current.error).toContain("402");
  expect(createJob).toHaveBeenCalledTimes(1);
});
it("requires a separate click to select a cropped completed image", async () => {
  const { result } = await setup();
  await act(async () => {
    await result.current.compose();
  });
  act(() =>
    useJobStore.getState().updateJob(jobId, {
      status: "completed",
      result: {
        jobId,
        status: "completed",
        faulted: false,
        processing: 0,
        finished: 1,
        waiting: 0,
        waitTime: 0,
        queuePosition: 0,
        generations: [
          {
            id: "image",
            kind: "image",
            seed: "1",
            url: "https://images.aipg.art/shot.png",
          },
        ],
      },
    }),
  );
  await waitFor(() =>
    expect(result.current.imagePreview).toBe("data:image/jpeg;base64,aW1n"),
  );
  expect(cropImageToRenderSize).toHaveBeenCalledWith(
    expect.stringContaining("/api/download?image=1&url="),
    960,
    544,
  );
  expect(onSelect).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.select();
  });
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ name: `shot-${jobId}.jpg`, type: "image/jpeg" }),
  );
  expect(createDurableVideoJob).not.toHaveBeenCalled();
});
it("does not dispatch after an account change or accept another account's quote", async () => {
  const { result, rerender } = await setup();
  act(() => useJobStore.setState({ activeOwner: "other" }));
  await act(async () => {
    await result.current.compose();
  });
  rerender({ ...options, owner: "other" });
  await waitFor(() => expect(result.current.ceiling).toBeNull());
  expect(result.current.jobs).toEqual([]);
  expect(result.current.reference).toBeNull();
  expect(createJob).not.toHaveBeenCalled();
});
it("never falls back if the selected model is offline", async () => {
  (fetchModels as jest.Mock).mockResolvedValue({
    models: [
      { ...model, status: "offline" },
      { ...model, id: "other-model" },
    ],
  });
  const { result } = renderHook(() => useShotImage(options));
  await waitFor(() => expect(result.current.models).toHaveLength(2));
  act(() => result.current.setPrompt("scene"));
  expect(result.current.modelId).toBe(model.id);
  expect(result.current.canCompose).toBe(false);
});
