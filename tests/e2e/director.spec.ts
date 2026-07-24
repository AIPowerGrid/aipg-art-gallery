import { expect, Page, test } from "@playwright/test";

const STYLES = {
  models: [
    {
      id: "LTX Director 2.0",
      name: "LTX Director 2.0",
      description: "Chained image-conditioned video",
      type: "video",
      enabled: true,
      default: true,
      requiresImage: true,
      settings: {
        width: 768,
        height: 512,
        steps: 8,
        cfgScale: 1,
        sampler: "euler",
        scheduler: "normal",
        length: 120,
        fps: 24,
      },
      limits: {
        width: { min: 512, max: 1280, step: 64 },
        height: { min: 512, max: 1280, step: 64 },
        steps: { min: 4, max: 20 },
        cfgScale: { min: 1, max: 5 },
        length: { min: 24, max: 240, step: 12 },
      },
    },
  ],
  dimensions: [{ id: 1, name: "Landscape", width: 768, height: 512 }],
  defaultDimensionId: 1,
  defaults: { steps: 8, cfgScale: 1, sampler: "euler", scheduler: "normal" },
};

async function installDirectorMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("aipg_google_id", "director-preview");
    localStorage.setItem("aipg_google_email", "director@example.test");
    localStorage.setItem("aipg_google_name", "Director Preview");
    localStorage.setItem("aipg_google_picture", "");
    localStorage.setItem("aipg_google_expiry", String(Date.now() + 3_600_000));
    if (!sessionStorage.getItem("director-e2e-initialized")) {
      localStorage.removeItem("aipg-director-store");
      sessionStorage.setItem("director-e2e-initialized", "1");
    }
  });

  await page.route("**/api-preview/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api-preview/, "");
    if (path === "/auth/me") {
      await route.fulfill({
        json: {
          authMethod: "google",
          googleId: "director-preview",
          email: "director@example.test",
          name: "Director Preview",
        },
      });
      return;
    }
    if (path === "/styles") {
      await route.fulfill({ json: STYLES });
      return;
    }
    if (path === "/models") {
      await route.fulfill({
        json: {
          chainSource: true,
          models: [
            {
              id: "LTX Director 2.0",
              status: "online",
              onlineWorkers: 1,
            },
          ],
        },
      });
      return;
    }
    if (path === "/jobs" && request.method() === "POST") {
      const body = request.postDataJSON();
      expect(body.modelId).toBe("LTX Director 2.0");
      expect(body.mediaType).toBe("video");
      expect(body.timelineData).toBeTruthy();
      expect(body.localPrompts).toContain("camera glides forward");
      expect(body).not.toHaveProperty("walletAddress");
      await route.fulfill({
        status: 202,
        json: { jobId: "director-preview-job", status: "queued" },
      });
      return;
    }
    if (path === "/gallery" && request.method() === "POST") {
      await route.fulfill({ json: { success: true } });
      return;
    }
    if (path === "/jobs/director-preview-job") {
      await route.fulfill({
        json: {
          jobId: "director-preview-job",
          status: "processing",
          faulted: false,
          waitTime: 5,
          queuePosition: 0,
          processing: 1,
          finished: 0,
          waiting: 0,
          progress: 25,
          generations: [],
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "not found" } });
  });

  await page.route("https://api.web3modal.org/appkit/v1/project-limits**", async (route) => {
    await route.fulfill({ status: 200, json: {} });
  });
}

test("submits a Director segment through the authenticated job contract", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  await installDirectorMocks(page);

  await page.goto("/create/director", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Director" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add your first segment" }).click();

  const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=", "base64");
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "keyframe.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await page.getByLabel("Segment prompt").fill("camera glides forward");
  await page.getByRole("button", { name: "Render segment" }).click();

  await expect(page.getByText("1 / 1 rendered")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stop queue" })).toHaveCount(0);
  expect(browserErrors, `browser errors:\n${browserErrors.join("\n")}`).toEqual([]);
  await page.screenshot({
    path: "test-results/director-submitted.png",
    fullPage: true,
  });
});

test("guides a first-time Director through each required setup step", async ({ page }) => {
  await installDirectorMocks(page);

  await page.goto("/create/director", { waitUntil: "networkidle" });
  await expect(page.getByText("Start here: add your first segment")).toBeVisible();
  await page.getByRole("button", { name: "Start here: add your first segment" }).click();
  await expect(page.getByText("Upload the first frame for this segment.")).toBeVisible();

  // The project persists, but the selected segment intentionally does not.
  // This was the confusing production path that prompted the coach marks.
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByText("Click segment 1 in the timeline to open its required fields.")).toBeVisible();
  await page.locator('[aria-label="Select segment 1"]').click();
  await expect(page.getByText("Upload the first frame for this segment.")).toBeVisible();
  await page.screenshot({
    path: "test-results/director-onboarding.png",
    fullPage: true,
  });

  const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nK0AAAAASUVORK5CYII=", "base64");
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "keyframe.png",
    mimeType: "image/png",
    buffer: onePixelPng,
  });
  await expect(page.getByText("Describe what should happen during this segment.")).toBeVisible();
  await page.getByLabel("Segment prompt").fill("camera glides forward");
  await expect(page.getByText("Render this segment. Sign-in will open here if needed.")).toBeVisible();
});

test("stacks the Director workspace inside a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installDirectorMocks(page);

  await page.goto("/create/director", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Director" })).toBeVisible();

  const bounds = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="director-console"]');
    const rail = document.querySelector('[data-testid="director-rail"]');
    const rootRect = root?.getBoundingClientRect();
    const railRect = rail?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      rootLeft: rootRect?.left,
      rootRight: rootRect?.right,
      railLeft: railRect?.left,
      railRight: railRect?.right,
    };
  });

  expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.rootLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.rootRight).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.railLeft).toBeGreaterThanOrEqual(0);
  expect(bounds.railRight).toBeLessThanOrEqual(bounds.viewportWidth);
  await page.screenshot({
    path: "test-results/director-mobile.png",
    fullPage: true,
  });
});
