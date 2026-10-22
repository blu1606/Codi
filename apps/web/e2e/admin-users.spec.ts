import type { Browser, Page } from "@playwright/test";

import { seedEmail } from "./env";
import { devOverlayIssues, expect, horizontalOverflow, signInViaForm, test, type Health } from "./fixtures";

// Ban / role controls currently render without diacritics ("Khoa TK", "Mo khoa", "Huy"); the regexes accept both
// spellings so these flow tests check behaviour. Copy is asserted separately where the catalog asks for it.
const BAN = /^(Kh[oó]a TK|Vô hiệu ho[áa])$/;
const CONFIRM_BAN = /^(X[aá]c nh[aậ]n kh[oó]a|Vô hiệu ho[áa])$/;
const UNBAN = /^(M[oở] kh[oó]a|Kích hoạt lại)$/;
const CANCEL = /^H[uủ]y$/;
const confirmation = (page: Page) => page.getByRole("alertdialog").or(page.getByRole("dialog"));

async function openDeactivation(page: Page, email: string) {
  await userRow(page, email).getByRole("button", { name: BAN }).click();
  const dialog = confirmation(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openUsers(page: Page) {
  await page.goto("/dashboard/admin/users");
  await expect(page.getByRole("heading", { name: "Quản lý người dùng" })).toBeVisible();
}

const userRow = (page: Page, email: string) => page.locator("tbody tr").filter({ hasText: email });

async function ban(page: Page, email: string, reason: string) {
  const dialog = await openDeactivation(page, email);
  await dialog.getByRole("textbox").fill(reason);
  await dialog.getByRole("checkbox", { name: "Tôi hiểu tác động" }).check();
  await dialog.getByRole("button", { name: CONFIRM_BAN }).click();
  await expect(userRow(page, email).getByRole("button", { name: UNBAN })).toBeVisible();
}

async function setRole(page: Page, email: string, roleId: "LEARNER" | "LECTURER") {
  const row = userRow(page, email);
  await row.getByRole("combobox").selectOption(roleId);
  await row.getByRole("button", { name: "Lưu", exact: true }).click();
  const dialog = confirmation(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/có hiệu lực ở lần tải trang tiếp theo/i);
  await dialog.getByRole("button", { name: "Đổi vai trò", exact: true }).click();
  await expect(page.getByText("Đã cập nhật vai trò người dùng.")).toBeVisible();
  await openUsers(page);
  await expect(userRow(page, email).getByRole("combobox")).toHaveValue(roleId);
}

async function reactivate(page: Page, email: string) {
  await userRow(page, email).getByRole("button", { name: UNBAN }).click();
  const dialog = confirmation(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/đăng nhập lại/i);
  await dialog.getByRole("button", { name: UNBAN }).click();
  await expect(userRow(page, email).getByRole("button", { name: BAN })).toBeVisible();
}

/** Cleanup alone supports today's direct submit and the contracted confirmation UI.
 * Soft failures preserve the original assertion and let every restoration attempt run. */
async function revertThrowaway(page: Page, email: string) {
  try {
    await openUsers(page);
    const row = userRow(page, email);
    if (await row.getByRole("button", { name: UNBAN }).count()) {
      await row.getByRole("button", { name: UNBAN }).click();
      await expect.poll(async () =>
        await confirmation(page).isVisible() || await row.getByRole("button", { name: BAN }).isVisible(),
      ).toBe(true);
      if (await confirmation(page).isVisible()) {
        await confirmation(page).getByRole("button", { name: UNBAN }).click();
      }
      await expect(row.getByRole("button", { name: BAN })).toBeVisible();
    }
  } catch (error) {
    expect.soft(error, "restore throwaway active status").toBeUndefined();
  }
  try {
    await openUsers(page);
    const row = userRow(page, email);
    if ((await row.getByRole("combobox").inputValue()) !== "LEARNER") {
      await row.getByRole("combobox").selectOption("LEARNER");
      await row.getByRole("button", { name: "Lưu", exact: true }).click();
      await expect.poll(async () =>
        await confirmation(page).isVisible() || await page.getByText("Đã cập nhật vai trò người dùng.").isVisible(),
      ).toBe(true);
      if (await confirmation(page).isVisible()) {
        await confirmation(page).getByRole("button", { name: "Đổi vai trò", exact: true }).click();
      }
      await expect(page.getByText("Đã cập nhật vai trò người dùng.")).toBeVisible();
      await openUsers(page);
      await expect(userRow(page, email).getByRole("combobox")).toHaveValue("LEARNER");
    }
  } catch (error) {
    expect.soft(error, "restore throwaway learner role").toBeUndefined();
  }
}

/** Attempts a fresh sign-in in an isolated context and returns where it ended and the visible text. */
async function attemptSignIn(browser: Browser, health: Health, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  health.watch(page);
  try {
    await health.expectHttp(page, { status: 401, method: "POST", pathname: "/api/auth/sign-in/email" }, () => signInViaForm(page, email));
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

  test("UI-ADM-03 admin menu entries are noninteractive when unavailable or reach their named page", async ({ rolePage }) => {
    const page = await rolePage("admin");
    await page.goto("/dashboard/admin");
    for (const [label, destination, heading] of [
      ["Duyệt yêu cầu xuất bản khoá học", "/dashboard/admin/publication", /Duyệt.*xuất bản/i],
      ["Đơn hàng & giao dịch", "/dashboard/admin/orders", /Đơn hàng.*giao dịch/i],
      ["Voucher", "/dashboard/admin/vouchers", /Voucher/i],
    ] as const) {
      await page.goto("/dashboard/admin");
      const item = page.getByRole("listitem").filter({ has: page.getByText(label, { exact: true }) });
      await expect(item).toBeVisible();
      const link = item.getByRole("link");
      if (await link.count()) {
        await expect(link).toHaveAttribute("href", destination);
        await link.click();
        await expect.poll(() => new URL(page.url()).pathname).toBe(destination);
        await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      } else {
        await expect(item.getByText("Sắp ra mắt", { exact: true })).toBeVisible();
        await expect(item.locator("a, button:not(:disabled), input:not(:disabled), select:not(:disabled), [role=button]:not([aria-disabled=true]), [tabindex]:not([tabindex='-1'])")).toHaveCount(0);
        test.info().annotations.push({ type: "coverage-limitation", description: `${label}: unavailable; destination flow not exercised` });
      }
    }
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
    try {
      const dialog = await openDeactivation(page, target.email);
      await expect.soft(dialog).toContainText(/đăng xuất khỏi mọi thiết bị/i);
      await expect.soft(dialog).toContainText(/không thể đăng nhập/i);
      await expect.soft(dialog).toContainText(/dữ liệu.*đơn hàng.*giữ nguyên/i);
      await expect.soft(dialog).toContainText(/có thể kích hoạt lại/i);
      // This account was just registered: no purchases, pending orders, or taught courses.
      await expect.soft(dialog.getByText(/^0\s+kh(?:óa|oá|oa) học đang sở hữu$/i)).toBeVisible();
      await expect.soft(dialog.getByText(/^0\s+đơn hàng chờ thanh toán$/i)).toBeVisible();
      await expect.soft(dialog.getByText(/^Đang giảng dạy\s+0\s+kh(?:óa|oá|oa) học$/i)).toBeVisible();
      await dialog.getByRole("textbox").fill("UI test: kiểm tra ô xác nhận");
      const ack = dialog.getByRole("checkbox", { name: /Tôi hiểu tác động/ });
      await expect(ack).toBeVisible();
      await expect(ack).not.toBeChecked();
      const confirm = dialog.getByRole("button", { name: CONFIRM_BAN });
      await expect(confirm).toBeDisabled();
      await ack.check();
      await expect(confirm).toBeEnabled();
      await ack.uncheck();
      await expect(confirm).toBeDisabled();
      await dialog.getByRole("button", { name: CANCEL }).click();
      await expect(dialog).not.toBeVisible();
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-ADM-13 deactivation with an acknowledged but empty or whitespace reason is refused", async ({ rolePage, throwaway }) => {
    const target = await throwaway("noreason");
    const page = await rolePage("admin");
    await openUsers(page);
    try {
      for (const value of ["", "   "]) {
        const dialog = await openDeactivation(page, target.email);
        await dialog.getByRole("checkbox", { name: "Tôi hiểu tác động" }).check();
        await dialog.getByRole("textbox").fill(value);
        const confirm = dialog.getByRole("button", { name: CONFIRM_BAN });
        if (await confirm.isEnabled()) {
          await confirm.click();
          await page.waitForLoadState("networkidle");
        } else {
          await expect(confirm).toBeDisabled();
          test.info().annotations.push({
            type: "coverage-limitation",
            description: `Reason ${value.length === 0 ? "empty" : "whitespace"}: UI blocks submission; server validation not exercised`,
          });
          await dialog.getByRole("button", { name: CANCEL }).click();
        }
        await openUsers(page);
        await expect(userRow(page, target.email).getByRole("button", { name: UNBAN })).toHaveCount(0);
        await expect(userRow(page, target.email).getByRole("button", { name: BAN })).toBeVisible();
      }
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-ADM-14 deactivating an account revokes its session and refuses new sign-in", async ({
    browser,
    health,
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
      const attempt = await attemptSignIn(browser, health, target.email);
      expect(attempt.path).toBe("/login");
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-COM-13 signing in with a deactivated account shows 'Tài khoản đã bị vô hiệu hoá'", async ({
    browser,
    health,
    rolePage,
    throwaway,
  }) => {
    const target = await throwaway("banmsg");
    const page = await rolePage("admin");
    try {
      await openUsers(page);
      await ban(page, target.email, "UI test: thông báo đăng nhập");
      const attempt = await attemptSignIn(browser, health, target.email);
      expect(attempt.toast).toMatch(/Tài khoản đã bị vô hiệu ho[áa]/);
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-ADM-15 reactivating a deactivated account restores sign-in", async ({ browser, rolePage, throwaway, health }) => {
    const target = await throwaway("react");
    const page = await rolePage("admin");
    try {
      await openUsers(page);
      await ban(page, target.email, "UI test: mở khoá lại");
      await reactivate(page, target.email);
      const context = await browser.newContext();
      const fresh = await context.newPage();
      health.watch(fresh);
      try {
        await signInViaForm(fresh, target.email);
        await fresh.waitForURL("**/dashboard");
      } finally {
        await context.close();
      }
    } finally {
      await revertThrowaway(page, target.email);
    }
  });

  test("UI-ADM-16 cancelling the deactivation panel leaves the account active", async ({ rolePage, throwaway }) => {
    const target = await throwaway("cancel");
    const page = await rolePage("admin");
    try {
      await openUsers(page);
      const dialog = await openDeactivation(page, target.email);
      await dialog.getByRole("textbox").fill("UI test: huỷ thao tác hợp lệ");
      await dialog.getByRole("checkbox", { name: "Tôi hiểu tác động" }).check();
      await expect(dialog.getByRole("button", { name: CONFIRM_BAN })).toBeEnabled();
      await dialog.getByRole("button", { name: CANCEL }).click();
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
      const dialog = confirmation(page);
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await expect(dialog).toContainText(/có hiệu lực ở lần tải trang tiếp theo/i);
      await dialog.getByRole("button", { name: CANCEL }).click();
      await expect(dialog).not.toBeVisible();
      await expect(row.getByRole("combobox")).toHaveValue("LEARNER");
      await expect(row.getByRole("button", { name: "Lưu", exact: true })).toBeDisabled();
      await openUsers(page);
      await expect(userRow(page, target.email).getByRole("combobox")).toHaveValue("LEARNER");
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
