import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.GALLERY_E2E_PORT || 3002);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid GALLERY_E2E_PORT");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=playwright-local NEXT_PUBLIC_GALLERY_API=/api-preview npm run build && npm run start -- -p ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
