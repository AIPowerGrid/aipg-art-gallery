// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import { createJob, ApiError } from "../api";
import { CreateJobRequest } from "@/types/models";

const image: CreateJobRequest = {
  modelId: "FLUX.2 Klein 4B FP8",
  prompt: "synthetic scene",
  params: { n: 1 },
  public: false,
  mediaType: "image",
  sourceProcessing: "txt2img",
  maxCostMicroUSD: 5000,
};
beforeEach(() => {
  global.fetch = jest.fn();
});
it("uses the dedicated ceiling-enforcing route for a capped image", async () => {
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ jobId: "saved-image", status: "queued" }),
  });
  await createJob(image);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    "/api/images/jobs",
    expect.objectContaining({
      method: "POST",
      credentials: "include",
      body: JSON.stringify(image),
    }),
  );
});
it("never retries against the uncapped legacy route when the new endpoint is missing", async () => {
  (fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 404,
    json: async () => ({ error: "not found" }),
  });
  await expect(createJob(image)).rejects.toEqual(
    new ApiError(404, "not found"),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("preserves the old route for existing image callers without a ceiling", async () => {
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ jobId: "saved-image", status: "queued" }),
  });
  const { maxCostMicroUSD, ...legacy } = image;
  expect(maxCostMicroUSD).toBe(5000);
  await createJob(legacy);
  expect(fetch).toHaveBeenCalledWith("/api/jobs", expect.anything());
});
