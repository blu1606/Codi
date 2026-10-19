import { seedEmail } from "./env";
import { expect, signInViaForm, test } from "./fixtures";

test.describe("lecturer workspace", () => {
  test("UI-LEC-01 lecturer signs in to the lecturer home", async ({ page }) => {
    await signInViaForm(page, seedEmail("lecturer"));
    await page.waitForURL("**/dashboard/lecturer");
    await expect(page.getByRole("heading", { name: "Bàn làm việc", exact: true })).toBeVisible();
    await expect(page.getByText("Giảng viên", { exact: true })).toBeVisible();
  });

  test("UI-LEC-03 lecturer home shows no learner-only widgets", async ({ rolePage }) => {
    const page = await rolePage("lecturer");
    await page.goto("/dashboard/lecturer");
    await expect(page.getByRole("heading", { name: "Bàn làm việc", exact: true })).toBeVisible();
    for (const learnerWidget of ["Khóa học đăng ký", "Giờ học tích lũy", "Tư vấn với AI Mentor"]) {
      await expect(page.getByText(learnerWidget, { exact: true }), `learner widget "${learnerWidget}"`).toHaveCount(0);
    }
  });

  test("UI-LEC-04 disabled lecturer menu items are labelled 'Sắp ra mắt' and are not links", async ({ rolePage }) => {
    const page = await rolePage("lecturer");
    await page.goto("/dashboard/lecturer");
    for (const label of ["Soạn thảo khoá học", "Chấm bài tập", "Tiến độ học viên"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: label })).toHaveCount(0);
    }
    await expect(page.getByText("Sắp ra mắt")).toHaveCount(3);
  });
});
