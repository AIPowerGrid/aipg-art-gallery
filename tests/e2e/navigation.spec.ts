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
    if (path === "/auth/me") {
      await route.fulfill({ status: 401, json: { error: "not authenticated" } });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "not found" } });
  });

  await page.goto("/create", { waitUntil: "domcontentloaded" });

  const header = page.locator("header");
  await expect(header.getByRole("link", { name: "Studio", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Director", exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Music", exact: true })).toHaveCount(0);
  await expect(header.getByRole("link", { name: "Join", exact: true })).toHaveCount(0);
  const signIn = header.getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).toHaveAttribute("href", "/auth/login");
  await expect(header.getByRole("button", { name: /connect wallet/i })).toHaveCount(0);

  await signIn.click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(page.getByText("Continue with Google", { exact: true })).toBeVisible();
  await expect(page.getByText("Continue with a wallet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect with WalletConnect" })).toHaveCount(1);

  await page.goto("/join");
  await expect(page.getByRole("heading", { name: "Create with AI Power Grid" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with wallet" })).toBeVisible();
  await expect(page.getByText(/unlimited access|5 free/i)).toHaveCount(0);

  const response = await page.request.get("/audio");
  expect(response.status()).toBe(404);
});
