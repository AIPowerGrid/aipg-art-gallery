// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import { expect, Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const owner = "aa37ea21-367e-4b1d-bba0-d1f987001ce3";
const jobId = "b9a21451-405b-447f-8d9c-11abbc0f667a";
const model = "LTX-2.5 Distilled BF16";
const credits = { account_id: owner, promotional: { remaining_usd: 0, active: false },
  free: { remaining_usd: 0, daily_cap_usd: 0, active: false }, paid: { balance_usd: 1 },
  total_spendable_micro: 1000000, total_spendable_usd: 1, total_preview_usd: 1, charging_enabled: true, charging_mode: "allowlist" };
const queued = { jobId, gridJobId: "31a9054f-4da2-46e1-9eb3-0d18d24cdd00", status: "processing", faulted: false,
  processing: 1, finished: 0, waiting: 0, waitTime: 0, queuePosition: 0, generations: [] };

async function fixture(page: Page, options: { loseReply?: boolean; rejectCredit?: boolean } = {}) {
  let posts = 0;
  let enabled = true;
  let finished = false;
  let account = owner;
  let body: Record<string, unknown> | undefined;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Chromium reports our intentional rejection responses as console errors.
    if (options.rejectCredit && text.startsWith("Failed to load resource:") && text.includes("status of 402")) return;
    if (options.loseReply && text.startsWith("Failed to load resource:") && text.includes("status of 503")) return;
    errors.push(text);
  });
  await page.route("**/api-preview/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api-preview/, "");
    if (path === "/auth/me") return route.fulfill({ json: { authMethod: "google", accountId: account, googleId: "clip-preview", email: "clip@example.test", name: "Clip Preview" } });
    if (path === "/styles") return route.fulfill({ json: { models: [], dimensions: [], defaultDimensionId: 0, defaults: { steps: 8, cfgScale: 1, sampler: "euler", scheduler: "normal" } } });
    if (path === "/models") return route.fulfill({ json: { chainSource: true, models: [{ id: model, name: model, type: "video", status: "online", onlineWorkers: 2, capabilities: [] }] } });
    if (path === "/videos/capabilities") return route.fulfill({ json: { enabled, models: enabled ? [{ id: model, onlineWorkers: 2 }] : [] } });
    if (path === "/credits") return route.fulfill({ json: { ...credits, account_id: account } });
    if (path === "/credits/quote") {
      const quote = request.postDataJSON();
      return route.fulfill({ json: { ...credits, account_id: account, estimate: { model: quote.modelId,
        modality: quote.modelId === "Krea 2 Turbo" ? "image" : "video", priced: true, reason: null,
        cost_micro: 1000, cost_usd: 0.001, balance_sufficient: true, from_paid_micro: 1000,
        from_daily_micro: 0, from_promotional_micro: 0, shortfall_micro: 0, n: 1, seconds: null } } });
    }
    if (path === "/videos/quote") {
      const quote = request.postDataJSON();
      expect(quote).toEqual({ model, frames: expect.any(Number), fps: 24 });
      return route.fulfill({ json: { ...credits, account_id: account, estimate: { model, modality: "video", priced: true, reason: null,
        frames: quote.frames, fps: 24, n: 1, seconds: quote.frames / 24, cost_micro: quote.frames * 20000 / 24,
        cost_usd: quote.frames * 0.02 / 24, balance_sufficient: true, from_paid_micro: quote.frames * 20000 / 24,
        from_daily_micro: 0, from_promotional_micro: 0, shortfall_micro: 0 } } });
    }
    if (path === "/videos/jobs" && request.method() === "POST") {
      posts++; body = request.postDataJSON();
      if (options.rejectCredit) return route.fulfill({ status: 402, json: { error: "insufficient credits" } });
      if (options.loseReply) return route.fulfill({ status: 503, json: { error: "upstream reply lost" } });
      return route.fulfill({ status: 202, json: { jobId, status: "queued" } });
    }
    if (path.startsWith("/jobs/requests/") || path === `/jobs/${jobId}`) return route.fulfill({ json: finished ? { ...queued, status: "completed", processing: 0, finished: 1,
      generations: [{ id: `${jobId}-0`, kind: "video", seed: "1", url: "https://images.aipg.art/e2e-clip.mp4" }] } : queued });
    if (path === "/gallery" && request.method() === "POST") return route.fulfill({ json: { success: true } });
    if (path === `/gallery/${jobId}` && request.method() === "PATCH") return route.fulfill({ json: { success: true } });
    if (path === "/gallery/me") return route.fulfill({ json: { items: [], count: 0, wallet: account } });
    errors.push(`Unmapped fixture request: ${request.method()} ${path}`);
    return route.fulfill({ status: 404, json: { error: "not found" } });
  });
  await page.route("https://api.web3modal.org/**", (route) => route.fulfill({ json: {} }));
  await page.route("https://images.aipg.art/e2e-clip.mp4", (route) => route.fulfill({ contentType: "video/mp4", headers: { "Access-Control-Allow-Origin": "*" }, body: readFileSync(join(__dirname, "../fixtures/clip-81-frames.mp4")) }));
  return { posts: () => posts, body: () => body, errors, finish: () => { finished = true; }, close: () => { enabled = false; }, switchAccount: () => { account = "c0d7a372-adb5-4a1d-b5e3-dda4935f8141"; enabled = false; } };
}

async function openClip(page: Page) {
  await page.goto("/create/director", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "LTX-2.5 clip" }).click();
  await page.getByLabel("Clip prompt").fill("camera glides over the ocean at sunrise");
  await expect(page.getByRole("button", { name: "Generate clip" })).toBeEnabled();
}

test("quotes exact frames and submits one capped clip, preserving the timeline", async ({ page }) => {
  const state = await fixture(page);
  await openClip(page);
  await expect(page.getByText("$0.0675", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Generate clip" }).click();
  await expect.poll(state.posts).toBe(1);
  expect(state.body()).toMatchObject({ requestId: expect.any(String), video: { model, frames: 81, fps: 24, n: 1, max_cost_micro_usd: 67500 } });
  expect(state.body()).not.toHaveProperty("walletAddress");
  await expect(page.getByText(`Gallery job ${jobId}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate clip" })).toBeDisabled();
  await page.screenshot({ path: "test-results/durable-director-desktop.png", fullPage: true });
  await page.getByRole("tab", { name: "Timeline", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start here: add your first segment" })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test("plays and seeks a completed clip, without persisting its opening image", async ({ page }) => {
  const state = await fixture(page);
  await openClip(page);
  await page.getByLabel("Opening image", { exact: true }).setInputFiles({ name: "guide.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=", "base64") });
  await expect(page.getByAltText("Opening image guide")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate clip" })).toBeEnabled();
  await page.getByRole("button", { name: "Generate clip" }).click();
  await expect.poll(state.posts).toBe(1);
  expect(state.body()).toMatchObject({ video: { keyframes: [{ frame: 0, strength: 1, image: expect.stringMatching(/^data:image\/png;base64,/) }] } });
  expect(await page.evaluate(() => localStorage.getItem("aipg-job-store"))).not.toContain("data:image");
  state.finish();
  const video = page.getByLabel("Generated clip");
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2);
  expect(await video.evaluate((element: HTMLVideoElement) => [element.videoWidth, element.videoHeight, element.duration])).toEqual([320, 180, 3.375]);
  // Pixel inspection needs CORS; ordinary playback above does not. This is
  // only a synthetic fixture reload, not a change to production CDN policy.
  await video.evaluate((element: HTMLVideoElement) => { element.crossOrigin = "anonymous"; element.load(); });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2);
  const before = await video.evaluate((element: HTMLVideoElement) => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
    canvas.getContext("2d")!.drawImage(element, 0, 0);
    return Array.from(canvas.getContext("2d")!.getImageData(0, 0, 320, 180).data).filter((_, index) => index % 4 !== 3).reduce((sum, value) => sum + value, 0);
  });
  expect(before).toBeGreaterThan(100000);
  const presentedTime = await video.evaluate((element: HTMLVideoElement) => new Promise<number>((resolve, reject) => {
    const observe: VideoFrameRequestCallback = (_now, metadata) => {
      if (metadata.mediaTime >= 1.4) { element.pause(); resolve(metadata.mediaTime); }
      else element.requestVideoFrameCallback(observe);
    };
    element.requestVideoFrameCallback(observe);
    element.currentTime = 1.5;
    void element.play().catch(reject);
  }));
  expect(presentedTime).toBeGreaterThanOrEqual(1.4);
  const after = await video.evaluate((element: HTMLVideoElement) => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
    canvas.getContext("2d")!.drawImage(element, 0, 0);
    return Array.from(canvas.getContext("2d")!.getImageData(0, 0, 320, 180).data).filter((_, index) => index % 4 !== 3).reduce((sum, value) => sum + value, 0);
  });
  expect(after).not.toBe(before);
  await expect(page.getByRole("link", { name: "Download clip" })).toBeVisible();
  await page.screenshot({ path: "test-results/durable-director-playback.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.getByRole("region", { name: "LTX-2.5 clip workspace" }).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/durable-director-playback-mobile.png", fullPage: true });
  expect(state.posts()).toBe(1);
  expect(state.errors).toEqual([]);
});

test("recovers after a lost reply and reload with admission closed, never resubmits", async ({ page }) => {
  const state = await fixture(page, { loseReply: true });
  await openClip(page);
  await page.getByRole("button", { name: "Generate clip" }).click();
  await expect(page.getByRole("region", { name: "LTX-2.5 clip workspace" }).getByRole("alert")).toContainText("outcome is unknown");
  state.close();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText(`Gallery job ${jobId}`)).toBeVisible();
  await expect(page.getByText("New clip submissions are closed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate clip" })).toBeDisabled();
  expect(state.posts()).toBe(1);
  expect(state.errors).toEqual([]);
});

test("hides a prior account's clip and recovery after switching accounts", async ({ page }) => {
  const state = await fixture(page);
  await openClip(page);
  await page.getByRole("button", { name: "Generate clip" }).click();
  await expect(page.getByText(`Gallery job ${jobId}`)).toBeVisible();
  state.switchAccount();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "LTX-2.5 clip" })).toHaveCount(0);
  await expect(page.getByText(`Gallery job ${jobId}`)).toHaveCount(0);
  expect(state.posts()).toBe(1);
  expect(state.errors).toEqual([]);
});

test("retains prompt and funding recovery after a definite credit rejection on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page, { rejectCredit: true });
  await openClip(page);
  await page.getByRole("button", { name: "Generate clip" }).click();
  await expect(page.getByRole("link", { name: "Add credits" })).toBeVisible();
  await expect(page.getByLabel("Clip prompt")).toHaveValue("camera glides over the ocean at sunrise");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/durable-director-mobile.png", fullPage: true });
  expect(state.posts()).toBe(1);
  expect(state.errors).toEqual([]);
});
