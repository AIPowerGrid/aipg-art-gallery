import { expect, Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import sharp from "sharp";

const IMAGE = `data:image/png;base64,${readFileSync("public/aipg_logo_small.png").toString("base64")}`;
const BATCH_IMAGE = IMAGE;

for (const width of [1280, 390]) {
  for (const [shape, imageWidth, imageHeight] of [
    ['portrait', 512, 1024], ['landscape', 1344, 768],
    ['square', 1024, 1024], ['small', 128, 96],
  ] as const) {
    test(`bounds the ${shape} current image without stretching at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await installStudioMocks(page);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const url = 'https://images.aipg.art/preview-fixture.png';
      const raster = await sharp({ create: { width: imageWidth, height: imageHeight,
        channels: 3, background: '#428a72' } }).png().toBuffer();
      await page.route(url, route => route.fulfill({ contentType: 'image/png', body: raster }));
      // Deliberately wrong request dimensions must not dictate completed geometry.
      await page.route('**/api-preview/gallery/me*', route => route.fulfill({ json: {
        items: [{ ...ITEMS[0], mediaUrls: [url], params: { width: 1024, height: 1024 } }], count: 1,
      } }));
      await page.route('**/api-preview/gallery/latest-job/media', route => route.fulfill({ json: {
        jobId: 'latest-job', mediaUrls: [url], type: 'image', source: 'cache',
      } }));
      await page.goto('/create');
      const preview = page.getByRole('region', { name: 'Current generation' }).locator('img');
      await expect(preview).toBeVisible();
      await expect.poll(() => preview.evaluate(image =>
        (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 1,
      )).toBe(true);
      await expect(preview).toHaveAttribute('src', url);
      await expect(preview).not.toHaveClass(/sr-only/);
      const box = await preview.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width / box!.height).toBeCloseTo(imageWidth / imageHeight, 2);
      expect(box!.width).toBeLessThanOrEqual(Math.min(imageWidth, 720));
      expect(box!.height).toBeLessThanOrEqual(Math.min(imageHeight, 540));
      const frame = await preview.evaluate(image => image.parentElement!.getBoundingClientRect().width);
      expect(frame).toBeCloseTo(box!.width, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await preview.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`focus-${shape}.png`) });
      await preview.click();
      await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
}

for (const width of [1280, 390]) {
  test(`uses the MOSS source-image preset without unsupported controls at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installStudioMocks(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const actualStyles = JSON.parse(readFileSync('config/styles.json', 'utf8'));
    actualStyles.models = actualStyles.models.filter((model: { id: string }) =>
      ['MOSS Image SFT BF16', 'Krea 2 Turbo'].includes(model.id));
    await page.route('**/api-preview/styles', route => route.fulfill({ json: actualStyles }));
    await page.route('**/api-preview/models', route => route.fulfill({ json: { models: [
      { id: 'MOSS Image SFT BF16', status: 'online', onlineWorkers: 1, capabilities: ['txt2img', 'img2img'] },
      { id: 'Krea 2 Turbo', status: 'online', onlineWorkers: 1, capabilities: ['txt2img', 'img2img'] },
    ] } }));
    let posts = 0;
    await page.route('**/api-preview/**', async route => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api-preview/, '');
      if (path === '/credits' || path === '/credits/quote') {
        const credit = liveCredits(1);
        credit.estimate = { ...credit.estimate, model: 'MOSS Image SFT BF16', cost_usd: 0.01 };
        await route.fulfill({ json: credit });
        return;
      }
      if (path === '/jobs' && route.request().method() === 'POST') {
        posts++;
        const body = route.request().postDataJSON();
        expect(body.modelId).toBe('MOSS Image SFT BF16');
        expect(body.sourceProcessing).toBe('img2img');
        expect(body.sourceImage).toMatch(/^data:image\/png;base64,/);
        expect(body.loras).toBeUndefined();
        expect(body.params).toMatchObject({ width: 1344, height: 768, steps: 50, cfgScale: 3,
          sampler: 'euler', scheduler: 'simple', n: 1 });
        await route.fulfill({ json: { jobId: 'moss-gallery-job', status: 'queued' } });
        return;
      }
      if (path === '/jobs/moss-gallery-job') {
        await route.fulfill({ json: { jobId: 'moss-gallery-job', gridJobId: 'moss-core-receipt',
          status: 'completed', finished: 1, processing: 0, waiting: 0, faulted: false,
          waitTime: 0, queuePosition: 0, generations: [{ id: 'moss-output', kind: 'image', seed: '739', url: BATCH_IMAGE }] } });
        return;
      }
      if ((path === '/gallery' && route.request().method() === 'POST') ||
          (path === '/gallery/moss-gallery-job' && route.request().method() === 'PATCH')) {
        await route.fulfill({ json: { success: true } });
        return;
      }
      await route.fallback();
    });
    await page.goto('/create');
    await page.getByRole('button', { name: 'MOSS Image SFT', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Generate 4 images' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '2.4:1', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '16:9', exact: true }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'source.png', mimeType: 'image/png',
      buffer: Buffer.from(IMAGE.split(',')[1], 'base64') });
    await page.getByRole('tab', { name: /advanced/i }).click();
    await expect(page.getByRole('button', { name: /LoRA/ })).toHaveCount(0);
    await page.getByPlaceholder('Describe your image...').fill('Synthetic MOSS source-image fixture');
    await page.getByRole('button', { name: width < 768 ? 'Generate' : /Generate.*with MOSS/, exact: width < 768 }).click();
    const canvas = page.getByRole('region', { name: 'Current generation' });
    await expect(canvas.locator('img')).toHaveCount(1, { timeout: 20_000 });
    await expect.poll(() => canvas.locator('img').evaluateAll(images => images.every(
      image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 1,
    ))).toBe(true);
    expect(posts).toBe(1);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('moss-source.png'), fullPage: true });
  });
}

const STYLES = {
  models: [
    {
      id: "Krea 2 Turbo",
      name: "Krea 2 Turbo",
      description: "Fast image generation",
      type: "image",
      enabled: true,
      default: true,
      settings: { steps: 8, cfgScale: 1, sampler: "euler" },
      limits: { steps: { min: 8, max: 12 }, cfgScale: { min: 1, max: 3 } },
      capabilities: ["txt2img", "img2img"],
      status: "online",
      onlineWorkers: 1,
    },
  ],
  dimensions: [{ id: 1, name: "Square", width: 1024, height: 1024 }],
  defaultDimensionId: 1,
  defaults: { steps: 8, cfgScale: 1, sampler: "euler", scheduler: "normal" },
};

const ITEMS = [
  {
    jobId: "latest-job",
    gridJobId: "grid-latest-job",
    modelId: "Krea 2 Turbo",
    modelName: "Krea 2 Turbo",
    prompt: "A luminous city powered by a community grid",
    type: "image",
    isNsfw: false,
    isPublic: false,
    createdAt: Date.now(),
    mediaUrls: [IMAGE],
    params: { width: 1024, height: 1024, steps: 8 },
  },
  {
    jobId: "older-job",
    modelId: "Krea 2 Turbo",
    modelName: "Krea 2 Turbo",
    prompt: "An older generation",
    type: "image",
    isNsfw: false,
    isPublic: false,
    createdAt: Date.now() - 60_000,
    mediaUrls: [IMAGE],
    params: { width: 1024, height: 1024, steps: 8 },
  },
];

async function installStudioMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("aipg_google_id", "studio-preview");
    localStorage.setItem("aipg_google_email", "studio@example.test");
    localStorage.setItem("aipg_google_name", "Studio Preview");
    localStorage.setItem("aipg_google_picture", "");
    localStorage.setItem("aipg_google_expiry", String(Date.now() + 3_600_000));
    localStorage.setItem("aipg_auth_account_id", "account-1");
    if (!sessionStorage.getItem("studio-e2e-initialized")) {
      localStorage.removeItem("aipg-job-store");
      sessionStorage.setItem("studio-e2e-initialized", "1");
    }
  });

  await page.route("**/api-preview/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api-preview/, "");
    if (path === "/auth/me") {
      await route.fulfill({
        json: {
          authMethod: "google",
          accountId: "account-1",
          googleId: "studio-preview",
          email: "studio@example.test",
          name: "Studio Preview",
        },
      });
      return;
    }
    if (path === "/styles") {
      await route.fulfill({ json: STYLES });
      return;
    }
    if (path === "/styles/grid") {
      await route.fulfill({ json: { styles: [] } });
      return;
    }
    if (path === "/models") {
      await route.fulfill({
        json: {
          chainSource: true,
          models: [{ id: "Krea 2 Turbo", status: "online", onlineWorkers: 1, capabilities: ["txt2img", "img2img"] }],
        },
      });
      return;
    }
    if (path === "/credits" || path === "/credits/quote") {
      await route.fulfill({
        json: {
          account_id: "account-1",
          promotional: { remaining_usd: 0, active: false },
          free: { remaining_usd: 0, daily_cap_usd: 0, active: false },
          paid: { balance_usd: 1 },
          total_spendable_micro: 1_000_000,
          total_spendable_usd: 1,
          total_preview_usd: 1,
          charging_enabled: false,
          charging_mode: "off",
          estimate: { model: "Krea 2 Turbo", modality: "image", priced: true, cost_usd: 0.001 },
        },
      });
      return;
    }
    if (path === "/gallery/me") {
      await route.fulfill({ json: { items: ITEMS, count: ITEMS.length, wallet: "" } });
      return;
    }
    const mediaMatch = path.match(/^\/gallery\/([^/]+)\/media$/);
    if (mediaMatch) {
      await route.fulfill({
        json: { jobId: mediaMatch[1], mediaUrls: [IMAGE], type: "image", source: "cache" },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: `unhandled test route ${path}` } });
  });
}

test("keeps cached creations isolated across account reloads", async ({ page }) => {
  await installStudioMocks(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let owner = "account-1";
  await page.route("**/api-preview/auth/me", route => route.fulfill({ json: {
    authMethod: "google", accountId: owner, googleId: owner,
    email: "fixture@example.test", name: "Fixture",
  } }));
  await page.route("**/api-preview/gallery/me*", route => route.fulfill({ json: {
    items: [], count: 0, wallet: owner,
  } }));
  await page.goto("/create");
  await expect(page.getByRole("button", { name: "Account", exact: true })).toBeVisible();
  await page.evaluate(({ image }) => {
    const jobs = ["account-1", "account-2"].map(walletAddress => ({
      jobId: walletAddress, walletAddress, modelId: "Krea 2 Turbo", modelName: "Krea 2 Turbo",
      prompt: `Private creation for ${walletAddress}`, type: "image",
      isNsfw: false, isPublic: false, status: "completed", submittedAt: Date.now(),
      result: { status: "completed", generations: [{ id: walletAddress, kind: "image", seed: "1", url: image }] },
    }));
    localStorage.setItem("aipg-job-store", JSON.stringify({ state: { jobs, requests: [] }, version: 0 }));
  }, { image: IMAGE });
  await page.reload();
  await expect(page.getByText("Private creation for account-1", { exact: true })).toBeVisible();
  await expect(page.getByText("Private creation for account-2", { exact: true })).toHaveCount(0);
  owner = "account-2";
  await page.reload();
  await expect(page.getByText("Private creation for account-2", { exact: true })).toBeVisible();
  await expect(page.getByText("Private creation for account-1", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

function liveCredits(balance: number) {
  return {
    account_id: "account-1",
    promotional: { remaining_usd: 0, active: false },
    free: { remaining_usd: 0, daily_cap_usd: 0.01, active: true },
    paid: { balance_usd: balance },
    total_spendable_micro: Math.round(balance * 1_000_000),
    total_spendable_usd: balance,
    total_preview_usd: balance,
    charging_enabled: true,
    charging_mode: "on",
    estimate: { model: "Krea 2 Turbo", modality: "image", priced: true, cost_usd: 0.005 },
  };
}

test("shows a definite credit rejection without retrying or losing the prompt", async ({ page }) => {
  await installStudioMocks(page);
  let posts = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api-preview/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api-preview/, "");
    if (path === "/credits" || path === "/credits/quote") {
      // Another app can consume the quoted balance before this POST reaches Core.
      await route.fulfill({ json: liveCredits(0.01) });
      return;
    }
    if (path === "/jobs" && route.request().method() === "POST") {
      posts++;
      await route.fulfill({ status: 402, json: { error: "insufficient Grid credits" } });
      return;
    }
    await route.fallback();
  });
  await page.goto("/create");
  await expect(page.getByText("Estimated charge $0.005")).toBeVisible();
  await expect(page.getByText("Free during preview")).toHaveCount(0);
  await page.getByPlaceholder("Describe your image...").fill("Retain this rejected prompt");
  await page.getByRole("button", { name: /Generate.*with Krea/ }).click();
  await expect(page.getByText("insufficient Grid credits", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Describe your image...")).toHaveValue("Retain this rejected prompt");
  const funding = await page.getByRole("link", { name: "Add credits", exact: true }).last().getAttribute("href");
  expect(new URL(funding!).origin).toBe("https://console.aipowergrid.io");
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("aipg-job-store") || "null")?.state);
  expect(state.requests).toEqual([]);
  expect(state.jobs).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Latest creation" })).toBeVisible();
  expect(posts).toBe(1);
  expect(errors).toEqual([]);
});

test("surfaces a worker failure and refreshes the balance without a paid retry", async ({ page }) => {
  await installStudioMocks(page);
  let posts = 0;
  let polls = 0;
  let released = false;
  let refreshedAfterFailure = 0;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api-preview/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api-preview/, "");
    if (path === "/credits" || path === "/credits/quote") {
      const held = posts > 0 && !released;
      if (path === "/credits" && released) refreshedAfterFailure++;
      await route.fulfill({ json: liveCredits(held ? 0.995 : 1) });
      return;
    }
    if (path === "/jobs" && route.request().method() === "POST") {
      posts++;
      await route.fulfill({ json: { jobId: "failed-gallery-job", status: "queued" } });
      return;
    }
    if (path === "/gallery" && route.request().method() === "POST") {
      await route.fulfill({ json: { success: true } });
      return;
    }
    if (path === "/jobs/failed-gallery-job") {
      polls++;
      released = polls > 1;
      await route.fulfill({ json: {
        jobId: "failed-gallery-job", gridJobId: "failed-core-receipt",
        status: released ? "faulted" : "processing", faulted: released,
        processing: released ? 0 : 1, finished: 0, waiting: 0, waitTime: 1,
        queuePosition: 0, generations: [],
        ...(released ? { error: "Worker failed to generate image" } : {}),
      } });
      return;
    }
    await route.fallback();
  });
  await page.goto("/create");
  await expect(page.getByText("Estimated charge $0.005")).toBeVisible();
  await page.getByPlaceholder("Describe your image...").fill("A controlled worker failure");
  await page.getByRole("button", { name: /Generate.*with Krea/ }).click();
  await expect.poll(() => released, { timeout: 20_000 }).toBe(true);
  await expect(page.getByText("Worker failed to generate image", { exact: true })).toBeVisible();
  await expect(page.getByText("Spendable $1.00", { exact: true })).toBeVisible();
  expect(released).toBe(true);
  expect(refreshedAfterFailure).toBeGreaterThan(0);
  expect(posts).toBe(1);
  await page.reload();
  await expect(page.getByText("Worker failed to generate image", { exact: true })).toBeVisible();
  expect(posts).toBe(1);
  expect(errors).toEqual([]);
  // This asserts display refresh, not a refund: the real ledger lives in Core.
});

for (const scenario of ["other owner", "newer success"] as const) {
  test(`does not surface a stored failure after ${scenario}`, async ({ page }) => {
    await installStudioMocks(page);
    await page.addInitScript((scenario) => {
      const failed = {
        jobId: "old-failure", status: "faulted", error: "An unrelated failure",
        walletAddress: scenario === "other owner" ? "account-2" : "account-1",
        submittedAt: Date.now() - 1000, prompt: "Old job", model: "Krea 2 Turbo",
      };
      const jobs = scenario === "newer success" ? [failed, {
        ...failed, jobId: "new-success", status: "completed", error: undefined,
        submittedAt: Date.now(),
      }] : [failed];
      localStorage.setItem("aipg-job-store", JSON.stringify({ state: { jobs, requests: [] }, version: 0 }));
    }, scenario);
    await page.goto("/create");
    await expect(page.getByRole("heading", { name: "Latest creation" })).toBeVisible();
    await expect(page.getByText("An unrelated failure", { exact: true })).toHaveCount(0);
  });
}

test("focuses the latest result and gives Google accounts a creation library", async ({ page }) => {
  await installStudioMocks(page);
  await page.goto("/create");

  await expect(page.getByText("Preview price $0.001")).toBeVisible();
  await expect(page.getByText("Free during preview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest creation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent creations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "My Creations", exact: true }).first()).toBeVisible();
  await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await page.locator("header").getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("button", { name: "Link wallet" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Latest creation" })).toBeVisible();

  await page.getByRole("link", { name: "My Creations", exact: true }).first().click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "My Creations" })).toBeVisible();
  await expect(
    page.getByRole("img", { name: "A luminous city powered by a community grid" }),
  ).toBeVisible();
});

test("keeps the focused Studio inside a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installStudioMocks(page);
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "Latest creation" })).toBeVisible();

  const bounds = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth);
});

for (const width of [1280, 390]) {
  test(`submits and displays all four batch outputs at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await installStudioMocks(page);
    let posts = 0;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api-preview/**', async route => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api-preview/, '');
      if (path === '/jobs' && route.request().method() === 'POST') {
        posts++;
        expect(route.request().postDataJSON().params.n).toBe(4);
        await route.fulfill({ json: { jobId: 'batch-gallery-job', status: 'queued' } });
        return;
      }
      if (path === '/jobs/batch-gallery-job') {
        await route.fulfill({ json: {
          jobId: 'batch-gallery-job', gridJobId: 'batch-core-receipt', status: 'completed',
          finished: 4, processing: 0, waiting: 0, faulted: false, waitTime: 0, queuePosition: 0,
          generations: Array.from({ length: 4 }, (_, i) => ({
            id: `batch-${i}`, kind: 'image', seed: String(42+i), url: BATCH_IMAGE,
          })),
        } });
        return;
      }
      if ((path === '/gallery' && route.request().method() === 'POST') ||
          (path === '/gallery/batch-gallery-job' && route.request().method() === 'PATCH')) {
        await route.fulfill({ json: { success: true } });
        return;
      }
      await route.fallback();
    });
    await page.goto('/create');
    await page.getByText('Generate 4 images', { exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Generate 4 images' })).toBeChecked();
    await page.getByPlaceholder('Describe your image...').fill('Four batch canary images');
    await page.getByRole('button', { name: /Generate.*4/ }).click();
    const canvas = page.getByRole('region', { name: 'Current generation' });
    await expect(canvas.locator('img')).toHaveCount(4, { timeout: 20000 });
    await expect.poll(() => canvas.locator('img').evaluateAll(images => images.every(
      image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 1,
    ))).toBe(true);
    expect(posts).toBe(1);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('batch-four.png'), fullPage: true });
    await page.locator('input[type=file]').setInputFiles({
      name: 'source.png', mimeType: 'image/png', buffer: Buffer.from(IMAGE.split(',')[1], 'base64'),
    });
    await expect(page.getByRole('checkbox', { name: 'Generate 4 images' })).toHaveCount(0);
    await page.getByRole('button', { name: '×', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Generate 4 images' })).not.toBeChecked();
  });
}

for (const mergeAccount of [false, true]) {
test(`recovers a lost generation response after ${mergeAccount ? "account merge and " : ""}reload without another POST`, async ({ page }, testInfo) => {
  await installStudioMocks(page);
  let posts = 0;
  let requestId = "";
  let merged = false;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const result = {
    jobId: "recovered-gallery-job", gridJobId: "recovered-core-receipt",
    status: "completed", faulted: false, processing: 0, finished: 1, waiting: 0,
    waitTime: 0, queuePosition: 0,
    generations: [{ id: "recovered-output", kind: "image", seed: "1", url: IMAGE }],
  };
  await page.route("**/api-preview/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api-preview/, "");
    if (path === "/auth/me" && merged) {
      await route.fulfill({ json: { authMethod: "google", googleId: "google-user", accountId: "account-merged",
        accountAliases: ["account-1"], name: "Test User", email: "user@example.test", address: "" } });
      return;
    }
    if (path === "/jobs" && route.request().method() === "POST") {
      posts++;
      requestId = route.request().postDataJSON().requestId;
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("aipg-job-store") || "null"));
      expect(saved.state.requests[0]).toMatchObject({ requestId, owner: "account-1" });
      await route.abort("connectionreset");
      return;
    }
    if (path.startsWith("/jobs/requests/")) {
      expect(decodeURIComponent(path.split("/").at(-1)!)).toBe(requestId);
      expect(route.request().method()).toBe("GET");
      await route.fulfill({ json: result });
      return;
    }
    if (path === "/jobs/recovered-gallery-job") {
      await route.fulfill({ json: result });
      return;
    }
    if ((path === "/gallery" && route.request().method() === "POST") || (path === "/gallery/recovered-gallery-job" && route.request().method() === "PATCH")) {
      await route.fulfill({ json: { success: true } });
      return;
    }
    await route.fallback();
  });
  await page.goto("/create");
  await page.getByPlaceholder("Describe your image...").fill("Recovery canary scene");
  await page.getByRole("button", { name: /Generate.*with Krea/ }).click();
  await expect(page.getByText(/Generation outcome is unknown/).first()).toBeVisible();
  await page.getByRole("button", { name: /Jobs/ }).click();
  await expect(page.getByText("Checking original request")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("pending-request.png"), fullPage: true });
  merged = mergeAccount;
  await page.reload();
  await expect.poll(async () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("aipg-job-store") || "null")?.state;
    return state?.jobs?.find((job: { jobId: string }) => job.jobId === "recovered-gallery-job")?.status;
  })).toBe("completed");
  expect(posts).toBe(1);
  const recoveredOwner = await page.evaluate(() => JSON.parse(localStorage.getItem("aipg-job-store") || "null")?.state.jobs.find((job: { jobId: string }) => job.jobId === "recovered-gallery-job")?.walletAddress);
  expect(recoveredOwner).toBe(mergeAccount ? "account-merged" : "account-1");
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("recovered-studio.png"), fullPage: true });
});
}
