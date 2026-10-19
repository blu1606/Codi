import type { Page } from "@playwright/test";

import { seedEmail } from "./env";
import { expect, horizontalOverflow, signInViaForm, test } from "./fixtures";

const pathOf = (page: Page) => new URL(page.url()).pathname;

async function expectRedirect(page: Page, from: string, to: string) {
  await page.goto(from);
  await expect.poll(() => pathOf(page), { message: `${from} should redirect to ${to}` }).toBe(to);
}

const mainNavLabels = async (page: Page) =>
  (await page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link").allInnerTexts()).map((s) =>
    s.trim(),
  );

test.describe("role guards", () => {
  test("UI-GRD-01 anonymous visitor to any dashboard route is sent to /login", async ({ page }) => {
    for (const route of ["/dashboard", "/dashboard/lecturer", "/dashboard/admin", "/dashboard/admin/users"]) {
      await expectRedirect(page, route, "/login");
    }
    await expect(page.getByLabel("Địa chỉ Email")).toBeVisible();
  });

  test("UI-GRD-02 (UI-LRN-26, UI-LRN-27) learner opening staff routes lands on the learner home", async ({
    rolePage,
  }) => {
    const page = await rolePage("learner");
    for (const route of ["/dashboard/lecturer", "/dashboard/admin", "/dashboard/admin/users"]) {
      await expectRedirect(page, route, "/dashboard");
      await expect(page.getByText("Học viên", { exact: true })).toBeVisible();
    }
  });

  test("UI-GRD-03 lecturer opening /dashboard or admin routes lands on the lecturer home", async ({ rolePage }) => {
    const page = await rolePage("lecturer");
    for (const route of ["/dashboard", "/dashboard/admin", "/dashboard/admin/users"]) {
      await expectRedirect(page, route, "/dashboard/lecturer");
    }
    await expect(page.getByText("Giảng viên", { exact: true })).toBeVisible();
  });

  test("UI-GRD-04 admin opening /dashboard or lecturer routes lands on the admin home", async ({ rolePage }) => {
    const page = await rolePage("admin");
    for (const route of ["/dashboard", "/dashboard/lecturer"]) {
      await expectRedirect(page, route, "/dashboard/admin");
    }
    await expect(page.getByText("Quản trị viên", { exact: true })).toBeVisible();
  });

  test("UI-GRD-05 (UI-COM-56) staff get no cart link and /cart does not show a cart", async ({ rolePage }) => {
    for (const role of ["lecturer", "admin"] as const) {
      const page = await rolePage(role);
      await page.goto(`/dashboard/${role}`);
      await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toBeVisible();
      await expect(page.getByRole("link", { name: /^Giỏ hàng/ })).toHaveCount(0);

      await page.goto("/cart");
      await expect(page.getByText("Chỉ học viên mới có thể xem giỏ hàng")).toBeVisible();
      await expect(page.getByRole("heading", { name: "Tóm tắt đơn hàng" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Thanh toán" })).toHaveCount(0);
    }
  });

  test("UI-GRD-06 header shows only the staff links for lecturer and admin", async ({ rolePage }) => {
    const expected = { lecturer: ["Giảng dạy", "Khoá học"], admin: ["Quản trị", "Khoá học"] } as const;
    for (const role of ["lecturer", "admin"] as const) {
      const page = await rolePage(role);
      await page.goto(`/dashboard/${role}`);
      await expect.poll(() => mainNavLabels(page)).toEqual([...expected[role]]);
    }
  });

  test("UI-GRD-07 no visible internal link on staff home pages leads to a 4xx/5xx page", async ({ rolePage }) => {
    const pages = { lecturer: ["/dashboard/lecturer"], admin: ["/dashboard/admin", "/dashboard/admin/users"] } as const;
    const broken: string[] = [];
    for (const role of ["lecturer", "admin"] as const) {
      const page = await rolePage(role);
      for (const home of pages[role]) {
        await page.goto(home);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        const hrefs = await page.$$eval("a[href^='/']", (links) => [
          ...new Set(links.map((a) => a.getAttribute("href")?.split(/[?#]/)[0] ?? "")),
        ]);
        for (const href of hrefs.filter((h) => h && !h.startsWith("/api/"))) {
          const res = await page.request.get(href, { timeout: 120_000 });
          if (res.status() >= 400) broken.push(`${role} ${home}: ${href} -> ${res.status()}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  test("UI-GRD-08 signing out of the lecturer workspace ends the session", async ({ page }) => {
    // Fresh sign-in: signing out revokes the session, so the shared storage state must not be used here.
    await signInViaForm(page, seedEmail("lecturer"));
    await page.waitForURL("**/dashboard/lecturer");
    await page.getByRole("button", { name: "Đăng xuất" }).click();
    await page.waitForURL("**/login");
    await expectRedirect(page, "/dashboard/lecturer", "/login");
  });

  test("UI-GRD-09 (UI-LEC-15) staff shell fits 390px and the drawer lists the role link", { tag: "@mobile" }, async ({
    rolePage,
  }) => {
    const roleLink = { lecturer: "Giảng dạy", admin: "Quản trị" } as const;
    for (const role of ["lecturer", "admin"] as const) {
      const page = await rolePage(role);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/dashboard/${role}`);
      await expect(page.getByRole("heading", { name: "Bàn làm việc", exact: true })).toBeVisible();
      expect(await horizontalOverflow(page), `${role} home overflows horizontally`).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "Mở menu" }).click();
      const drawer = page.getByRole("navigation", { name: "Điều hướng di động" });
      await expect(drawer.getByRole("link", { name: roleLink[role] })).toBeVisible();
      await expect(drawer.getByRole("link", { name: "Khoá học" })).toBeVisible();
    }
  });
});
