import type { Page } from "@playwright/test";

import { seedEmail } from "./env";
import { devOverlayIssues, expect, horizontalOverflow, signInViaForm, test } from "./fixtures";

// Read-only checks on the dev learning fixtures (`pnpm --filter web db:seed-lesson-player`, `db:seed-coding`),
// which enrol every seeded `+student` account. Nothing here completes lessons or submits work: those writes cannot
// be undone without DB access. The coding tests change the server-saved draft and restore it afterwards.
const CHECKLIST_COURSE = "/learn/dev-player-checklist";
const CODING_COURSE = "/learn/dev-coding-practice";

/** Opens the course path and follows "Học tiếp" to the current lesson. */
async function openCurrentLesson(page: Page, coursePath: string) {
  await page.goto(coursePath);
  await page.getByRole("link", { name: "Học tiếp" }).first().click();
  await page.waitForURL(new RegExp(`${coursePath}/[0-9a-f-]{36}$`));
  await expect(page.getByRole("link", { name: "Về lộ trình" }).first()).toBeVisible();
}

const codeEditor = (page: Page) => page.getByRole("textbox", { name: "Code bài làm" });

/** Replaces the coding draft, runs `fn`, then restores the learner's original draft. */
async function withDraft(page: Page, code: string, fn: () => Promise<void>) {
  const editor = codeEditor(page);
  // The exercise loads the saved draft asynchronously, and in `next dev` the mount effect can load it twice; an
  // edit made before the last load finishes is overwritten (see the run report). Wait until loading is quiet.
  await expect(page.getByText(/^Đã nộp \d+ lần$/)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(editor).toBeEditable();
  const original = await editor.inputValue();
  try {
    await editor.fill(code);
    await expect(editor).toHaveValue(code);
    await expect(page.getByText("Đã lưu nháp")).toBeVisible();
    await expect(editor).toHaveValue(code);
    await fn();
  } finally {
    await editor.fill(original);
    await expect(page.getByText("Đã lưu nháp")).toBeVisible();
  }
}

const runButton = (page: Page) => page.getByRole("button", { name: /^Chạy/ });

test.describe("learner learning", () => {
  test("UI-LRN-01 learner signs in and lands on the learner home", async ({ page }) => {
    await signInViaForm(page, seedEmail("learner"));
    await page.waitForURL((url) => /^\/dashboard(\/learner)?$/.test(url.pathname));
    await expect(page.getByRole("heading", { name: "Bàn làm việc", exact: true })).toBeVisible();
    await expect(page.getByText("Học viên", { exact: true })).toBeVisible();
  });

  test("UI-LRN-02 learner sees the course catalog", async ({ rolePage }) => {
    const page = await rolePage("learner");
    await page.goto("/courses");
    await expect(page.getByRole("heading", { level: 1, name: "Khoá học" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /^[1-9]\d* khoá học$/ })).toBeVisible();
  });

  test("UI-LRN-10 personal path groups lessons by chapter with status chips, 'Vì sao?' and 'Học tiếp'", async ({
    rolePage,
  }) => {
    const page = await rolePage("learner");
    await page.goto(CHECKLIST_COURSE);
    await expect(page.getByRole("heading", { name: "Lộ trình học" }).or(page.getByText("Lộ trình học")).first()).toBeVisible();
    await expect(page.getByText("Kiểu dữ liệu cơ bản").first()).toBeVisible();
    await expect(page.getByText("Đang học", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Bị khoá", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^Cần học trước: /).first()).toBeVisible();
    // The current row's "Vì sao?" reason starts expanded; open it only when collapsed.
    const reason = page.getByText("Theo thứ tự mặc định của giảng viên.").first();
    await expect(page.getByText("Vì sao?").first()).toBeVisible();
    if (!(await reason.isVisible())) await page.getByText("Vì sao?").first().click();
    await expect(reason).toBeVisible();
    await expect(page.getByRole("link", { name: "Học tiếp" })).toBeVisible();
  });

  test("UI-LRN-11 opening a locked lesson URL explains why and links to the prerequisite", async ({ rolePage }) => {
    const page = await rolePage("learner");
    await openCurrentLesson(page, CHECKLIST_COURSE);
    const current = page.url();
    const locked = await page.getByRole("link", { name: "Boolean", exact: true }).first().getAttribute("href");
    expect(locked).toMatch(/^\/learn\/dev-player-checklist\/[0-9a-f-]{36}$/);
    await page.goto(locked ?? "");
    await expect(page.getByRole("heading", { name: "Bài học này đang bị khoá" }).or(page.getByText("Bài học này đang bị khoá"))).toBeVisible();
    await expect(page.getByText(/Bạn cần học “Chuỗi” trước/)).toBeVisible();
    await page.getByRole("link", { name: "Đến bài cần học trước" }).click();
    await expect(page).toHaveURL(current);
  });

  test("UI-LRN-12 'Hoàn thành bài học' stays disabled and lists the missing checklist items", async ({ rolePage }) => {
    const page = await rolePage("learner");
    await openCurrentLesson(page, CHECKLIST_COURSE);
    await expect(page.getByText("Để hoàn thành bài học")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hoàn thành bài học" })).toBeDisabled();
    await expect(page.getByText(/^Còn thiếu: .*Đạt quiz/)).toBeVisible();
  });

  test("UI-LRN-14 running code reports 'x/y bài kiểm thử đạt' with filters and expandable details", async ({
    rolePage,
  }) => {
    const page = await rolePage("learner");
    await openCurrentLesson(page, CODING_COURSE);
    const solution =
      "function sumEven(numbers) {\n  return numbers.filter((n) => n % 2 === 0).reduce((sum, n) => sum + n, 0);\n}\n";
    await withDraft(page, solution, async () => {
      await runButton(page).click();
      await expect(page.getByText(/^(\d+)\/\1 bài kiểm thử đạt$/)).toBeVisible({ timeout: 60_000 });
      const filters = page.getByLabel("Lọc kiểm thử");
      for (const label of ["Tất cả", "Đạt", "Chưa đạt"]) {
        await expect(filters.getByRole("button", { name: label, exact: true })).toBeVisible();
      }
      const detail = page.locator("details").filter({ has: page.locator("summary", { hasText: "Mảng rỗng" }) });
      await detail.locator("summary").click();
      await expect(detail.getByText("Kết quả thực tế")).toBeVisible();
    });
  });

  test("UI-LRN-16 runtime errors show the line number and an infinite loop shows the time limit", async ({
    rolePage,
  }) => {
    const page = await rolePage("learner");
    await openCurrentLesson(page, CODING_COURSE);
    const throwing = "function sumEven(numbers) {\n  throw new Error('loi thu nghiem');\n}\n";
    await withDraft(page, throwing, async () => {
      await runButton(page).click();
      await page.getByRole("tab", { name: "Console" }).click();
      await expect(page.getByText(/^Dòng \d+: .*loi thu nghiem/)).toBeVisible({ timeout: 60_000 });
    });
    const looping = "function sumEven(numbers) {\n  while (true) {}\n}\n";
    await withDraft(page, looping, async () => {
      await runButton(page).click();
      await page.getByRole("tab", { name: "Console" }).click();
      await expect(page.getByText(/Code đã vượt giới hạn 3 giây/)).toBeVisible({ timeout: 60_000 });
    });
  });

  test("UI-LRN-25 selecting a concept on the knowledge map shows its mastery and 'Học bài này'", async ({
    rolePage,
  }) => {
    const page = await rolePage("learner");
    await page.goto("/insights/knowledge-map");
    await expect(page.getByRole("heading", { name: "Bản đồ kiến thức của tôi" })).toBeVisible();
    await page.getByRole("combobox", { name: "Khoá học" }).selectOption({ label: "Trang học TypeScript — checklist (dữ liệu dev)" });
    await page.getByRole("button", { name: "Xem dạng danh sách" }).click();
    await page.getByRole("table").getByRole("button", { name: "Chuỗi", exact: true }).click();
    const details = page.getByText("Bài học liên quan").locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(details.getByText(/Chưa học|Đang học|Thành thạo|Vững/).first()).toBeVisible();
    await expect(details.getByRole("link", { name: "Học bài này" })).toBeVisible();
  });

  test("UI-LRN-28 lesson player fits 390px and opens the 'Danh sách bài học' sheet", { tag: "@mobile" }, async ({
    rolePage,
  }) => {
    const page = await rolePage("learner");
    await page.setViewportSize({ width: 390, height: 844 });
    await openCurrentLesson(page, CHECKLIST_COURSE);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: "Danh sách bài học" }).click();
    const sheet = page.getByRole("dialog", { name: "Danh sách bài học" });
    await expect(sheet.getByRole("link", { name: "Boolean" })).toBeVisible();
  });

  test("UI-LRN-29 learner pages load with no console errors and a clean dev overlay", async ({ rolePage, health }) => {
    const page = await rolePage("learner");
    const pages = ["/dashboard", "/courses", "/cart", CHECKLIST_COURSE, "/insights/knowledge-map"];
    const overlays: string[] = [];
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overlay = await devOverlayIssues(page);
      if (overlay) overlays.push(`${path}: ${overlay}`);
    }
    expect(health.all(), "console/page errors including known noise").toEqual([]);
    expect(overlays).toEqual([]);
  });
});
