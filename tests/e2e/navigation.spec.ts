import { expect, test } from "@playwright/test";

test("promotes Director and keeps standalone music off aipg.art", async ({ page }) => {
  await page.route("**/api-preview/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api-preview/, "");
    if (path === "/styles") {
      await route.fulfill({
        json: {
          models: [],
          dimensions: [{ id: 1, name: "Square", width: 1024, height: 1024 }],
          defaultDimensionId: 1,
          defaults: { steps: 20, cfgScale: 3.5, sampler: "euler", scheduler: "normal" },
        },
      });
      return;
    }
    if (path === "/styles/grid") {
      await route.fulfill({ json: { styles: [] } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "not found" } });
  });

  await page.goto("/create", { waitUntil: "domcontentloaded" });

  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "Studio", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Director", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Music", exact: true })).toHaveCount(0);

  const response = await page.request.get("/audio");
  expect(response.status()).toBe(404);
});
