import { expect, test } from "@playwright/test";

import { signIn, watchHealth } from "./health";

// Interface fast check (@fast): the public pages render in a real browser with no script errors and no broken
// requests. Read-only, so it is safe against production. Set FASTCHECK_EMAIL and FASTCHECK_PASSWORD to also sign in
// once and reach that account's home (no data is changed).

test.describe("@fast interface fast check", () => {
  test("home page renders its heading and links to the catalogue", async ({ page, baseURL }) => {
    const health = watchHealth(page, baseURL!);
    await page.goto("/");
    await expect(page.locator("#app-main h1").first()).toBeVisible();
    // On mobile the header links sit behind the menu button, so only their presence is checked.
    await expect(page.locator('a[href="/courses"]').first()).toBeAttached();
    health.assertClean();
  });

  test("catalogue lists courses and a course detail opens", async ({ page, baseURL }) => {
    const health = watchHealth(page, baseURL!);
    await page.goto("/courses");
    const firstCourse = page.locator('#app-main a[href^="/courses/"]').first();
    await expect(firstCourse, "catalogue shows at least one course").toBeVisible();
    await firstCourse.click();
    await expect(page).toHaveURL(/\/courses\/[^/]+$/);
    await expect(page.locator("#app-main h1").first()).toBeVisible();
    health.assertClean();
  });

  test("sign-in form is usable", async ({ page, baseURL }) => {
    const health = watchHealth(page, baseURL!);
    await page.goto("/login");
    await expect(page.getByLabel("Địa chỉ Email")).toBeVisible();
    await expect(page.getByLabel("Mật khẩu", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).toBeEnabled();
    health.assertClean();
  });

  test("unknown route shows the not-found page", async ({ page }) => {
    await page.goto("/fastcheck-missing-page");
    await expect(page.getByText("Không tìm thấy trang")).toBeVisible();
  });

  test("an account signs in and reaches its home", async ({ page, baseURL }) => {
    const email = process.env.FASTCHECK_EMAIL;
    const password = process.env.FASTCHECK_PASSWORD;
    test.skip(!email || !password, "set FASTCHECK_EMAIL and FASTCHECK_PASSWORD to check sign-in");
    const health = watchHealth(page, baseURL!);
    await signIn(page, email!, password!);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("#app-main h1").first()).toBeVisible();
    health.assertClean();
  });
});
