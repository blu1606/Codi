import fs from "node:fs";
import path from "node:path";

import { expect, test as setup } from "@playwright/test";

import { authFile, seedEmail, type SeedRole } from "./env";
import { signInViaForm } from "./fixtures";

const ROLE_HOME: Record<SeedRole, RegExp> = {
  learner: /^\/dashboard(\/learner)?$/,
  lecturer: /^\/dashboard\/lecturer$/,
  admin: /^\/dashboard\/admin$/,
};

for (const role of ["learner", "lecturer", "admin"] as const) {
  setup(`sign in seeded ${role}`, async ({ page }) => {
    fs.mkdirSync(path.dirname(authFile(role)), { recursive: true });
    await signInViaForm(page, seedEmail(role));
    await page.waitForURL((url) => ROLE_HOME[role].test(url.pathname), { timeout: 90_000 }).catch(() => {
      throw new Error(
        `Seeded ${role} did not reach its home page (now at ${new URL(page.url()).pathname}). ` +
          "Run `pnpm db:seed-accounts` and check SEED_ACCOUNT_* in apps/web/.env.",
      );
    });
    await expect(page.locator("h1").first()).toBeVisible();
    await page.context().storageState({ path: authFile(role) });
  });
}
