// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
import { expect, Page, test } from "@playwright/test";
import { readFileSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const owner = "aa37ea21-367e-4b1d-bba0-d1f987001ce3";
const jobId = "b9a21451405b447f8d9c11abbc0f667a";
const model = "LTX-2.5 Distilled BF16";
const credits = { account_id: owner, promotional: { remaining_usd: 0, active: false },
  free: { remaining_usd: 0, daily_cap_usd: 0, active: false }, paid: { balance_usd: 1 },
  total_spendable_micro: 1000000, total_spendable_usd: 1, total_preview_usd: 1, charging_enabled: true, charging_mode: "allowlist" };
const queued = { jobId, gridJobId: "31a9054f-4da2-46e1-9eb3-0d18d24cdd00", status: "processing", faulted: false,
  processing: 1, finished: 0, waiting: 0, waitTime: 0, queuePosition: 0, generations: [] };

async function fixture(page: Page, options: { loseReply?: boolean; rejectCredit?: boolean; signedOut?: boolean; sources?: boolean; scene?: boolean } = {}) {
  let posts = 0;
  let imagePosts = 0;
  let imageBody: Record<string, unknown> | undefined;
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
    if (options.signedOut && text.startsWith("Failed to load resource:") && text.includes("status of 401")) return;
    const location = message.location().url;
    let source = "unknown source";
    if (location) {
      try { const url = new URL(location); source = url.origin + url.pathname; }
      catch { source = "non-URL source"; }
    }
    errors.push(`${text} [${source}]`);
  });
  await page.route("**/api-preview/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api-preview/, "");
    if (path === "/auth/me") return options.signedOut ? route.fulfill({status:401,json:{error:"Sign in required"}}) : route.fulfill({ json: { authMethod: "google", accountId: account, googleId: "clip-preview", email: "clip@example.test", name: "Clip Preview" } });
    if (path === "/styles") return route.fulfill({ json: { models: [], dimensions: [], defaultDimensionId: 0, defaults: { steps: 8, cfgScale: 1, sampler: "euler", scheduler: "normal" } } });
    if (path === "/styles/grid") return route.fulfill({ json: { styles: [] } });
    if (path === "/models") return route.fulfill({ json: { chainSource: true, models: [{ id: model, name: model, type: "video", status: "online", onlineWorkers: 2, capabilities: [] },
      ...(options.scene ? [{ id:"MOSS Image SFT BF16",displayName:"MOSS Image SFT",type:"image",status:"online",onlineWorkers:1,capabilities:["txt2img","img2img"],
        defaults:{steps:50,cfgScale:3,sampler:"euler",scheduler:"simple"},limits:{width:{min:512,max:1344,step:64},height:{min:512,max:1344,step:64}} }] : [])] } });
    if (path === "/videos/capabilities") return route.fulfill({ json: { enabled, models: enabled ? [{ id: model, onlineWorkers: 2 }] : [],sourceModes:options.sources?["audio","video"]:[] } });
    if (path === "/videos/prepare-source") return route.fulfill({json:{audio:"data:audio/wav;base64,c291bmQ=",...(request.postDataBuffer()?.toString().includes('\r\nvideo\r\n')?{video:"data:video/mp4;base64,bW90aW9u"}:{}),frames:33,width:512,height:512,startSeconds:0}});
    if (path === "/credits") return route.fulfill({ json: { ...credits, account_id: account } });
    if (path === "/credits/quote") {
      const quote = request.postDataJSON();
      return route.fulfill({ json: { ...credits, account_id: account, estimate: { model: quote.modelId,
        modality: ["Krea 2 Turbo", "MOSS Image SFT BF16"].includes(quote.modelId) ? "image" : "video", priced: true, reason: null,
        cost_micro: 1000, cost_usd: 0.001, balance_sufficient: true, from_paid_micro: 1000,
        from_daily_micro: 0, from_promotional_micro: 0, shortfall_micro: 0, n: 1, seconds: null } } });
    }
    if (path === "/videos/quote") {
      const quote = request.postDataJSON();
      expect(quote).toEqual({ model, frames: expect.any(Number), fps: 24 });
      return route.fulfill({ json: { ...credits, account_id: account, estimate: { model, modality: "video", priced: true, reason: null,
        frames: quote.frames, fps: 24, n: 1, seconds: quote.frames / 24, cost_micro: Math.ceil(quote.frames * 20000 / 24),
        cost_usd: Math.ceil(quote.frames * 20000 / 24) / 1000000, balance_sufficient: true, from_paid_micro: Math.ceil(quote.frames * 20000 / 24),
        from_daily_micro: 0, from_promotional_micro: 0, shortfall_micro: 0 } } });
    }
    if (options.scene && path === "/images/jobs" && request.method() === "POST") {
      imagePosts++; imageBody = request.postDataJSON();
      return route.fulfill({ status:202,json:{jobId:"7aaa1451405b447f8d9c11abbc0f667a",status:"queued"} });
    }
    if (options.scene && path === "/jobs/7aaa1451405b447f8d9c11abbc0f667a") return route.fulfill({json:{...queued,
      jobId:"7aaa1451405b447f8d9c11abbc0f667a",status:"completed",processing:0,finished:1,
      generations:[{id:"scene",kind:"image",seed:"1",url:"https://images.aipg.art/scene-fixture.png"}]}});
    if (options.scene && path === "/gallery/7aaa1451405b447f8d9c11abbc0f667a" && request.method() === "PATCH") return route.fulfill({json:{success:true}});
    if (path === "/videos/jobs" && request.method() === "POST") {
      posts++; body = request.postDataJSON();
      if (options.rejectCredit) return route.fulfill({ status: 402, json: { error: "insufficient credits" } });
      if (options.loseReply) return route.fulfill({ status: 503, json: { error: "upstream reply lost" } });
      return route.fulfill({ status: 202, json: { jobId, status: "queued" } });
    }
    if (path.startsWith("/jobs/requests/") || path === `/jobs/${jobId}`) return route.fulfill({ json: finished ? { ...queued, status: "completed", processing: 0, finished: 1,
      generations: [{ id: `${jobId}-0`, kind: "video", seed: "1", url: "https://media.aipg.art/e2e-clip.mp4" }] } : queued });
    if (path === "/gallery" && request.method() === "POST") return route.fulfill({ json: { success: true } });
    if (path === `/gallery/${jobId}` && request.method() === "PATCH") return route.fulfill({ json: { success: true } });
    if (path === "/gallery/me") return route.fulfill({ json: { items: [], count: 0, wallet: account } });
    errors.push(`Unmapped fixture request: ${request.method()} ${path}`);
    return route.fulfill({ status: 404, json: { error: "not found" } });
  });
  await page.route("https://api.web3modal.org/**", (route) => route.fulfill({ json: {} }));
  // Fixture credentials cannot authenticate WalletConnect telemetry.
  await page.route((url) => url.origin === "https://pulse.walletconnect.org" && url.pathname === "/batch",
    (route) => route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" } }));
  await page.route("https://media.aipg.art/e2e-clip.mp4", (route) => route.fulfill({ contentType: "video/mp4", headers: { "Access-Control-Allow-Origin": "*" }, body: readFileSync(join(__dirname, "../fixtures/clip-81-frames.mp4")) }));
  if (options.scene) await page.route("**/api/download?image=1&url=**", route => route.fulfill({contentType:"image/png",body:readFileSync("public/aipg_logo_small.png")}));
  return { posts: () => posts, body: () => body, imagePosts: () => imagePosts, imageBody: () => imageBody, errors, finish: () => { finished = true; }, close: () => { enabled = false; }, switchAccount: () => { account = "c0d7a372-adb5-4a1d-b5e3-dda4935f8141"; enabled = false; } };
}

async function openClip(page: Page) {
  await page.goto("/create?type=video", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Video",exact:true })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Clip prompt").fill("camera glides over the ocean at sunrise");
  await expect(page.getByRole("button", { name: "Generate clip" })).toBeEnabled();
}

for (const width of [1280, 390]) test(`reviews a private shot before one audio-driven clip at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({width,height:900});
  const state=await fixture(page,{scene:true,sources:true});await openClip(page);
  await expect(page.getByLabel("Character reference",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Audio to video",exact:true}).click();
  await page.getByRole("combobox",{name:"Clip length",exact:true}).selectOption("33");
  await page.getByRole("combobox",{name:"Resolution",exact:true}).selectOption("512x512");
  await page.getByLabel("Soundtrack",{exact:true}).setInputFiles({name:"sound.wav",mimeType:"audio/wav",buffer:Buffer.from("synthetic-source-sound")});
  await expect(page.getByLabel("Character reference",{exact:true})).toBeVisible();
  await page.getByLabel("Character reference",{exact:true}).setInputFiles({name:"reference.png",mimeType:"image/png",buffer:readFileSync("public/aipg_logo_small.png")});
  await page.getByLabel("Scene prompt",{exact:true}).fill("A character at a cabin table, warm sunlight from the left");
  await page.getByRole("button",{name:"Compose shot",exact:true}).click();
  await expect(page.getByAltText("Shot image preview",{exact:true})).toBeVisible({timeout:20000});
  expect(state.imagePosts()).toBe(1);expect(state.posts()).toBe(0);
  expect(state.imageBody()).toMatchObject({modelId:"MOSS Image SFT BF16",public:false,sourceProcessing:"img2img",
    sourceImage:expect.stringMatching(/^data:image\/png/),maxCostMicroUSD:1000,
    params:{n:1,width:1024,height:1024,steps:50,cfgScale:3,sampler:"euler",scheduler:"simple"}});
  await expect(page.getByAltText("Opening image guide",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Generate clip",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Use shot as opening frame",exact:true}).click();
  await expect(page.getByAltText("Opening image guide",{exact:true})).toBeVisible();
  expect(state.posts()).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const image=page.getByAltText("Shot image preview",{exact:true});
  expect(await image.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(512);
  await expect(page.getByRole("button",{name:"Opening frame selected",exact:true})).toBeDisabled();
  await expect(page.getByRole("button",{name:"Generate clip",exact:true})).toBeEnabled();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:testInfo.outputPath("scene-reviewed.png"),fullPage:true});
  await page.getByRole("button",{name:"Generate clip",exact:true}).click();
  await expect.poll(state.posts).toBe(1);
  expect(state.body()).toMatchObject({video:{max_cost_micro_usd:27500,frames:33,reference_audio:expect.stringMatching(/^data:audio\/wav/),
    keyframes:[{frame:0,strength:1,image:expect.stringMatching(/^data:image\/jpeg/)}]}});
  const saved=await page.evaluate(()=>JSON.stringify({...localStorage}));
  expect(saved).not.toContain("data:image");expect(saved).not.toContain("data:audio");
  expect(state.errors).toEqual([]);
});

test("recovers completed shot choices after reload without selecting or regenerating", async ({page})=>{
  const state=await fixture(page,{scene:true});await openClip(page);
  await expect(page.getByLabel("Character reference",{exact:true})).toBeVisible();
  await page.getByLabel("Scene prompt",{exact:true}).fill("A quiet cabin scene");
  await page.getByRole("button",{name:"Compose shot",exact:true}).click();
  await expect(page.getByAltText("Shot image preview",{exact:true})).toBeVisible({timeout:20000});
  await page.reload({waitUntil:"networkidle"});
  await expect(page.getByLabel("Character reference",{exact:true})).toBeVisible();
  await expect(page.getByAltText("Opening image guide",{exact:true})).toHaveCount(0);
  await page.getByRole("combobox",{name:"Recent images",exact:true}).selectOption("7aaa1451405b447f8d9c11abbc0f667a");
  await expect(page.getByAltText("Shot image preview",{exact:true})).toBeVisible();
  expect(state.imagePosts()).toBe(1);expect(state.posts()).toBe(0);expect(state.errors).toEqual([]);
});

test("uploads a larger source in chunks before exactly one video submission", async ({ page }) => {
  const state = await fixture(page, { sources: true });
  const uploadId = "8a3dc411-c399-4126-ac6d-e8d80aecc848";
  const bytes = 65 * 1024 * 1024;
  let offset = 0;
  let chunks = 0;
  let preparations = 0;
  await page.route("**/api-preview/videos/source-uploads**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith("/source-uploads")) {
      expect(request.postDataJSON()).toEqual({ size: bytes, mode: "audio", frames: 33, width: 512, height: 512, startSeconds: 0 });
      return route.fulfill({ status: 201, json: { uploadId, chunkBytes: 8 * 1024 * 1024, size: bytes, expiresAt: new Date(Date.now() + 900000).toISOString() } });
    }
    if (request.method() === "PUT") {
      expect(Number(url.searchParams.get("offset"))).toBe(offset);
      const size = request.postDataBuffer()!.length;
      expect(size).toBe(Math.min(8 * 1024 * 1024, bytes - offset));
      offset += size;
      chunks++;
      return route.fulfill({ json: { offset } });
    }
    expect(url.pathname).toBe(`/api-preview/videos/source-uploads/${uploadId}/prepare`);
    expect(offset).toBe(bytes);
    preparations++;
    return route.fulfill({ json: { audio: "data:audio/wav;base64,c291bmQ=", frames: 33, width: 512, height: 512, startSeconds: 0 } });
  });
  await openClip(page);
  const telemetryStatus = await page.evaluate(async () => (await fetch(
    "https://pulse.walletconnect.org/batch?projectId=synthetic-fixture&st=appkit&sv=test",
    { method: "POST", body: "{}" },
  )).status);
  expect(telemetryStatus).toBe(204);
  await page.getByRole("button", { name: "Audio to video", exact: true }).click();
  await page.getByRole("combobox", { name: "Clip length", exact: true }).selectOption("33");
  await page.getByRole("combobox", { name: "Resolution", exact: true }).selectOption("512x512");
  const sourcePath = test.info().outputPath("long-source.wav");
  const header = Buffer.alloc(44);
  header.write("RIFF"); header.writeUInt32LE(bytes - 8, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(48000, 24); header.writeUInt32LE(192000, 28);
  header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(bytes - 44, 40);
  writeFileSync(sourcePath, header);
  truncateSync(sourcePath, bytes);
  await page.getByLabel("Soundtrack", { exact: true }).setInputFiles(sourcePath);
  await page.getByRole("button", { name: "Generate clip", exact: true }).click();
  await expect.poll(() => chunks, { timeout: 30_000, message: "All nine source chunks must finish before generation" }).toBe(9);
  await expect.poll(() => preparations).toBe(1);
  await expect.poll(state.posts).toBe(1);
  expect(chunks).toBe(9);
  expect(preparations).toBe(1);
  expect(state.body()).toMatchObject({ video: { frames: 33, reference_audio: "data:audio/wav;base64,c291bmQ=" } });
  const persisted = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(persisted).not.toContain("data:audio");
  expect(persisted).not.toContain(uploadId);
  expect(state.errors).toEqual([]);
});

test("quotes exact frames and submits one capped clip, preserving the timeline", async ({ page }) => {
  const state = await fixture(page);
  await openClip(page);
  await expect(page.getByText("$0.0675", { exact: true })).toBeVisible();
  await page.getByText("Advanced", { exact: true }).click();
  await page.getByLabel("Seed", { exact: true }).fill("31337");
  await page.getByRole("button", { name: "Generate clip" }).click();
  await expect.poll(state.posts).toBe(1);
  expect(state.body()).toMatchObject({ requestId: expect.any(String), video: { model, frames: 81, fps: 24, n: 1, seed: 31337, max_cost_micro_usd: 67500 } });
  expect(state.body()).not.toHaveProperty("walletAddress");
  await expect(page.getByText(`Gallery job ${jobId}`)).not.toBeVisible();
  await page.getByText('Generation details', { exact: true }).click();
  await expect(page.getByText(`Gallery job ${jobId}`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate clip" })).toBeDisabled();
  await expect(page.getByText("Generation outcome is unknown.", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Checking the original request.", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Generating clip", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/durable-director-desktop.png", fullPage: true });
  await page.getByRole('link', { name: 'Director', exact: true }).click();
  await expect(page.getByRole("button", { name: /^Render/ })).toHaveCount(0);
  expect(state.errors).toEqual([]);
});

test("offers a longer clip with exact billing and one submission on desktop and mobile", async ({ page }) => {
  const state = await fixture(page);
  await openClip(page);
  await page.getByRole("combobox", {name:"Clip length",exact:true}).selectOption("625");
  await expect(page.getByText("$0.5208", {exact:true})).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/director-long-clip-${width}.png`,fullPage:true});
  }
  await page.getByRole("button", {name:"Generate clip"}).click();
  await expect.poll(state.posts).toBe(1);
  expect(state.body()).toMatchObject({video:{model,frames:625,fps:24,max_cost_micro_usd:520834}});
  await expect(page.getByRole("button", {name:"Generate clip"})).toBeDisabled();
  expect(state.errors).toEqual([]);
});

for (const sourceMode of ["audio", "video"] as const) {
  test(`submits one 26-second ${sourceMode} source window with the exact charge ceiling`, async ({ page }) => {
    const state = await fixture(page, { sources: true });
    let preparations = 0;
    await page.route("**/api-preview/videos/prepare-source", async (route) => {
      preparations++;
      const data = route.request().postDataBuffer()!.toString();
      expect(data).toContain('\r\n625\r\n');
      return route.fulfill({ json: { audio: "data:audio/wav;base64,c291bmQ=",
        ...(sourceMode === "video" ? { video: "data:video/mp4;base64,bW90aW9u" } : {}),
        frames: 625, width: 512, height: 512, startSeconds: 0 } });
    });
    await openClip(page);
    await page.getByRole("button", { name: sourceMode === "audio" ? "Audio to video" : "Video to video", exact: true }).click();
    await page.getByRole("combobox", { name: "Clip length", exact: true }).selectOption("625");
    await page.getByRole("combobox", { name: "Resolution", exact: true }).selectOption("512x512");
    await page.getByLabel(sourceMode === "audio" ? "Soundtrack" : "Source video", { exact: true }).setInputFiles({
      name: sourceMode === "audio" ? "source.wav" : "source.mp4",
      mimeType: sourceMode === "audio" ? "audio/wav" : "video/mp4", buffer: Buffer.from("synthetic source fixture"),
    });
    await expect(page.getByText("$0.5208", { exact: true })).toBeVisible();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/source26-${sourceMode}-${width}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Generate clip", exact: true }).click();
    await expect.poll(state.posts).toBe(1);
    expect(preparations).toBe(1);
    expect(state.body()).toMatchObject({ video: { model, frames: 625, max_cost_micro_usd: 520834,
      reference_audio: "data:audio/wav;base64,c291bmQ=",
      ...(sourceMode === "video" ? { reference_video: "data:video/mp4;base64,bW90aW9u" } : {}) } });
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain("data:audio");
    expect(state.errors).toEqual([]);
  });
}

test("offers six resolutions and preserves portrait geometry across modes on small screens", async ({ page }) => {
  const state = await fixture(page, { sources: true });
  await openClip(page);
  const resolution = page.getByRole("combobox", { name: "Resolution", exact: true });
  await expect(resolution.locator("option")).toHaveCount(6);
  await resolution.selectOption("544x960");
  await page.getByRole("button", { name: "Video to video", exact: true }).click();
  await expect(resolution).toHaveValue("512x960");
  await expect(resolution.locator("option")).toHaveCount(6);
  await page.getByRole("button", { name: "Audio to video", exact: true }).click();
  await expect(resolution).toHaveValue("544x960");
  await page.getByRole("button", { name: "Text to video", exact: true }).click();
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const size of ["768x448", "960x544", "448x768", "544x960", "512x512", "704x704"]) {
      await resolution.selectOption(size);
      const bounds = await resolution.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width,
          viewport: innerWidth, page: document.documentElement.scrollWidth };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
      expect(bounds.page).toBeLessThanOrEqual(bounds.viewport);
      expect(bounds.width).toBeGreaterThan(250);
    }
    await page.screenshot({ path: `test-results/video-resolutions-${width}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Generate clip" }).click();
  await expect.poll(state.posts).toBe(1);
  expect(state.body()).toMatchObject({ video: { size: "704x704", frames: 81, max_cost_micro_usd: 67500 } });
  expect(state.errors).toEqual([]);
});

test("Studio keeps image and video drafts separate and never offers legacy video models", async ({ page }) => {
  const state = await fixture(page);
  await page.route('**/api-preview/styles', (route) => route.fulfill({ json: {
    models: [
      { id: 'Krea 2 Turbo', name: 'Krea 2 Turbo', type: 'image', enabled: true, default: true },
      { id: 'LTX-2.3 Video', name: 'LTX-2.3 Video', type: 'video', enabled: true },
    ],
    dimensions: [], defaultDimensionId: 0,
    defaults: { steps: 8, cfgScale: 1, sampler: 'euler', scheduler: 'normal' },
  } }));
  await openClip(page);
  await expect(page.getByRole('link', { name: 'AIPG AI Power Grid' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Model', exact: true })).toHaveValue(model);
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByPlaceholder('Describe your image...').fill('a sunlit forest');
  await expect(page.getByText('LTX-2.3 Video', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Video', exact: true }).click();
  await expect(page.getByLabel('Clip prompt')).toHaveValue('camera glides over the ocean at sunrise');
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await expect(page.getByPlaceholder('Describe your image...')).toHaveValue('a sunlit forest');
  expect(state.posts()).toBe(0);
  expect(state.errors).toEqual([]);
});

test("video Studio fits phone, tablet and desktop without hiding the site shell", async ({ page }) => {
  const state = await fixture(page);
  await openClip(page);
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(page.getByRole('link', { name: /^AIPG/ })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    const bounds = await page.evaluate(() => {
      const settings = document.querySelector('[aria-label="Video settings"]')!.getBoundingClientRect();
      const prompt = document.querySelector('#video-clip-prompt')!.getBoundingClientRect();
      return { width: innerWidth, document: document.documentElement.scrollWidth, settings: { left: settings.left, right: settings.right, top: settings.top }, prompt: { right: prompt.right, bottom: prompt.bottom } };
    });
    expect(bounds.document).toBeLessThanOrEqual(bounds.width);
    expect(bounds.settings.left).toBeGreaterThanOrEqual(0);
    expect(bounds.settings.right).toBeLessThanOrEqual(width);
    for (const name of ["Model", "Clip length", "Resolution"]) {
      const inset = await page.getByRole("combobox", { name, exact: true }).evaluate((element) => {
        const select = element.getBoundingClientRect();
        const arrow = element.parentElement!.querySelector("svg")!.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { right: select.right - arrow.right, left: arrow.left - select.left,
          padding: parseFloat(style.paddingRight), appearance: style.appearance };
      });
      expect(inset.appearance).toBe("none");
      expect(inset.right).toBeGreaterThanOrEqual(10);
      expect(inset.left).toBeGreaterThan(0);
      expect(inset.padding).toBeGreaterThanOrEqual(40);
    }
    if (width >= 1024) expect(bounds.prompt.right).toBeLessThanOrEqual(bounds.settings.left);
    else expect(bounds.prompt.bottom).toBeLessThanOrEqual(bounds.settings.top);
    await page.screenshot({ path: `test-results/video-studio-${width}.png`, fullPage: true });
  }
  expect(state.errors).toEqual([]);
});

test("a completed creation opens in Director as existing output without another paid intent", async ({ page }) => {
  const state = await fixture(page);
  await openClip(page);
  await page.getByRole('button', { name: 'Generate clip', exact: true }).click();
  await expect.poll(state.posts).toBe(1);
  state.finish();
  await expect(page.getByLabel('Generated clip')).toBeVisible();
  await page.getByRole('button', { name: 'Image', exact: true }).click();
  await page.getByTitle('Open in Director', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Director', exact: true })).toBeVisible();
  const segments = await page.evaluate(() => JSON.parse(localStorage.getItem('aipg-director-store')!).state.segments);
  expect(segments).toHaveLength(1);
  expect(segments[0]).toMatchObject({ importedClip: true, status: 'done', lengthFrames: 81, outputUrl: 'https://media.aipg.art/e2e-clip.mp4' });
  expect(state.posts()).toBe(1);
  expect(state.errors).toEqual([]);
});

test("plays and seeks a completed clip with an ephemeral Studio WebP opening image", async ({ page }) => {
  const state = await fixture(page);
  await openClip(page);
  await page.getByLabel("Opening image", { exact: true }).setInputFiles({ name: "studio.webp", mimeType: "image/webp",
    buffer: Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64") });
  await expect(page.getByAltText("Opening image guide")).toBeVisible();
  expect(await page.getByAltText("Opening image guide").evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Generate clip" })).toBeEnabled();
  await page.getByRole("button", { name: "Generate clip" }).click();
  await expect.poll(state.posts).toBe(1);
  expect(state.body()).toMatchObject({ video: { keyframes: [{ frame: 0, strength: 1, image: expect.stringMatching(/^data:image\/webp;base64,/) }] } });
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/durable-director-playback.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.getByRole("region", { name: "LTX-2.5 clip workspace" }).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/durable-director-playback-mobile.png", fullPage: true });
  await page.getByRole("button",{name:"Open in Director",exact:true}).click();
  await expect(page.getByRole('heading', { name: 'Director', exact: true })).toBeVisible();
  const assembled=await page.evaluate(()=>JSON.parse(localStorage.getItem("aipg-director-store")!).state.segments);
  expect(assembled).toHaveLength(1);
  expect(assembled[0]).toMatchObject({importedClip:true,status:"done",lengthFrames:81,outputUrl:"https://media.aipg.art/e2e-clip.mp4"});
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
  await page.getByText('Generation details', { exact: true }).click();
  await expect(page.getByText(`Gallery job ${jobId}`)).toBeVisible();
  await expect(page.getByText("New clip submissions are closed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate clip" })).toBeDisabled();
  expect(state.posts()).toBe(1);
  expect(state.errors).toEqual([]);
});

test("clears reply-loss warnings as soon as the original video is confirmed processing", async ({ page }) => {
  const state = await fixture(page, { loseReply: true });
  await openClip(page);
  await page.getByRole("button", { name: "Generate clip" }).click();
  await expect(page.getByText("Generation outcome is unknown.", { exact: false })).toBeVisible();
  await expect(page.getByText("Generating clip", { exact: true })).toBeVisible();
  await expect(page.getByText("Generation outcome is unknown.", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Checking the original request.", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate clip" })).toBeDisabled();
  expect(state.posts()).toBe(1);
  expect(state.errors).toEqual([]);
});

test("hides a prior account's clip and recovery after switching accounts", async ({ page }) => {
  const state = await fixture(page);
  await openClip(page);
  await page.getByRole("button", { name: "Generate clip" }).click();
  await page.getByText('Generation details', { exact: true }).click();
  await expect(page.getByText(`Gallery job ${jobId}`)).toBeVisible();
  state.switchAccount();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Video",exact:true })).toHaveAttribute("aria-pressed","true");
  await expect(page.getByText(`Gallery job ${jobId}`)).toHaveCount(0);
  expect(state.posts()).toBe(1);
  expect(state.errors).toEqual([]);
});

test("signed-out visitors see the same Director without a capability or generation request",async({page})=>{
  const state=await fixture(page,{signedOut:true});
  await page.goto("/create?type=video",{waitUntil:"networkidle"});
  await expect(page.getByRole("button",{name:"Video",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"Sign in to generate"})).toBeVisible();
  await expect(page.getByLabel("Character reference",{exact:true})).toBeVisible();
  for(const mode of ["Text to video","Audio to video","Video to video"]){
    await page.getByRole("button",{name:mode,exact:true}).click();
    await expect(page.getByRole("button",{name:mode,exact:true})).toHaveAttribute("aria-pressed","true");
    await expect(page.getByLabel("Character reference",{exact:true})).toHaveCount(mode === "Video to video" ? 0 : 1);
  }
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:"test-results/director-signed-out-mobile.png",fullPage:true});
  expect(state.posts()).toBe(0);expect(state.errors).toEqual([]);
});

for(const mode of ["audio","video"] as const)test(`${mode} mode prepares one ephemeral source and submits once`,async({page})=>{
  const state=await fixture(page,{sources:true});await openClip(page);
  await page.getByRole("button",{name:mode==="audio"?"Audio to video":"Video to video",exact:true}).click();
  await page.getByRole("combobox",{name:"Clip length",exact:true}).selectOption("33");
  await page.getByRole("combobox",{name:"Resolution",exact:true}).selectOption("512x512");
  await page.getByLabel(mode==="audio"?"Soundtrack":"Source video",{exact:true}).setInputFiles({name:mode==="audio"?"sound.wav":"motion.mp4",mimeType:mode==="audio"?"audio/wav":"video/mp4",buffer:mode==="audio"?Buffer.from("synthetic source sound"):readFileSync(join(__dirname,"../fixtures/clip-81-frames.mp4"))});
  await expect(page.getByRole("button",{name:"Generate clip",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Generate clip",exact:true}).click();await expect.poll(state.posts).toBe(1);
  expect(state.body()).toMatchObject({video:{frames:33,max_cost_micro_usd:27500,reference_audio:expect.stringMatching(/^data:audio\/wav;base64,/),...(mode==="video"?{reference_video:expect.stringMatching(/^data:video\/mp4;base64,/)}:{})}});
  expect(await page.evaluate(()=>localStorage.getItem("aipg-job-store"))).not.toContain("data:audio");
  state.finish();await expect(page.getByLabel("Generated clip")).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:`test-results/director-${mode}-mobile.png`,fullPage:true});
  expect(state.posts()).toBe(1);expect(state.errors).toEqual([]);
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
