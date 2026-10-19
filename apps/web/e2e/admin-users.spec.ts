import type { Browser, Page } from "@playwright/test";

import { seedEmail } from "./env";
import { devOverlayIssues, expect, horizontalOverflow, signInViaForm, test } from "./fixtures";

// Ban / role controls currently render without diacritics ("Khoa TK", "Mo khoa", "Huy"); the regexes accept both
// spellings so these flow tests check behaviour. Copy is asserted separately where the catalog asks for it.
const BAN = /^Kh[oó]a TK$/;
const CONFIRM_BAN = /^X[aá]c nh[aậ]n kh[oó]a$/;
const UNBAN = /M[oở] kh[oó]a/;
const CANCEL = /^H[uủ]y$/;

async function openUsers(page: Page) {
  await page.goto("/dashboard/admin/users");
  await expect(page.getByRole("heading", { name: "Quản lý người dùng" })).toBeVisible();
}

const userRow = (page: Page, email: string) => page.locator("tbody tr").filter({ hasText: email });

async function ban(page: Page, email: string, reason: string) {
  const row = userRow(page, email);
  await row.getByRole("button", { name: BAN }).click();
  if (reason) await row.getByRole("textbox").fill(reason);
  await row.getByRole("button", { name: CONFIRM_BAN }).click();
  await expect(userRow(page, email).getByRole("button", { name: UNBAN })).toBeVisible();
}

async function setRole(page: Page, email: string, roleId: "LEARNER" | "LECTURER") {
  const row = userRow(page, email);
  await row.getByRole("combobox").selectOption(roleId);
  await row.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByText("Đã cập nhật vai trò người dùng.")).toBeVisible();
}

/** Restores a throwaway to active LEARNER. Only ever called with throwaway addresses. */
async function revertThrowaway(page: Page, email: string) {
  await openUsers(page);
  const row = userRow(page, email);
  if (await row.getByRole("button", { name: UNBAN }).count()) {
    await row.getByRole("button", { name: UNBAN }).click();
    await expect(userRow(page, email).getByRole("button", { name: BAN })).toBeVisible();
  }
  if ((await row.getByRole("combobox").inputValue()) !== "LEARNER") await setRole(page, email, "LEARNER");
}

/** Attempts a fresh sign-in in an isolated context and returns where it ended and the visible text. */
async function attemptSignIn(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signInViaForm(page, email);
    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible();
    return { path: new URL(page.url()).pathname, toast: (await toast.innerText()).trim() };
  } finally {
    await context.close();
  }
}

test.describe("admin console and users", () => {
  test("UI-ADM-01 admin signs in to the admin home and opens user management", async ({ page }) => {
    await signInViaForm(page, seedEmail("admin"));
    await page.waitForURL("**/dashboard/admin");
    await expect(page.getByText("Quản trị viên", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Quản lý tài khoản người dùng" }).click();
    await expect(page).toHaveURL(/\/dashboard\/admin\/users$/);
    await expect(page.getByRole("heading", { name: "Quản lý người dùng" })).toBeVisible();
  });

  test("UI-ADM-03 disabled admin menu items are labelled 'Sắp ra mắt' and are not links", async ({ rolePage }) => {
    const page = await rolePage("admin");
    await page.goto("/dashboard/admin");
    for (const label of ["Duyệt yêu cầu xuất bản khoá học", "Đơn hàng & giao dịch", "Voucher"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: label })).toHaveCount(0);
    }
    await expect(page.getByText("Sắp ra mắt")).toHaveCount(3);
  });

  test("UI-ADM-10 users table lists accounts with the expected columns and marks the admin's own row", async ({
    rolePage,
  }) => {
    const page = await rolePage("admin");
    await openUsers(page);
    await expect(page.locator("thead th")).toHaveText(["Họ và tên", "Email", "Ngày tham gia", "Vai trò", "Trạng thái"]);
    expect(await page.locator("tbody tr").count()).toBeGreaterThan(0);
    await expect(userRow(page, seedEmail("admin")).getByText("Tài khoản của bạn")).toBeVisible();
  });

  test("UI-ADM-12 deactivation panel states impact counts and gates confirm behind an acknowledgement", async ({
    rolePage,
    throwaway,
  }) => {
    const target = await throwaway("dlg");
    const page = await rolePage("admin");
    await openUsers(page);
    const row = userRow(page, target.email);
    await row.getByRole("button", { name: BAN }).click();
    try {
      await expect(row.getByText(/đăng xuất khỏi mọi thiết bị/i)).toBeVisible();
      await expect(row.getByText(/khoá học sở hữu|đơn chờ thanh toán/i).first()).toBeVisible();
      const ack = row.getByRole("checkbox", { name: /Tôi hiểu tác động/ });
      await expect(ack).toBeVisible();
      await expect(row.getByRole("button", { name: CONFIRM_BAN })).toBeDisabled();
    } finally {
      await row.getByRole("button", { name: CANCEL }).click();
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-ADM-13 deactivation with an empty reason is refused", async ({ rolePage, throwaway }) => {
    const target = await throwaway("noreason");
    const page = await rolePage("admin");
    await openUsers(page);
    const row = userRow(page, target.email);
    try {
      await row.getByRole("button", { name: BAN }).click();
      const confirm = row.getByRole("button", { name: CONFIRM_BAN });
      // Either the confirm is blocked up front or the submit is rejected; in both cases the account stays active.
      if (await confirm.isEnabled()) await confirm.click();
      await page.waitForLoadState("networkidle");
      await openUsers(page);
      await expect(userRow(page, target.email).getByRole("button", { name: UNBAN })).toHaveCount(0);
      await expect(userRow(page, target.email).getByRole("button", { name: BAN })).toBeVisible();
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-ADM-14 deactivating an account revokes its session and refuses new sign-in", async ({
    browser,
    rolePage,
    throwaway,
  }) => {
    const target = await throwaway("ban");
    const page = await rolePage("admin");
    try {
      await openUsers(page);
      await ban(page, target.email, "UI test: thu hồi phiên");
      await target.page.goto("/dashboard");
      await expect.poll(() => new URL(target.page.url()).pathname).toBe("/login");
      const attempt = await attemptSignIn(browser, target.email);
      expect(attempt.path).toBe("/login");
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-COM-13 signing in with a deactivated account shows 'Tài khoản đã bị vô hiệu hoá'", async ({
    browser,
    rolePage,
    throwaway,
  }) => {
    const target = await throwaway("banmsg");
    const page = await rolePage("admin");
    try {
      await openUsers(page);
      await ban(page, target.email, "UI test: thông báo đăng nhập");
      const attempt = await attemptSignIn(browser, target.email);
      expect(attempt.toast).toMatch(/Tài khoản đã bị vô hiệu ho[áa]/);
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-ADM-15 reactivating a deactivated account restores sign-in", async ({ browser, rolePage, throwaway }) => {
    const target = await throwaway("react");
    const page = await rolePage("admin");
    try {
      await openUsers(page);
      await ban(page, target.email, "UI test: mở khoá lại");
      await userRow(page, target.email).getByRole("button", { name: UNBAN }).click();
      await expect(userRow(page, target.email).getByRole("button", { name: BAN })).toBeVisible();
      const context = await browser.newContext();
      const fresh = await context.newPage();
      await signInViaForm(fresh, target.email);
      await fresh.waitForURL("**/dashboard");
      await context.close();
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-ADM-16 cancelling the deactivation panel leaves the account active", async ({ rolePage, throwaway }) => {
    const target = await throwaway("cancel");
    const page = await rolePage("admin");
    try {
      await openUsers(page);
      const row = userRow(page, target.email);
      await row.getByRole("button", { name: BAN }).click();
      await row.getByRole("button", { name: CANCEL }).click();
      await openUsers(page);
      await expect(userRow(page, target.email).getByRole("button", { name: BAN })).toBeVisible();
      await expect(userRow(page, target.email).getByRole("button", { name: UNBAN })).toHaveCount(0);
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-ADM-17 changing a role asks for confirmation before saving", async ({ rolePage, throwaway }) => {
    const target = await throwaway("role");
    const page = await rolePage("admin");
    try {
      await openUsers(page);
      const row = userRow(page, target.email);
      await row.getByRole("combobox").selectOption("LECTURER");
      await row.getByRole("button", { name: "Lưu", exact: true }).click();
      await expect(page.getByRole("alertdialog").or(page.getByRole("dialog"))).toBeVisible({ timeout: 5_000 });
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-ADM-18 a role change takes effect on the account's next page load", async ({ rolePage, throwaway }) => {
    const target = await throwaway("roleeff");
    const page = await rolePage("admin");
    try {
      await openUsers(page);
      await setRole(page, target.email, "LECTURER");
      await target.page.goto("/dashboard");
      await expect.poll(() => new URL(target.page.url()).pathname).toBe("/dashboard/lecturer");
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-ADM-19 an unsaved role selection does not persist and 'Lưu' is disabled when unchanged", async ({
    rolePage,
    throwaway,
  }) => {
    const target = await throwaway("undo");
    const page = await rolePage("admin");
    await openUsers(page);
    const row = userRow(page, target.email);
    const save = row.getByRole("button", { name: "Lưu", exact: true });
    await expect(save).toBeDisabled();
    await row.getByRole("combobox").selectOption("LECTURER");
    await expect(save).toBeEnabled();
    await openUsers(page);
    await expect(userRow(page, target.email).getByRole("combobox")).toHaveValue("LEARNER");
  });

  test("UI-ADM-20 the admin's own row offers no deactivate control", async ({ rolePage }) => {
    const page = await rolePage("admin");
    await openUsers(page);
    const own = userRow(page, seedEmail("admin"));
    await expect(own).toHaveCount(1);
    await expect(own.getByText(/T[aà]i kho[aả]n c[uủ]a b[aạ]n/)).toBeVisible();
    await expect(own.getByRole("button", { name: BAN })).toHaveCount(0);
  });

  test("UI-ADM-21 users page fits 390px without page-level horizontal scroll", { tag: "@mobile" }, async ({
    rolePage,
  }) => {
    const page = await rolePage("admin");
    await page.setViewportSize({ width: 390, height: 844 });
    await openUsers(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test("UI-ADM-22 users page loads with no console errors and a clean dev overlay", async ({ rolePage, health }) => {
    const page = await rolePage("admin");
    await openUsers(page);
    await expect(page.locator("tbody tr").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(health.all(), "console/page errors including known noise").toEqual([]);
    expect(await devOverlayIssues(page)).toBeNull();
  });
});
