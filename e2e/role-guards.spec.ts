import { expect, test, type Page } from "@playwright/test";

import { SEED, signIn } from "./health";

// Role guards in the interface and in the API. Signs in the seeded demo accounts (docs/getting-started.md), so run
// it against a local or test database, not production.

const SIGN_IN_REQUIRED = "Vui lòng đăng nhập";
const FORBIDDEN = "Bạn không có quyền truy cập trang này";

async function expectGuard(page: Page, route: string, text: string) {
  await page.goto(route);
  await expect(page.getByText(text, { exact: true }), `${route} shows "${text}"`).toBeVisible();
}

test.describe("role guards", () => {
  test("a guest gets the sign-in page on every protected route", async ({ page }) => {
    for (const route of ["/dashboard", "/progress", "/cart", "/settings", "/admin", "/admin/users", "/teach"]) {
      await expectGuard(page, route, SIGN_IN_REQUIRED);
    }
  });

  test("a learner cannot open admin or lecturer pages", async ({ page }) => {
    await signIn(page, SEED.learner);
    for (const route of ["/admin", "/admin/users", "/admin/finance", "/teach", "/teach/grading"]) {
      await expectGuard(page, route, FORBIDDEN);
    }
  });

  test("a lecturer cannot open admin or learner-only pages", async ({ page }) => {
    await signIn(page, SEED.lecturer);
    for (const route of ["/admin", "/admin/users", "/dashboard", "/cart"]) await expectGuard(page, route, FORBIDDEN);
  });

  test("the API refuses staff data to a learner even when the interface is bypassed", async ({ page }) => {
    await signIn(page, SEED.learner);
    for (const path of ["/api/admin/users", "/api/admin/finance/overview", "/api/admin/insights/overview", "/api/admin/vouchers"]) {
      const res = await page.request.get(path);
      expect([401, 403], `${path} -> ${res.status()}`).toContain(res.status());
    }
  });

  test("the API refuses protected data to a guest", async ({ request }) => {
    for (const path of ["/api/learner/overview", "/api/student/cart", "/api/admin/users", "/api/notifications"]) {
      const res = await request.get(path);
      expect([401, 403], `${path} -> ${res.status()}`).toContain(res.status());
    }
  });
});
