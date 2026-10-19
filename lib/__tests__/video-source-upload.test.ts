// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

import { prepareVideoSource } from "@/lib/api";
import { MAX_SOURCE_UPLOAD_BYTES, SOURCE_UPLOAD_CHUNK_BYTES } from "@/lib/create/video-source-limits";

const id = "a236e2f6-5275-4cea-a6a6-c86b78c48a6b";
const options = { mode: "video" as const, frames: 33, width: 512, height: 512, startSeconds: 12 };
const prepared = { audio: "data:audio/wav;base64,YQ==", video: "data:video/mp4;base64,dg==", ...options };
const size = 65 * 1024 * 1024;
const respond = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

function largeFile(bytes = size) {
  // Verify slicing/requests without allocating hundreds of MB in jsdom.
  return { size: bytes, slice: jest.fn((start: number, end: number) => ({ size: end - start })) } as unknown as File;
}

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => { jest.restoreAllMocks(); });

it.each(["audio", "video"] as const)("uploads large %s in bounded chunks and prepares once", async (mode) => {
  const file = largeFile();
  const progress = jest.fn();
  const calls: Array<{ path: string; init: RequestInit }> = [];
  (fetch as jest.Mock).mockImplementation(async (path, init) => {
    calls.push({ path, init });
    expect(init.credentials).toBe("include");
    if (path.endsWith("source-uploads")) return respond({ uploadId: id, chunkBytes: SOURCE_UPLOAD_CHUNK_BYTES, size });
    if (init.method === "PUT") {
      const start = Number(path.split("offset=")[1]);
      expect(init.body.size).toBeLessThanOrEqual(SOURCE_UPLOAD_CHUNK_BYTES);
      return respond({ offset: Math.min(start + SOURCE_UPLOAD_CHUNK_BYTES, size) });
    }
    expect(path).toBe(`/api/videos/source-uploads/${id}/prepare`);
    return respond(prepared);
  });
  await expect(prepareVideoSource(file, { ...options, mode }, undefined, progress)).resolves.toEqual(prepared);
  expect(calls.filter(({ init }) => init.method === "PUT")).toHaveLength(9);
  expect(calls.filter(({ path }) => path.endsWith("/prepare"))).toHaveLength(1);
  expect(calls.some(({ path }) => path.includes("/jobs"))).toBe(false);
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ ...options, mode, size });
  expect(progress).toHaveBeenLastCalledWith(1);
});

it("rejects files outside the ceiling before any request", async () => {
  for (const bytes of [0, MAX_SOURCE_UPLOAD_BYTES + 1]) {
    await expect(prepareVideoSource(largeFile(bytes), options)).rejects.toThrow("512 MiB");
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("never sends a chunk to an unvalidated upload identity", async () => {
  (fetch as jest.Mock).mockResolvedValue(respond({ uploadId: "../jobs", chunkBytes: SOURCE_UPLOAD_CHUNK_BYTES, size }));
  await expect(prepareVideoSource(largeFile(), options)).rejects.toThrow("authorization");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(["failure", "mismatch", "cancel"])("cleans up after %s without retries or generation", async (kind) => {
  const controller = new AbortController();
  const cleanupDeadline = jest.spyOn(global, "setTimeout");
  (fetch as jest.Mock).mockImplementation(async (path, init) => {
    if (init.method === "DELETE") {
      expect(init.signal).not.toBe(controller.signal);
      return respond(null, 204);
    }
    if (path.endsWith("source-uploads")) return respond({ uploadId: id, chunkBytes: SOURCE_UPLOAD_CHUNK_BYTES, size });
    if (kind === "failure") throw new Error("upload failed");
    if (kind === "cancel") controller.abort();
    return respond({ offset: kind === "mismatch" ? 7 : SOURCE_UPLOAD_CHUNK_BYTES });
  });
  await expect(prepareVideoSource(largeFile(), options, controller.signal)).rejects.toThrow();
  expect((fetch as jest.Mock).mock.calls.filter(([, init]) => init.method === "PUT")).toHaveLength(1);
  expect((fetch as jest.Mock).mock.calls.some(([path]) => path.endsWith("/prepare") || path.endsWith("/jobs"))).toBe(false);
  expect(fetch).toHaveBeenLastCalledWith(`/api/videos/source-uploads/${id}`, expect.objectContaining({ method: "DELETE", credentials: "include" }));
  expect(cleanupDeadline).toHaveBeenCalledWith(expect.any(Function), 5000);
});
