import type { Page } from "@playwright/test";

import { seedEmail, seedPassword, throwawayEmail } from "./env";
import { expect, signInViaForm, test } from "./fixtures";

// Sign-up cases stop at the OTP screen: they create one unverified `<base>+uitest…` account each and never read
// the OTP, so they need no DB access. Each sign-up sends one verification email to the seed mailbox alias.

const digit = (page: Page, n: number) => page.getByLabel(`Chữ số ${n} của mã xác thực`);
const card = (page: Page) => page.locator('[data-slot="card"]').first();

async function reachOtpScreen(page: Page, tag: string): Promise<string> {
  const email = throwawayEmail(tag);
  await page.goto("/login?tab=signup");
  await page.getByLabel("Họ và tên").fill(`UI Test ${tag}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(seedPassword());
  await page.getByRole("button", { name: "Đăng ký tài khoản" }).click();
  await expect(page.getByText("Xác thực tài khoản")).toBeVisible();
  return email;
}

test.describe("sign-up, OTP, password recovery, settings", () => {
  test("UI-COM-20 invalid email and a 3-character password show inline errors", async ({ page }) => {
    await page.goto("/login?tab=signup");
    await page.getByLabel("Họ và tên").fill("UI Test");
    // Passes the browser's native type=email check (which would block submit with a tooltip) but not the app's
    // own rule, so the app's inline validation is what gets exercised.
    await page.getByLabel("Email", { exact: true }).fill("uitest@khong-co-tld");
    await page.getByLabel("Mật khẩu", { exact: true }).fill("123");
    await page.getByRole("button", { name: "Đăng ký tài khoản" }).click();
    await expect(page.getByText("Địa chỉ email không hợp lệ")).toBeVisible();
    await expect(page.getByText("Mật khẩu phải có ít nhất 8 ký tự")).toBeVisible();
    await expect(page.getByText("Xác thực tài khoản")).toHaveCount(0);
  });

  test("UI-COM-21 sign-up shows the OTP screen with 6 boxes, the email, an edit control and resend", async ({
    page,
  }) => {
    const email = await reachOtpScreen(page, "otp");
    for (let n = 1; n <= 6; n++) await expect(digit(page, n)).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Sửa|Đăng ký lại)$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Gửi lại mã/ })).toBeVisible();
  });

  test("UI-COM-22 a wrong OTP shows a Vietnamese inline error and keeps the digits", async ({ page }) => {
    await reachOtpScreen(page, "badotp");
    await digit(page, 1).click();
    await page.keyboard.type("000000");
    await page.getByRole("button", { name: "Xác thực và hoàn tất" }).click();
    await expect(card(page).getByText(/mã .*(không đúng|không chính xác|không hợp lệ|hết hạn)/i)).toBeVisible();
    await expect(digit(page, 1)).toHaveValue("0");
    await expect(digit(page, 6)).toHaveValue("0");
  });

  test("UI-COM-23 the verify button stays disabled until all 6 digits are entered", async ({ page }) => {
    await reachOtpScreen(page, "partial");
    await digit(page, 1).click();
    await page.keyboard.type("12");
    await expect(page.getByRole("button", { name: "Xác thực và hoàn tất" })).toBeDisabled();
  });

  test("UI-COM-24 'Sửa' on the OTP screen returns to edit the email", async ({ page }) => {
    const email = await reachOtpScreen(page, "edit");
    await page.getByRole("button", { name: "Sửa", exact: true }).click();
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
    await expect(page.getByText("Xác thực tài khoản")).toHaveCount(0);
  });

  test("UI-COM-25 'Gửi lại mã' is disabled while the countdown runs", async ({ page }) => {
    await reachOtpScreen(page, "resend");
    await expect(page.getByRole("button", { name: /Gửi lại mã/ })).toBeDisabled();
  });

  test("UI-COM-26 forgot password shows a neutral confirmation with the address and a spam-folder hint", async ({
    page,
  }) => {
    // Unknown address only: no mail is sent and the seeded mailbox is not spammed.
    const unknown = `uitest-unknown-${Date.now()}@example.com`;
    await page.goto("/forgot-password");
    await page.getByLabel("Email tài khoản").fill(unknown);
    await page.getByRole("button", { name: "Nhận mã OTP qua Email" }).click();
    await expect(page.getByText(unknown)).toBeVisible();
    await expect(page.getByText(/thư rác/i)).toBeVisible();
  });

  test("UI-COM-27 /reset-password without a token shows the invalid-link state", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("Liên kết không hợp lệ")).toBeVisible();
    await expect(page.getByLabel(/Mật khẩu mới/)).toHaveCount(0);
  });

  test("UI-COM-29 settings edit shows Save only once the value changes; 'Hủy' leaves it unchanged", async ({
    rolePage,
  }) => {
    const page = await rolePage("learner");
    await page.goto("/settings");
    await page.getByRole("button", { name: "Chỉnh sửa tên hiển thị" }).click();
    const dialog = page.getByRole("dialog", { name: "Chỉnh sửa tên hiển thị" });
    const nameField = dialog.getByLabel("Tên hiển thị");
    const original = await nameField.inputValue();
    try {
      await expect(dialog.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
      await nameField.fill(`${original} x`);
      await expect(dialog.getByRole("button", { name: "Lưu thay đổi" })).toBeEnabled();
    } finally {
      await dialog.getByRole("button", { name: "Hủy" }).click();
    }
    await expect(dialog).toBeHidden();
    await expect(page.getByText(original, { exact: true }).first()).toBeVisible();
  });

  test("UI-COM-32 'Đăng xuất' in the account menu returns the header to the guest state", async ({ page }) => {
    // Fresh session: signing out revokes it, so the shared storage state must not be used.
    await signInViaForm(page, seedEmail("learner"));
    await page.waitForURL("**/dashboard");
    await page.goto("/courses");
    await page.getByRole("button", { name: /^Mở menu tài khoản của / }).click();
    await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
    await expect(page.getByRole("banner").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Mở menu tài khoản của / })).toHaveCount(0);
  });
});
