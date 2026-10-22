import type { Page } from "@playwright/test";

import {
  cleanupOrderAndCart,
  cartCourseIds,
  orderCodeFromUrl,
  PAYMENTS_UNAVAILABLE,
  paymentScreenAvailable,
  publishedCourses,
  purchasableCourses,
  removeFromCart,
} from "./commerce";
import { seedEmail, seedPassword } from "./env";
import { expect, horizontalOverflow, test } from "./fixtures";

const resultCount = (page: Page) => page.getByRole("status").filter({ hasText: /\d+ khoá học/ });
const search = (page: Page) => page.getByRole("combobox", { name: /Tìm khóa học/ }).or(page.getByPlaceholder(/Tìm khóa học/));

async function openCatalog(page: Page) {
  await page.goto("/courses");
  await expect(page.getByRole("heading", { level: 1, name: "Khoá học" })).toBeVisible();
  await expect(resultCount(page)).toBeVisible();
}

async function openDetail(page: Page, slug: string) {
  await page.goto(`/courses/${slug}`);
  await expect(page.getByRole("complementary", { name: "Đăng ký khóa học" })).toBeVisible();
}

const purchaseCard = (page: Page) => page.getByRole("complementary", { name: "Đăng ký khóa học" });
const gate = (page: Page) => page.getByRole("dialog", { name: "Đăng nhập tài khoản" });

async function signInThroughGate(page: Page, password = seedPassword()) {
  const dialog = gate(page);
  await dialog.getByLabel("Địa chỉ Email").fill(seedEmail("learner"));
  await dialog.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test.describe("guest catalog and course detail", () => {
  test("UI-COM-01 guest sees the catalog heading and course cards", async ({ page }) => {
    await openCatalog(page);
    const count = Number((await resultCount(page).innerText()).match(/\d+/)?.[0]);
    expect(count).toBeGreaterThan(0);
    await expect(page.locator("a[href^='/courses/']").first()).toBeVisible();
  });

  test("UI-COM-02 typing in search opens a typeahead with top results and 'Xem tất cả kết quả'", async ({ page }) => {
    await openCatalog(page);
    await search(page).fill("react");
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    await expect(listbox.getByText("Kết quả hàng đầu")).toBeVisible();
    await expect(listbox.getByText("Xem tất cả kết quả")).toBeVisible();
  });

  test("UI-COM-03 a search term shows a result count and a removable chip with 'Xóa bộ lọc'", async ({ page }) => {
    await openCatalog(page);
    const total = await resultCount(page).innerText();
    await search(page).fill("react");
    await search(page).press("Escape");
    const chip = page.getByRole("button", { name: /Bỏ bộ lọc Từ khóa: "react"/ });
    await expect(chip).toBeVisible();
    await expect(page.getByRole("button", { name: "Xóa bộ lọc" })).toBeVisible();
    await expect(resultCount(page)).not.toHaveText(total);
    await chip.click();
    await expect(chip).toHaveCount(0);
    await expect(resultCount(page)).toHaveText(total);
  });

  test("UI-COM-04 sort dropdown offers the four spec options", async ({ page }) => {
    await openCatalog(page);
    const sort = page.getByLabel("Sắp xếp danh sách khóa học");
    await expect(sort.locator("option")).toHaveText(["Phù hợp nhất", "Mới nhất", "Đánh giá cao nhất", "Học nhiều nhất"]);
  });

  test("UI-COM-05 a search with no results offers 'Đặt lại bộ lọc' and 'Hỏi AI Codi gợi ý khóa học'", async ({
    page,
  }) => {
    await openCatalog(page);
    const queryTerm = "Lập trình Rust & AI nâng cao!";
    await search(page).fill(queryTerm);
    await search(page).press("Escape");
    await expect(page.getByRole("heading", { name: "Không tìm thấy khóa học phù hợp" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đặt lại bộ lọc" })).toBeVisible();
    
    const aiButton = page.getByRole("button", { name: "Hỏi AI Codi gợi ý khóa học" });
    await expect(aiButton).toBeVisible();

    // Verify navigation URL without triggering live AI provider calls
    await page.route("**/ai?**", (route) => {
      return route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>AI Mock Target</body></html>" });
    });

    const aiRequestPromise = page.waitForRequest((req) => req.url().includes("/ai?"));
    await aiButton.click();
    const aiRequest = await aiRequestPromise;

    const parsedUrl = new URL(aiRequest.url());
    expect(parsedUrl.pathname).toBe("/ai");
    expect(parsedUrl.searchParams.get("prompt")).toBe(`Gợi ý khóa học ${queryTerm}`);
  });

  test("UI-COM-06 course detail syllabus labels each lesson with its type", async ({ page, request }) => {
    // Some seeded courses have no chapters yet; check the first course that has a syllabus.
    let checked: string | null = null;
    for (const course of await publishedCourses(request)) {
      await openDetail(page, course.slug);
      await expect(page.getByRole("heading", { level: 1, name: course.title })).toBeVisible();
      if ((await page.getByText(/^Số bài học$/).locator("xpath=following-sibling::dd").innerText()) === "0") continue;
      checked = course.slug;
      break;
    }
    expect(checked, "no published course with lessons").not.toBeNull();
    const syllabus = page.getByRole("region", { name: /Nội dung khóa học/ });
    await syllabus.getByRole("button", { name: "Mở rộng tất cả" }).click();
    const lessons = syllabus.getByRole("listitem");
    expect(await lessons.count(), "syllabus must contain lessons").toBeGreaterThan(0);
    for (const lesson of await lessons.all()) {
      await expect(lesson.getByText(/^(Video|Bài đọc|Quiz|Bài tập code|Bài tập)$/)).toBeVisible();
      await expect(lesson.locator("svg").first()).toBeVisible();
    }
  });

  test("UI-COM-07 free-preview lessons carry a 'Học thử' badge", async ({ page, request }) => {
    let found = false;
    for (const course of (await publishedCourses(request)).slice(0, 5)) {
      await openDetail(page, course.slug);
      if (await page.getByText("Học thử", { exact: true }).count()) {
        found = true;
        break;
      }
    }
    expect(found, "no 'Học thử' badge on the first five course details").toBe(true);
  });

  test("UI-COM-08 paid course shows 'Mua ngay' and 'Thêm vào giỏ' to a guest", async ({ page, request }) => {
    const [course] = (await publishedCourses(request)).filter((c) => c.price > 0);
    await openDetail(page, course.slug);
    await expect(purchaseCard(page).getByRole("button", { name: "Mua ngay" })).toBeVisible();
    await expect(purchaseCard(page).getByRole("button", { name: "Thêm vào giỏ" })).toBeVisible();
  });

  test("UI-COM-09 guest add-to-cart opens the sign-in overlay on the same URL", async ({ page, request }) => {
    const [course] = (await publishedCourses(request)).filter((c) => c.price > 0);
    await openDetail(page, course.slug);
    await purchaseCard(page).getByRole("button", { name: "Thêm vào giỏ" }).click();
    await expect(gate(page)).toBeVisible();
    await expect(
      gate(page).getByText("Đăng nhập để thêm khoá học vào giỏ. Sau khi đăng nhập, khoá học sẽ được thêm tự động."),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/courses/${course.slug}`);
  });

  test("UI-COM-10 wrong password in the overlay shows an inline error and keeps the overlay open", async ({
    page,
    request,
    health,
  }) => {
    const [course] = (await publishedCourses(request)).filter((c) => c.price > 0);
    await openDetail(page, course.slug);
    await purchaseCard(page).getByRole("button", { name: "Thêm vào giỏ" }).click();
    await health.expectHttp(page, { status: 401, method: "POST", pathname: "/api/auth/sign-in/email" }, () => signInThroughGate(page, "Sai-mat-khau-123!"));
    await expect.soft(gate(page).getByText(/không đúng|không chính xác|sai/i)).toBeVisible();
    await expect(gate(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/courses/${course.slug}`);
  });

  test("UI-COM-11 signing in from the overlay adds the course on the same page", async ({ page, rolePage }) => {
    const learner = await rolePage("learner");
    const [course] = await purchasableCourses(learner.request, 1);
    const cartBefore = await cartCourseIds(learner.request);
    try {
      await openDetail(page, course.slug);
      await purchaseCard(page).getByRole("button", { name: "Thêm vào giỏ" }).click();
      await signInThroughGate(page);
      await expect(gate(page)).toBeHidden();
      expect(new URL(page.url()).pathname).toBe(`/courses/${course.slug}`);
      const toast = page.locator("[data-sonner-toast]").filter({ hasText: /Đã thêm .* vào giỏ/ });
      await expect(toast).toBeVisible();
      await expect(toast.getByRole("button", { name: "Xem giỏ hàng" })).toBeVisible();
      await expect(purchaseCard(page).getByText("Đã trong giỏ hàng")).toBeVisible();
      await expect.poll(() => cartCourseIds(page.request)).toEqual(expect.arrayContaining([...cartBefore, course.id]));
      expect((await cartCourseIds(page.request)).length).toBe(cartBefore.length + 1);
      await expect(page.getByRole("link", { name: `Giỏ hàng, ${cartBefore.length + 1} khoá học`, exact: true })).toBeVisible();
    } finally {
      await removeFromCart(learner.request, course.id);
    }
  });

  test("UI-COM-12 guest 'Mua ngay' goes through the gate and lands on checkout for that course", async ({
    page,
    rolePage,
    health,
  }) => {
    const learner = await rolePage("learner");
    const [course] = await purchasableCourses(learner.request, 1);
    try {
      await openDetail(page, course.slug);
      await purchaseCard(page).getByRole("button", { name: "Mua ngay" }).click();
      await expect(gate(page).getByText("Đăng nhập để mua khoá học.")).toBeVisible();
      await signInThroughGate(page);
      await page.waitForURL(`**/courses/${course.slug}/checkout?order=*`);
      test.skip(!(await paymentScreenAvailable(page, health)), PAYMENTS_UNAVAILABLE);
      await expect(page.getByText(course.title, { exact: true })).toBeVisible();
    } finally {
      const code = orderCodeFromUrl(page.url());
      await cleanupOrderAndCart(learner.request, code, [course.id]);
    }
  });

  test("UI-COM-14 guest opening /cart is sent to sign-in with returnTo=/cart", async ({ page, health }) => {
    // CartView's mount effect is replayed by dev StrictMode; both observed requests must be the guard denial.
    await health.expectHttp(page, { status: 401, method: "GET", pathname: "/api/student/cart", maxCount: 2 }, async () => {
      await page.goto("/cart");
      await page.waitForURL((url) => url.pathname === "/login");
      await page.waitForLoadState("networkidle");
    });
    await page.waitForURL((url) => url.pathname === "/login");
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/cart");
    await expect(page.getByLabel("Địa chỉ Email")).toBeVisible();
  });

  test("UI-COM-60 guest can open the AI course advisor", async ({ page }) => {
    await page.goto("/ai");
    await expect(page.getByRole("heading", { name: "Codi AI Course Advisor" })).toBeVisible();
  });

  test("UI-COM-63 catalog, course detail, /login and /ai fit 390px for a guest", { tag: "@mobile" }, async ({
    page,
    request,
  }) => {
    const [course] = (await publishedCourses(request)).filter((c) => c.price > 0);
    const ready: [string, () => ReturnType<Page["locator"]>][] = [
      ["/courses", () => page.getByRole("heading", { level: 1, name: "Khoá học" })],
      [`/courses/${course.slug}`, () => purchaseCard(page)],
      ["/login", () => page.getByLabel("Địa chỉ Email")],
      ["/ai", () => page.getByRole("heading", { name: "Codi AI Course Advisor" })],
    ];
    for (const [path, landmark] of ready) {
      await page.goto(path);
      await expect(landmark()).toBeVisible();
      expect(await horizontalOverflow(page), `${path} overflows at 390px`).toBeLessThanOrEqual(0);
    }
    // The purchase CTA must stay reachable and fully on-screen at 390px.
    await openDetail(page, course.slug);
    const buy = purchaseCard(page).getByRole("button", { name: "Mua ngay" });
    await buy.scrollIntoViewIfNeeded();
    await expect(buy).toBeInViewport({ ratio: 1 });
  });
});
