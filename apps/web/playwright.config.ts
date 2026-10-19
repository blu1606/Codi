import { defineConfig } from "@playwright/test";

import { loadLocalEnv } from "./e2e/env";

// Credentials and DATABASE_URL come from apps/web/.env (never from source). Values already present in
// process.env win, so CI can inject them directly.
loadLocalEnv();

const DEFAULT_BASE_URL = "http://localhost:3002";
const baseURL = process.env.E2E_BASE_URL || DEFAULT_BASE_URL;
const channel = process.env.PW_CHANNEL || "chrome";
// Port 3001 is the everyday `pnpm dev` port; the suite owns 3002 so both can run side by side.
const startLocalServer = baseURL === DEFAULT_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  testMatch: /.*\.(spec|setup)\.ts$/,
  outputDir: "test-results",
  fullyParallel: false,
  // The dev database is shared; tests mutate the seeded learner's cart and create throwaway accounts.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    channel,
    locale: "vi-VN",
    timezoneId: "Asia/Bangkok",
    // Traces record every request URL, including the VietQR URL that embeds the receiving bank account,
    // so they stay off; failure screenshots are taken with that image blocked (see e2e/fixtures.ts).
    trace: "off",
    screenshot: "only-on-failure",
    // Next dev compiles routes on first hit; a cold route can take well over 30 s.
    navigationTimeout: 120_000,
    actionTimeout: 30_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "chromium-desktop",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts$/,
      grepInvert: /@mobile/,
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-390",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts$/,
      grep: /@mobile/,
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
  webServer: startLocalServer
    ? {
        command: "node scripts/prepare-pdf-assets.mjs && pnpm exec next dev --port 3002",
        url: `${DEFAULT_BASE_URL}/login`,
        reuseExistingServer: true,
        timeout: 300_000,
        stdout: "ignore",
        stderr: "pipe",
        env: { BETTER_AUTH_URL: DEFAULT_BASE_URL },
      }
    : undefined,
});
