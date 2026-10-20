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

  test("UI-LEC-04 lecturer menu entries are noninteractive when unavailable or reach their named page", async ({ rolePage }) => {
    const page = await rolePage("lecturer");
    await page.goto("/dashboard/lecturer");
    for (const [label, destination, heading] of [
      ["Soạn thảo khoá học", "/dashboard/lecturer/courses", /Kh(?:óa|oá|oa) học/i],
      ["Chấm bài tập", "/dashboard/lecturer/grading", /Chấm bài/i],
      ["Tiến độ học viên", "/dashboard/lecturer/progress", /Tiến độ học viên/i],
    ] as const) {
      await page.goto("/dashboard/lecturer");
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
});
