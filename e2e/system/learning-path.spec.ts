import { expect, test, type Page } from "@playwright/test";

import { COURSE, evidence, learner, signIn } from "./support";

// Feature 3: Personal learning path. Business rules:
//  BR-13 Only a signed-in learner enrolled in the course can open its learning path.
//  BR-14 A first visit asks the learner to set a goal before the path is built (3 steps, each needs a choice or "Bỏ qua").
//  BR-15 "Học từ bài 1" keeps the lecturer's default order.
//  BR-16 Every lesson shows why it is at that place, and a lesson whose prerequisite is not learnt is flagged.
//  BR-17 Changing the goal re-orders only lessons not yet learnt; completed lessons and scores are kept.
const pathUrl = `/learn/${COURSE.js.id}`;

test.describe.serial("Learning path", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });
  test.afterAll(async () => page.close());

  test("TC_PATH_001 Guest opening a learning path is asked to sign in", async ({}, testInfo) => {
    await page.goto(pathUrl);
    await expect(page.getByText("Vui lòng đăng nhập", { exact: true })).toBeVisible();
    await evidence(page, testInfo);
  });

  test("TC_PATH_002 Learner not enrolled in a course cannot open its path", async ({ browser }, testInfo) => {
    const other = await browser.newPage();
    await signIn(other, learner(1));
    await other.goto(`/learn/${COURSE.react.id}`);
    await expect(other.getByRole("heading", { name: "Hãy thiết lập lộ trình học của bạn" })).toHaveCount(0);
    await expect(other.getByRole("link", { name: /Học tiếp/ })).toHaveCount(0);
    await expect(other.getByRole("heading", { name: "Bạn chưa sở hữu khoá học này" })).toBeVisible();
    await evidence(other, testInfo);
    await other.close();
  });

  test("TC_PATH_003 First visit of an enrolled learner asks to set up the path", async ({}, testInfo) => {
    await signIn(page, learner(3));
    await page.goto(pathUrl);
    await expect(page.getByRole("heading", { name: "Hãy thiết lập lộ trình học của bạn" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Bắt đầu thiết lập" })).toBeVisible();
    await evidence(page, testInfo);
  });

  test("TC_PATH_004 Goal setup needs a choice on each of the 3 steps", async ({}, testInfo) => {
    await page.getByRole("link", { name: "Bắt đầu thiết lập" }).click();
    const next = page.getByRole("button", { name: "Tiếp tục" });
    await expect(page.getByRole("heading", { name: "Bạn muốn đạt được gì với khoá học này?" })).toBeVisible();
    await expect(next).toBeDisabled();
    await page.getByText("Hoàn thành khóa học").click();
    await next.click();
    await expect(page.getByRole("heading", { name: "Bạn đang ở mức nào với chủ đề này?" })).toBeVisible();
    await expect(next).toBeDisabled();
    await page.getByText("Mới bắt đầu").click();
    await next.click();
    await expect(page.getByText("Thiết lập lộ trình · Bước 3/3")).toBeVisible();
    await expect(page.getByRole("button", { name: "Lưu mục tiêu" })).toBeDisabled();
    await page.locator("main label").first().click();
    await evidence(page, testInfo);
    await page.getByRole("button", { name: "Lưu mục tiêu" }).click();
    await expect(page.getByRole("heading", { name: "Bạn muốn học như thế nào?" })).toBeVisible();
  });

  test("TC_PATH_005 'Học từ bài 1' builds the path in the lecturer's order", async ({}, testInfo) => {
    await page.getByRole("button", { name: "Học từ bài 1" }).click();
    await page.waitForURL((url) => url.pathname === pathUrl);
    await expect(page.getByRole("link", { name: /Học tiếp\s*:\s*Biến, hằng và kiểu dữ liệu/ })).toBeVisible();
    const lessons = page.getByRole("link", { name: /^Bài \d+: / });
    await expect(lessons).toHaveCount(11);
    const titles = await lessons.allInnerTexts();
    expect(titles.map((t) => Number(t.match(/Bài (\d+)/)![1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    await evidence(page, testInfo);
  });

  test("TC_PATH_006 A lesson whose prerequisite is not learnt is flagged with the lesson to learn first", async ({}, testInfo) => {
    const notice = page.locator("li").filter({ hasText: "Bài 2: Hàm và phạm vi" }).filter({ hasText: "Chưa đủ tiên quyết" }).first();
    await expect(notice).toContainText("nên học Biến & kiểu dữ liệu trước (bài Biến, hằng và kiểu dữ liệu)");
    await notice.scrollIntoViewIfNeeded();
    await evidence(page, testInfo);
  });

  test("TC_PATH_007 Each lesson explains why it is at its place in the path", async ({}, testInfo) => {
    await page.getByRole("button", { name: "Vì sao? : Hàm và phạm vi" }).click();
    await expect(page.getByText("Theo thứ tự mặc định của giảng viên.").first()).toBeVisible();
    await evidence(page, testInfo);
    await page.keyboard.press("Escape");
  });

  test("TC_PATH_008 Changing the goal warns that completed lessons and scores are kept", async ({}, testInfo) => {
    await page.goto(pathUrl);
    await page.getByRole("button", { name: "Chỉnh mục tiêu" }).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText("Codi xếp lại thứ tự các bài chưa học. Bài đã hoàn thành và điểm số giữ nguyên.")).toBeVisible();
    await evidence(page, testInfo);
  });
});
