import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page, type TestInfo } from "@playwright/test";

export const RESULTS_DIR = path.resolve("e2e/results/system");
export const ACCOUNTS_CSV = path.join(RESULTS_DIR, "accounts.csv");
export const ADMIN = { email: "giabao@codi.vn", password: process.env.SEED_ACCOUNT_PASSWORD || "Codi@12345" };

export const COURSE = {
  git: { slug: "git-github-cho-nguoi-moi", title: "Git & GitHub cho người mới" },
  react: { slug: "react-du-an-thuc-te", id: "course-react-001", title: "React từ cơ bản đến dự án thực tế" },
  js: { slug: "javascript-nen-tang", id: "course-js-001", title: "JavaScript nền tảng" },
  free: { slug: "react-native-expo", title: "Lập trình ứng dụng di động đa nền tảng với React Native & Expo" },
};

/** Test learner N (1..6) created by global setup. */
export function learner(n: number) {
  const email = `loadtest+${String(n).padStart(3, "0")}@codi.test`;
  const row = readFileSync(ACCOUNTS_CSV, "utf8").split(/\r?\n/).find((line) => line.startsWith(email + ","));
  if (!row) throw new Error(`${email} missing from ${ACCOUNTS_CSV}`);
  return { email, password: row.slice(email.length + 1) };
}

/** Fills the sign-in form (page or modal) and waits out Better Auth's rate limit (3 sign-ins per 10 s). */
export async function fillSignIn(page: Page, account: { email: string; password: string }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.getByLabel("Địa chỉ Email").fill(account.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(account.password);
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email")),
      page.getByRole("button", { name: "Đăng nhập", exact: true }).click(),
    ]);
    if (res.status() !== 429) {
      expect(res.status(), `sign-in ${account.email}`).toBe(200);
      return;
    }
    await page.waitForTimeout((Number(res.headers()["x-retry-after"]) || 10) * 1000 + 500);
  }
  throw new Error(`sign-in for ${account.email} stayed rate-limited`);
}

export async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/login");
  await fillSignIn(page, account);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** Picks the simulated bank result in the "Kịch bản thử nghiệm" drawer (local demo tools only). */
export async function choosePaymentOutcome(page: Page, label: string) {
  await page.getByRole("button", { name: "Kịch bản thử nghiệm" }).click();
  const drawer = page.getByRole("region", { name: "Kịch bản thử nghiệm" });
  await drawer.getByText(label, { exact: true }).click();
  await drawer.getByRole("button").first().click();
  await expect(drawer).toBeHidden();
}

export async function addToCart(page: Page, slug: string) {
  await page.goto(`/courses/${slug}`);
  await page.getByRole("button", { name: "Thêm vào giỏ" }).click();
  await expect(page.getByText("Đã trong giỏ hàng")).toBeVisible();
}

export async function applyVoucher(page: Page, code: string) {
  await page.getByLabel("Mã giảm giá").fill(code);
  await page.getByRole("button", { name: "Áp dụng" }).click();
}

/** Saves the evidence screenshot used in the System Test Excel (named by test case ID) and attaches it. */
export async function evidence(page: Page, testInfo: TestInfo) {
  const id = testInfo.title.split(" ")[0];
  const file = path.join(RESULTS_DIR, "evidence", `${id}.png`);
  await page.screenshot({ path: file, fullPage: false });
  await testInfo.attach(id, { path: file, contentType: "image/png" });
}

export const vnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`;
