import { defineConfig, devices } from "@playwright/test";

// Browser checks against a running Codi rebuild. Nothing is started here: point E2E_BASE_URL at the local Docker
// image (default), `npm start` (also :3001), or the VPS for the read-only fast check.
//   npm run fastcheck:ui                                         local, http://localhost:3001
//   E2E_BASE_URL=https://codi.hoangblue.dev npm run fastcheck:ui  production, read-only pages only
//   npm run test:e2e                                             fast check + role guards (signs in seeded accounts)
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  outputDir: "e2e/results",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3001",
    locale: "vi-VN",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@fast/ },
  ],
});
