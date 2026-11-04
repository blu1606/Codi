import { expect, test, type Page } from "@playwright/test";

import { ADMIN, COURSE, addToCart, applyVoucher, evidence, fillSignIn, learner, signIn, vnd } from "./support";

// Feature 1: Cart and voucher. Business rules:
//  BR-01 A guest must sign in before adding to the cart; the chosen course is added after sign-in.
//  BR-02 A course appears at most once in the cart.
//  BR-03 A course the learner already owns cannot be bought again.
//  BR-04 A voucher must exist, be active, have uses left and meet the minimum order amount.
//  BR-05 Percent vouchers give value% of the subtotal; amount vouchers give a fixed VND amount.
//  BR-06 Admin voucher codes have 4–20 upper-case letters or digits; a percent value is at most 100.
test.describe.serial("Cart and voucher", () => {
  let page: Page;
  const cartLink = () => page.getByRole("link", { name: /^Giỏ hàng, \d+ khoá học$/ });
  const summary = () => page.locator("main");

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });
  test.afterAll(async () => page.close());

  test("TC_CART_001 Guest adding a course is asked to sign in, then the course is in the cart", async ({}, testInfo) => {
    await page.goto(`/courses/${COURSE.git.slug}`);
    await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByText("Đăng nhập để thêm khoá học vào giỏ.", { exact: false })).toBeVisible();
    await expect(modal.getByText(COURSE.git.title)).toBeVisible();
    await evidence(page, testInfo);
    await fillSignIn(page, learner(1));
    await expect(cartLink()).toHaveAccessibleName("Giỏ hàng, 1 khoá học");
  });

  test("TC_CART_002 Learner adds a second course and it shows as already in the cart", async ({}, testInfo) => {
    await addToCart(page, COURSE.react.slug);
    await expect(page.getByRole("button", { name: "Thêm vào giỏ" })).toHaveCount(0);
    await expect(cartLink()).toHaveAccessibleName("Giỏ hàng, 2 khoá học");
    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Giỏ hàng (2)" })).toBeVisible();
    await evidence(page, testInfo);
  });

  test("TC_CART_003 Owned course offers 'Tiếp tục học' instead of buying", async ({}, testInfo) => {
    await page.goto(`/courses/${COURSE.js.slug}`);
    await expect(page.getByRole("link", { name: "Tiếp tục học" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Thêm vào giỏ" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Mua ngay" })).toHaveCount(0);
    await evidence(page, testInfo);
  });

  test("TC_CART_004 Learner removes a course from the cart", async ({}, testInfo) => {
    await page.goto("/cart");
    await page.getByRole("button", { name: `Xoá ${COURSE.react.title} khỏi giỏ` }).click();
    await expect(page.getByRole("heading", { name: "Giỏ hàng (1)" })).toBeVisible();
    await expect(page.getByRole("link", { name: COURSE.react.title })).toHaveCount(0);
    await evidence(page, testInfo);
  });

  for (const [id, code, message] of [
    ["TC_CART_005", "KHONGTONTAI", "Mã giảm giá không tồn tại. Kiểm tra lại chính tả."],
    ["TC_CART_006", "SUMMER15", "Mã này đã ngừng áp dụng."],
    ["TC_CART_007", "GIAM100K", "Mã đã hết lượt sử dụng."],
    ["TC_CART_008", "WELCOME20", `Đơn hàng cần tối thiểu ${vnd(500000)} để dùng mã này.`],
  ] as const) {
    test(`${id} Voucher ${code} is refused with a clear message`, async ({}, testInfo) => {
      await page.goto("/cart");
      await applyVoucher(page, code);
      await expect(summary().getByText(message)).toBeVisible();
      await expect(summary().getByText("Tổng cộng", { exact: true }).locator("..")).toContainText(vnd(199000));
      await evidence(page, testInfo);
    });
  }

  test("TC_CART_009 Percent voucher entered in lower case gives 20% off", async ({}, testInfo) => {
    await addToCart(page, COURSE.react.slug);
    await page.goto("/cart");
    await applyVoucher(page, "welcome20");
    // 199.000 + 1.290.000 = 1.489.000; 20% = 297.800
    await expect(summary().getByText("Giảm giá", { exact: true }).locator("..")).toContainText("297.800");
    await expect(summary().getByText("Tổng cộng", { exact: true }).locator("..")).toContainText(vnd(1191200));
    await evidence(page, testInfo);
  });

  test("TC_CART_010 Amount voucher takes a fixed 50.000 ₫ off", async ({}, testInfo) => {
    await page.goto("/cart");
    await page.getByRole("button", { name: "Bỏ mã giảm giá" }).click(); // the WELCOME20 code from TC_CART_009 is still applied
    await applyVoucher(page, "BACKEND50K");
    await expect(summary().getByText("Giảm giá", { exact: true }).locator("..")).toContainText("50.000");
    await expect(summary().getByText("Tổng cộng", { exact: true }).locator("..")).toContainText(vnd(1439000));
    await evidence(page, testInfo);
  });

  test("TC_CART_011 Admin cannot create a voucher with a short code or a percent above 100", async ({ browser }, testInfo) => {
    const admin = await browser.newPage();
    await signIn(admin, ADMIN);
    await admin.goto("/admin/vouchers");
    await admin.getByRole("button", { name: "Tạo voucher" }).first().click();
    const form = admin.getByRole("dialog");
    await form.locator("#vf-code").fill("AB");
    await form.locator("#vf-value").fill("101");
    await form.getByRole("button", { name: "Tạo voucher" }).click();
    await expect(form.getByText("Mã gồm 4–20 ký tự chữ in hoa hoặc số.")).toBeVisible();
    await expect(form.getByText("Phần trăm tối đa là 100.")).toBeVisible();
    await evidence(admin, testInfo);
    await admin.close();
  });
});
