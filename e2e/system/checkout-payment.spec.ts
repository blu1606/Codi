import { expect, test, type Browser, type Page } from "@playwright/test";

import { COURSE, addToCart, choosePaymentOutcome, evidence, learner, signIn, vnd } from "./support";

// Feature 2: Checkout and VietQR payment. The bank is simulated by the local demo tools: 6 s after the checkout page
// opens, the chosen outcome is posted to the real SePay webhook handler. Business rules:
//  BR-07 Checkout creates an order with a unique transfer content CODI##### and a 30-minute payment deadline.
//  BR-08 A learner has at most one pending order; it must be paid or cancelled before a new checkout.
//  BR-09 The course unlocks only when the full amount is received (paid or overpaid).
//  BR-10 A partial transfer keeps the order pending and shows the amount still due.
//  BR-11 An expired code cannot be paid; the learner can create a new code for the same order.
//  BR-12 A free course is enrolled directly without payment.
const opened: Page[] = [];
async function learnerPage(browser: Browser, n: number) {
  const page = await browser.newPage();
  opened.push(page);
  await signIn(page, learner(n));
  return page;
}
async function checkoutGit(page: Page, outcome: string) {
  await addToCart(page, COURSE.git.slug);
  await page.goto("/cart");
  await choosePaymentOutcome(page, outcome);
  await page.getByRole("button", { name: "Thanh toán" }).click();
  await page.waitForURL(/\/checkout\?order=CODI\d{5}$/);
  return new URL(page.url()).searchParams.get("order")!;
}

test.describe.serial("Checkout and payment", () => {
  let waiting: Page;
  let code: string;
  test.afterAll(async () => Promise.all(opened.map((p) => p.close())));

  test("TC_PAY_001 Checkout shows the VietQR code, the CODI transfer content and a 30-minute deadline", async ({ browser }, testInfo) => {
    waiting = await learnerPage(browser, 6);
    code = await checkoutGit(waiting, "Chậm (chờ lâu)");
    await expect(waiting.getByRole("img", { name: new RegExp(`Mã VietQR chuyển ${vnd(199000)}.*nội dung ${code}`) })).toBeVisible();
    await expect(waiting.getByText(`Nội dung phải là ${code}.`, { exact: false })).toBeVisible();
    await expect(waiting.locator("[data-countdown]")).toHaveText(/^(30:00|29:\d\d)$/);
    await expect(waiting.getByText("Tổng thanh toán").locator("..")).toContainText(vnd(199000));
    await evidence(waiting, testInfo);
  });

  test("TC_PAY_002 A pending order is shown in the cart and blocks a second checkout", async ({}, testInfo) => {
    await waiting.goto("/cart");
    await expect(waiting.getByText(`Bạn có đơn hàng ${code} đang chờ thanh toán`)).toBeVisible();
    await expect(waiting.getByRole("button", { name: "Thanh toán" })).toHaveCount(0);
    await waiting.goto(`/courses/${COURSE.git.slug}`);
    await expect(waiting.getByRole("button", { name: "Thêm vào giỏ" })).toHaveCount(0);
    await evidence(waiting, testInfo);
  });

  test("TC_PAY_003 Learner cancels the pending order", async ({}, testInfo) => {
    await waiting.goto("/cart");
    await waiting.getByRole("button", { name: "Huỷ đơn này" }).click();
    const confirm = waiting.getByRole("dialog");
    if (await confirm.count()) await confirm.getByRole("button").filter({ hasText: /Huỷ|Hủy/ }).last().click();
    await expect(waiting.getByText(`Bạn có đơn hàng ${code} đang chờ thanh toán`)).toHaveCount(0);
    await evidence(waiting, testInfo);
  });

  test("TC_PAY_004 Full transfer marks the order paid and unlocks the course", async ({ browser }, testInfo) => {
    const page = await learnerPage(browser, 2);
    const order = await checkoutGit(page, "Thành công");
    await page.waitForURL(/\/checkout\/success\?order=/, { timeout: 30_000 });
    await expect(page.getByText("Thanh toán thành công!")).toBeVisible();
    await expect(page.getByText(`Đơn ${order} · ${vnd(199000)}`, { exact: false })).toBeVisible();
    await expect(page.getByText("Bạn đã sở hữu khóa học")).toBeVisible();
    await evidence(page, testInfo);
    await page.goto(`/courses/${COURSE.git.slug}`);
    await expect(page.getByRole("link", { name: "Tiếp tục học" })).toBeVisible();
  });

  test("TC_PAY_005 Partial transfer keeps the order pending and shows the amount still due", async ({ browser }, testInfo) => {
    const page = await learnerPage(browser, 4);
    const order = await checkoutGit(page, "Chuyển thiếu tiền");
    await expect(page.getByText(`Đã nhận ${vnd(99500)} / cần ${vnd(199000)}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`Hãy chuyển thêm ${vnd(99500)} với cùng nội dung ${order}`, { exact: false })).toBeVisible();
    await expect(page).toHaveURL(/\/checkout\?order=/);
    await evidence(page, testInfo);
  });

  test("TC_PAY_006 Expired code cannot be paid and a new code can be created", async ({ browser }, testInfo) => {
    const page = await learnerPage(browser, 5);
    const order = await checkoutGit(page, "Mã hết hạn");
    await expect(page.getByText("Mã thanh toán đã hết hạn")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("img", { name: /Mã VietQR/ })).toHaveCount(0);
    await evidence(page, testInfo);
    await choosePaymentOutcome(page, "Chậm (chờ lâu)");
    await page.getByRole("button", { name: "Tạo mã mới" }).click();
    await expect(page.locator("[data-countdown]")).toHaveText(/^(30:00|29:\d\d)$/);
    expect(new URL(page.url()).searchParams.get("order")).not.toBe(order);
  });

  test("TC_PAY_007 Overpaid transfer is accepted and the course unlocks", async ({ browser }, testInfo) => {
    const page = await learnerPage(browser, 3);
    await checkoutGit(page, "Chuyển thừa");
    await page.waitForURL(/\/checkout\/success\?order=/, { timeout: 30_000 });
    await expect(page.getByText("Bạn đã sở hữu khóa học")).toBeVisible();
    await evidence(page, testInfo);
  });

  test("TC_PAY_008 Free course is enrolled directly without payment", async ({ browser }, testInfo) => {
    const page = await learnerPage(browser, 2);
    await page.goto(`/courses/${COURSE.free.slug}`);
    await expect(page.getByText("Miễn phí", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Đăng ký miễn phí" }).click();
    await page.goto(`/courses/${COURSE.free.slug}`);
    await expect(page.getByRole("link", { name: /Tiếp tục học|Vào học/ })).toBeVisible();
    await evidence(page, testInfo);
  });
});
