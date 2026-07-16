import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3002",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=playwright-local NEXT_PUBLIC_GALLERY_API=/api-preview npm run build && npm run start -- -p 3002",
    url: "http://127.0.0.1:3002",
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
