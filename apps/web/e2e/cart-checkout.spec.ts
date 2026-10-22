import type { Page } from "@playwright/test";

import {
  addToCart,
  buyNow,
  cleanupOrderAndCart,
  cartCourseIds,
  orderCodeFromUrl,
  PAYMENTS_UNAVAILABLE,
  paymentScreenAvailable,
  purchasableCourses,
  removeFromCart,
} from "./commerce";
import { expect, horizontalOverflow, test } from "./fixtures";

// Every test here works on courses the learner does not already own or hold in the cart, and removes / cancels
// exactly what it created, including items restored after cancellation. Cart checkout runs on throwaway
// learners (E2E_ALLOW_DB=1) so it never moves preexisting seeded cart lines into an order.

async function openCart(page: Page) {
  await page.goto("/cart");
  await expect(page.getByRole("heading", { level: 1, name: /^Giỏ hàng/ })).toBeVisible();
}

const cartLine = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });
const totalRow = (page: Page) => page.locator("dl div").filter({ hasText: "Tổng cộng" }).locator("dd");
const currencyValue = (text: string) => Number(text.replace(/[^0-9]/g, ""));

async function pendingOrderCode(page: Page): Promise<string | null> {
  const response = await page.request.get("/api/student/cart");
  expect(response.ok(), "read pending order").toBe(true);
  return (await response.json()).pendingOrder?.code ?? null;
}

/** Dismissing must preserve the order; only explicit confirmation may cancel it. */
async function confirmCancellation(page: Page, orderCode: string, open: () => Promise<void>) {
  const cartBefore = (await cartCourseIds(page.request)).sort();
  await open();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog.getByRole("button", { name: "Giữ đơn hàng", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await pendingOrderCode(page)).toBe(orderCode);
  expect((await cartCourseIds(page.request)).sort()).toEqual(cartBefore);
  await open();
  await expect(dialog).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse((res) => new URL(res.url()).pathname === "/api/orders/cancel" && res.request().method() === "POST"),
    dialog.getByRole("button", { name: /^H[uủ][yỷ] giao dịch$/ }).click(),
  ]);
  expect(response.ok(), "confirmed cancellation").toBe(true);
  await expect.poll(() => pendingOrderCode(page)).not.toBe(orderCode);
  await expect(page).toHaveURL(/\/cart$/);
}

test.describe("cart and checkout (learner)", () => {
  test("UI-COM-40 learner opens /cart and the cart renders", async ({ rolePage }) => {
    const page = await rolePage("learner");
    const response = await page.goto("/cart");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: /^Giỏ hàng/ })).toBeVisible();
  });

  test("UI-COM-41 cart lists the course with remove, voucher field and 'Thanh toán'", async ({ rolePage }) => {
    const page = await rolePage("learner");
    const [course] = await purchasableCourses(page.request, 1);
    await addToCart(page.request, course.id);
    try {
      await openCart(page);
      const line = cartLine(page, course.title);
      await expect(line.getByRole("link", { name: course.title })).toBeVisible();
      await expect(line.getByRole("button", { name: `Xoá ${course.title} khỏi giỏ` })).toBeVisible();
      await expect(page.getByLabel("Mã giảm giá")).toBeVisible();
      await expect(page.getByRole("button", { name: "Áp dụng" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Thanh toán" })).toBeEnabled();
    } finally {
      await removeFromCart(page.request, course.id);
    }
  });

  test("UI-COM-42 voucher messages match the spec and a valid code lowers the total", async ({ rolePage, health }) => {
    const page = await rolePage("learner");
    const [course] = await purchasableCourses(page.request, 1);
    await addToCart(page.request, course.id);
    try {
      await openCart(page);
      const totalBefore = await totalRow(page).innerText();
      const subtotal = currencyValue(await page.locator("dl div").filter({ hasText: "Tạm tính" }).locator("dd").innerText());
      expect(subtotal, "WELCOME20 fixture minimum purchase").toBeGreaterThanOrEqual(500_000);
      expect(currencyValue(totalBefore)).toBe(subtotal);
      const apply = async (code: string) => {
        await page.getByLabel("Mã giảm giá").fill(code);
        await page.getByRole("button", { name: "Áp dụng" }).click();
      };

      await health.expectHttp(page, { status: 400, method: "POST", pathname: "/api/vouchers/validate" }, () => apply("KHONGTONTAI2026"));
      await expect(page.getByText("Mã giảm giá không tồn tại. Kiểm tra lại chính tả.")).toBeVisible();
      await expect(totalRow(page)).toHaveText(totalBefore);

      // Accepted SUMMER15 fixture is inactive; inactive must win over any later validation failure.
      await health.expectHttp(page, { status: 400, method: "POST", pathname: "/api/vouchers/validate" }, () => apply("SUMMER15"));
      await expect(page.getByText("Mã này đã ngừng áp dụng.", { exact: true })).toBeVisible();
      await expect(totalRow(page)).toHaveText(totalBefore);

      await apply("WELCOME20");
      await expect(page.getByText("Đã áp dụng")).toBeVisible();
      // Accepted WELCOME20 fixture: 20 percent, minimum 500000 VND, no cap.
      const discount = Math.round(subtotal * 20 / 100);
      await expect.poll(async () => currencyValue(await page.locator("dl div").filter({ hasText: "Giảm giá" }).locator("dd").innerText())).toBe(discount);
      await expect.poll(async () => currencyValue(await totalRow(page).innerText())).toBe(subtotal - discount);
      await page.getByRole("button", { name: "Bỏ mã giảm giá" }).click();
      await expect(totalRow(page)).toHaveText(totalBefore);
    } finally {
      await removeFromCart(page.request, course.id);
    }
  });

  test("UI-COM-43 removing a line takes effect at once and 'Hoàn tác' restores it", async ({ rolePage }) => {
    const page = await rolePage("learner");
    const [course] = await purchasableCourses(page.request, 1);
    await addToCart(page.request, course.id);
    try {
      await openCart(page);
      await cartLine(page, course.title).getByRole("button", { name: `Xoá ${course.title} khỏi giỏ` }).click();
      await expect(cartLine(page, course.title).getByRole("link", { name: course.title })).toHaveCount(0);
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: `Đã xoá "${course.title}" khỏi giỏ hàng` });
      await expect(toast).toBeVisible();
      await toast.getByRole("button", { name: /Hoàn tác/ }).click();
      await expect(cartLine(page, course.title).getByRole("link", { name: course.title })).toBeVisible();
    } finally {
      await removeFromCart(page.request, course.id);
    }
  });

  test("UI-COM-52 'Hủy giao dịch' asks for confirmation, then returns to the cart", async ({ rolePage, health }) => {
    const page = await rolePage("learner");
    const [course] = await purchasableCourses(page.request, 1);
    const { orderCode, courseSlug } = await buyNow(page.request, course.id);
    try {
      await page.goto(`/courses/${courseSlug ?? course.slug}/checkout?order=${encodeURIComponent(orderCode)}`);
      test.skip(!(await paymentScreenAvailable(page, health)), PAYMENTS_UNAVAILABLE);
      await confirmCancellation(page, orderCode, () => page.getByRole("button", { name: /^H[uủ][yỷ] giao dịch$/ }).click());
      await expect(cartLine(page, course.title).getByRole("link", { name: course.title })).toBeVisible();
      expect(await cartCourseIds(page.request)).toContain(course.id);
    } finally {
      await cleanupOrderAndCart(page.request, orderCode, [course.id]);
    }
  });

  test("UI-COM-53 cart shows a banner for a pending order and 'Huỷ đơn này' cancels it", async ({ rolePage }) => {
    const page = await rolePage("learner");
    const [course] = await purchasableCourses(page.request, 1);
    const { orderCode } = await buyNow(page.request, course.id);
    try {
      await openCart(page);
      const banner = page.getByRole("status").filter({ hasText: `Bạn có đơn hàng ${orderCode} đang chờ thanh toán` });
      await expect(banner).toBeVisible();
      await confirmCancellation(page, orderCode, () => banner.getByRole("button", { name: "Huỷ đơn này" }).click());
      await expect(banner).toHaveCount(0);
      expect(await cartCourseIds(page.request)).toContain(course.id);
    } finally {
      await cleanupOrderAndCart(page.request, orderCode, [course.id]);
    }
  });

  test("UI-COM-54 'Mua ngay' checks out only that course and leaves the cart unchanged", async ({
    rolePage,
    health,
  }) => {
    const page = await rolePage("learner");
    const [inCart, bought] = await purchasableCourses(page.request, 2);
    await addToCart(page.request, inCart.id);
    let orderCode: string | null = null;
    try {
      const cartBefore = (await cartCourseIds(page.request)).sort();
      await page.goto(`/courses/${bought.slug}`);
      await page.getByRole("complementary", { name: "Đăng ký khóa học" }).getByRole("button", { name: "Mua ngay" }).click();
      await page.waitForURL(`**/courses/${bought.slug}/checkout?order=*`);
      orderCode = orderCodeFromUrl(page.url());
      test.skip(!(await paymentScreenAvailable(page, health)), PAYMENTS_UNAVAILABLE);
      await expect(page.getByText(bought.title, { exact: true })).toBeVisible();
      await expect(page.getByText(inCart.title, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("img", { name: "Mã QR Thanh Toán" })).toBeAttached();
      await expect(page.getByText("Mã giao dịch (để đối soát):")).toBeVisible();
      await expect(page.getByText(orderCode ?? "", { exact: true })).toBeVisible();
      expect((await cartCourseIds(page.request)).sort()).toEqual(cartBefore);
    } finally {
      await cleanupOrderAndCart(page.request, orderCode, [inCart.id, bought.id]);
    }
  });

  test("UI-COM-57 header cart badge matches the number of cart lines", async ({ rolePage }) => {
    const page = await rolePage("learner");
    await openCart(page);
    const lines = (await cartCourseIds(page.request)).length;
    await expect(page.getByRole("link", { name: `Giỏ hàng, ${lines} khoá học` })).toBeVisible();
  });

  test("UI-COM-58 header bell shows the unread notification count", async ({ rolePage }) => {
    const page = await rolePage("learner");
    await page.goto("/courses");
    await expect(page.getByRole("button", { name: /^Thông báo, \d+ chưa đọc$/ })).toBeVisible();
  });

  test("UI-COM-63 cart fits 390px with a reachable 'Thanh toán'", { tag: "@mobile" }, async ({ rolePage }) => {
    const page = await rolePage("learner");
    await page.setViewportSize({ width: 390, height: 844 });
    const [course] = await purchasableCourses(page.request, 1);
    await addToCart(page.request, course.id);
    try {
      await openCart(page);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      const pay = page.getByRole("button", { name: "Thanh toán" });
      await pay.scrollIntoViewIfNeeded();
      await expect(pay).toBeInViewport({ ratio: 1 });
    } finally {
      await removeFromCart(page.request, course.id);
    }
  });
});

test.describe("checkout from the cart (throwaway learner)", () => {
  test("UI-COM-44 checkout of a two-course cart lists both courses in the order summary", async ({
    throwaway,
    health,
  }) => {
    const { page } = await throwaway("cart2");
    const courses = await purchasableCourses(page.request, 2);
    let orderCode: string | null = null;
    try {
      for (const c of courses) await addToCart(page.request, c.id);
      await openCart(page);
      await page.getByRole("button", { name: "Thanh toán" }).click();
      await page.waitForURL((url) => /\/(?:courses\/[^/]+\/)?checkout$/.test(url.pathname) && url.searchParams.has("order"));
      orderCode = orderCodeFromUrl(page.url());
      test.skip(!(await paymentScreenAvailable(page, health)), PAYMENTS_UNAVAILABLE);
      for (const c of courses) await expect(page.getByText(c.title, { exact: true })).toBeVisible();
    } finally {
      await cleanupOrderAndCart(page.request, orderCode ?? orderCodeFromUrl(page.url()), courses.map((course) => course.id));
    }
  });

  test("UI-COM-55 cancelling a pending cart order puts its courses back in the cart", async ({ throwaway }) => {
    const { page } = await throwaway("cancel");
    const [course] = await purchasableCourses(page.request, 1);
    let orderCode: string | null = null;
    try {
      await addToCart(page.request, course.id);
      await openCart(page);
      await page.getByRole("button", { name: "Thanh toán" }).click();
      await page.waitForURL((url) => /\/(?:courses\/[^/]+\/)?checkout$/.test(url.pathname) && url.searchParams.has("order"));
      orderCode = orderCodeFromUrl(page.url());
      await openCart(page);
      const banner = page.getByRole("status").filter({ hasText: `Bạn có đơn hàng ${orderCode} đang chờ thanh toán` });
      expect(orderCode).not.toBeNull();
      await confirmCancellation(page, orderCode!, () => banner.getByRole("button", { name: "Huỷ đơn này" }).click());
      await expect(banner).toHaveCount(0);
      await expect(cartLine(page, course.title).getByRole("link", { name: course.title })).toBeVisible();
      expect(await cartCourseIds(page.request)).toContain(course.id);
    } finally {
      await cleanupOrderAndCart(page.request, orderCode ?? orderCodeFromUrl(page.url()), [course.id]);
    }
  });
});
