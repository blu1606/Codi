import { defineConfig, devices } from "@playwright/test";

// System tests for the three main features (cart and voucher, checkout and payment, learning path). Each test case
// matches one row of the System Test Excel by its ID. They write data (orders, carts, path settings), so run them only
// against a local app with a local database:
//   npm start                                  (web on http://localhost:3001, demo tools on)
//   npx playwright test -c playwright.system.config.ts
// Global setup recreates the loadtest+NNN@codi.test learners, so every run starts from the same state.
// For a live demo, SLOW_MO=<ms> pauses before every browser action (e.g. SLOW_MO=500 ... --headed); timeouts grow to match.
const slowMo = Number(process.env.SLOW_MO) || 0;

export default defineConfig({
  testDir: "e2e/system",
  globalSetup: "./e2e/system/global-setup.ts",
  timeout: slowMo ? 300_000 : 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report/system" }], ["json", { outputFile: "e2e/results/system/results.json" }]],
  outputDir: "e2e/results/system/artifacts",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3001",
    locale: "vi-VN",
    viewport: { width: 1366, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { slowMo },
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } }],
});
