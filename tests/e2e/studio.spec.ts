import { expect, Page, test } from "@playwright/test";

const IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

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
    localStorage.removeItem("aipg-job-store");
  });

  await page.route("**/api-preview/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api-preview/, "");
    if (path === "/auth/me") {
      await route.fulfill({
        json: {
          authMethod: "google",
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

test("focuses the latest result and gives Google accounts a creation library", async ({ page }) => {
  await installStudioMocks(page);
  await page.goto("/create");

  await expect(page.getByText("Preview price $0.001")).toBeVisible();
  await expect(page.getByText("Free during preview")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Latest creation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent creations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "My Creations", exact: true }).first()).toBeVisible();

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
