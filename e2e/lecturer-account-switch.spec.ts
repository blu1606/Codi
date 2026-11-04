import { expect, test, type Page } from "@playwright/test";
import { SEED_PASSWORD } from "./health";

// Two lecturers in one tab, without a page reload: after A signs out and B signs in through the interface, the
// workspace must list B's courses only. The lecturer data caches live for the life of the page, so this catches a
// cache that outlives the account it was loaded for.
const LECTURER_A = process.env.E2E_LECTURER_EMAIL || "quochuy@codi.vn";
const LECTURER_B = process.env.E2E_OTHER_LECTURER_EMAIL || "thuha@codi.vn";

async function submitSignIn(page: Page, email: string) {
  await page.getByLabel("Địa chỉ Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(SEED_PASSWORD);
  for (let attempt = 0; attempt < 5; attempt++) {
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email")),
      page.getByRole("button", { name: "Đăng nhập", exact: true }).click(),
    ]);
    if (res.status() !== 429) return expect(res.status(), `sign-in ${email}`).toBe(200);
    await page.waitForTimeout((Number(res.headers()["x-retry-after"]) || 10) * 1000 + 500);
  }
  throw new Error(`sign-in for ${email} stayed rate-limited`);
}

// The course list, reached through the app's own link so the page is not reloaded.
async function openCourseList(page: Page) {
  await page.locator('#app-shell a[href="/teach/courses"], a[href="/teach/courses"]').first().click();
  await page.waitForURL("**/teach/courses");
  await page.waitForLoadState("networkidle");
}

async function publishedTitlesOf(page: Page) {
  const me = await (await page.request.get("/api/auth/get-session")).json();
  const { courses } = await (await page.request.get("/api/courses?limit=100")).json();
  return (courses as { title: string; instructorId: string }[])
    .filter((c) => c.instructorId === me.user.id)
    .map((c) => c.title);
}

test("a second lecturer in the same tab sees only their own courses", async ({ page }) => {
  await page.goto("/login");
  await submitSignIn(page, LECTURER_A);
  await page.waitForURL("**/teach");
  const titlesA = await publishedTitlesOf(page);
  // The check compares two lecturers' published courses; data without them (a fresh server) cannot show the bug.
  test.skip(titlesA.length === 0, `${LECTURER_A} has no published course on this target`);
  await openCourseList(page);
  await expect(page.locator("#app-main").getByText(titlesA[0]!).first()).toBeVisible();

  // Sign out and in again through the interface: same page, no reload.
  await page.getByRole("button", { name: /Mở menu tài khoản/ }).click();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.locator("a.hd-login").click();
  await submitSignIn(page, LECTURER_B);
  await page.waitForURL("**/teach");
  const titlesB = await publishedTitlesOf(page);
  test.skip(titlesB.length === 0, `${LECTURER_B} has no published course on this target`);
  await openCourseList(page);

  const main = page.locator("#app-main");
  await expect(main.getByText(titlesB[0]!).first()).toBeVisible();
  for (const title of titlesA.filter((t) => !titlesB.includes(t))) {
    await expect(main.getByText(title, { exact: true }), `A's course "${title}" under B`).toHaveCount(0);
  }
});
