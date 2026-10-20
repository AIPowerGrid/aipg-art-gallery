/** @jest-environment node */
// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import { NextRequest } from "next/server";
import { GET } from "../route";

const request = (url = "https://images.aipg.art/shot.png") =>
  new NextRequest(
    `http://localhost/api/download?image=1&url=${encodeURIComponent(url)}`,
  );
beforeEach(() => {
  global.fetch = jest.fn();
});
it("streams only bounded raster shot images without following redirects", async () => {
  (fetch as jest.Mock).mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), {
      headers: { "Content-Type": "image/png" },
    }),
  );
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  expect(fetch).toHaveBeenCalledWith(
    "https://images.aipg.art/shot.png",
    expect.objectContaining({
      redirect: "manual",
      signal: expect.any(AbortSignal),
    }),
  );
});
it.each([
  "http://images.aipg.art/x",
  "https://images.aipg.art.evil.test/x",
  "https://user:password@images.aipg.art/x",
  "https://images.aipg.art:8443/x",
  "https://untrusted-account.r2.cloudflarestorage.com/x",
])("rejects unsafe URL %s", async (url) => {
  expect((await GET(request(url))).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  "https://media.aipg.art/shot.png",
  "https://a9b7416008b496f49b0f021099cc4128.r2.cloudflarestorage.com/shot.png",
])("allows the exact Gallery storage host %s", async (url) => {
  (fetch as jest.Mock).mockResolvedValue(
    new Response(new Uint8Array([1]), {
      headers: { "Content-Type": "image/png" },
    }),
  );
  expect((await GET(request(url))).status).toBe(200);
});
it.each(["image/svg+xml", "text/html", "video/mp4"])(
  "rejects non-raster MIME %s",
  async (mime) => {
    (fetch as jest.Mock).mockResolvedValue(
      new Response("fixture", { headers: { "Content-Type": mime } }),
    );
    expect((await GET(request())).status).toBe(415);
  },
);
it("rejects oversized declared and streamed bodies and cancels reads", async () => {
  (fetch as jest.Mock).mockResolvedValue(
    new Response("fixture", {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(10 * 1024 * 1024 + 1),
      },
    }),
  );
  expect((await GET(request())).status).toBe(413);
  const cancel = jest.fn();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 1));
    },
    cancel,
  });
  (fetch as jest.Mock).mockResolvedValue(
    new Response(body, { headers: { "Content-Type": "image/png" } }),
  );
  expect((await GET(request())).status).toBe(413);
  expect(cancel).toHaveBeenCalled();
});
it("rejects redirects and empty images", async () => {
  (fetch as jest.Mock).mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: "http://internal.invalid" },
    }),
  );
  expect((await GET(request())).status).toBe(502);
  (fetch as jest.Mock).mockResolvedValue(
    new Response(new Uint8Array(), {
      headers: { "Content-Type": "image/png" },
    }),
  );
  expect((await GET(request())).status).toBe(502);
});
