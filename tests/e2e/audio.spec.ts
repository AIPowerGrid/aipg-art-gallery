import { expect, Page, test } from "@playwright/test";

async function installAudioMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("aipg_google_id", "local-preview");
    localStorage.setItem("aipg_google_email", "preview@example.test");
    localStorage.setItem("aipg_google_name", "Preview");
    localStorage.setItem("aipg_google_picture", "");
    localStorage.setItem("aipg_google_expiry", String(Date.now() + 3_600_000));
    localStorage.removeItem("aipg_audio_history_v1");
    localStorage.removeItem("aipg_audio_active_job_v1");
  });

  let polls = 0;
  await page.route("**/api-preview/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api-preview/, "");
    if (path === "/auth/me") {
      await route.fulfill({
        json: {
          authMethod: "google",
          googleId: "local-preview",
          email: "preview@example.test",
          name: "Preview",
        },
      });
      return;
    }
    if (path === "/credits") {
      await route.fulfill({
        json: {
          promotional: { remaining_usd: 1.5, active: true },
          free: { remaining_usd: 0.5, daily_cap_usd: 0.5, active: true },
          paid: { balance_usd: 4.25 },
          total_spendable_usd: 6.25,
          total_preview_usd: 6.25,
          charging_enabled: false,
        },
      });
      return;
    }
    if (path === "/audio/jobs" && request.method() === "POST") {
      const body = request.postDataJSON();
      expect(body).toMatchObject({
        prompt: "Warm analog pulse",
        lyrics: "[Verse]\nElectric rain",
        seconds: 30,
        inferenceSteps: 8,
      });
      polls = 0;
      await route.fulfill({ status: 202, json: { jobId: "audio-preview", status: "queued" } });
      return;
    }
    if (path === "/jobs/audio-preview") {
      polls += 1;
      await route.fulfill({
        json:
          polls === 1
            ? {
                jobId: "audio-preview",
                status: "processing",
                faulted: false,
                progress: 54,
                waitTime: 0,
                queuePosition: 0,
                processing: 1,
                finished: 0,
                waiting: 0,
                generations: [],
              }
            : {
                jobId: "audio-preview",
                status: "completed",
                faulted: false,
                waitTime: 0,
                queuePosition: 0,
                processing: 0,
                finished: 1,
                waiting: 0,
                worker: "preview-rig",
                genTime: 8.4,
                model: "ace-step-v1.5-turbo",
                generations: [
                  {
                    id: "audio-preview-0",
                    seed: "42",
                    kind: "audio",
                    url: "https://media.aipg.art/audio/preview/0.wav",
                  },
                ],
              },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "not found" } });
  });

  await page.route("https://media.aipg.art/audio/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "audio/wav", body: "RIFF" });
  });

  await page.route("https://api.web3modal.org/appkit/v1/project-limits**", async (route) => {
    await route.fulfill({ status: 200, json: {} });
  });
}

test("submits and completes an authenticated audio job", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) {
      browserErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  await installAudioMocks(page);

  await page.goto("/audio", { waitUntil: "networkidle" });
  await expect(page.getByText("Promo $1.50")).toBeVisible();
  await page.getByLabel("Describe the track").fill("Warm analog pulse");
  await page.getByRole("button", { name: "With lyrics" }).click();
  await page.getByLabel("Lyrics").fill("[Verse]\nElectric rain");
  await page.getByRole("button", { name: "Generate music" }).click();

  await expect(page.getByText("Generating audio")).toBeVisible();
  await expect(page.getByText("seed 42", { exact: false })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("audio")).toHaveAttribute(
    "src",
    "https://media.aipg.art/audio/preview/0.wav",
  );
  await expect(page.getByRole("link", { name: "Download WAV" })).toHaveAttribute(
    "href",
    /\/api\/download\?url=/,
  );
  expect(browserErrors, `browser errors:\n${browserErrors.join("\n")}`).toEqual([]);
  await page.screenshot({ path: "test-results/audio-complete.png", fullPage: true });
});

test("keeps the audio workspace readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAudioMocks(page);
  await page.goto("/audio", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "Music Studio" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: "test-results/audio-mobile.png", fullPage: true });
});
