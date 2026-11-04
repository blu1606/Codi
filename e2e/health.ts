import { expect, type Page } from "@playwright/test";

// Collects what makes a page broken without failing a visible assertion: uncaught page errors, console errors and
// same-origin requests answering 5xx (or 4xx on static assets). Call assertClean() at the end of a test.
export function watchHealth(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("console", (msg) => {
    // Third-party frames (the Turnstile challenge on sign-up) log their own errors under their provider's policy.
    const source = msg.location().url;
    if (source && !source.startsWith(origin)) return;
    // The network copy of a failed request is recorded below with its URL; this one has no context.
    if (msg.type() === "error" && !/^Failed to load resource/.test(msg.text())) problems.push(`console: ${msg.text()}`);
  });
  page.on("response", (res) => {
    const url = new URL(res.url());
    if (url.origin !== origin) return;
    const asset = !url.pathname.startsWith("/api/");
    if (res.status() >= 500 || (asset && res.status() >= 400)) problems.push(`HTTP ${res.status()} ${url.pathname}`);
  });
  return {
    assertClean: () => expect(problems, "page health").toEqual([]),
  };
}

export const SEED_PASSWORD = process.env.SEED_ACCOUNT_PASSWORD || "Codi@12345";
export const SEED = {
  learner: process.env.E2E_LEARNER_EMAIL || "minhanh@codi.vn",
  lecturer: process.env.E2E_LECTURER_EMAIL || "quochuy@codi.vn",
  admin: process.env.E2E_ADMIN_EMAIL || "giabao@codi.vn",
} as const;

// Better Auth allows 3 sign-ins per 10 s per client address; a 429 is waited out (as a person would) and retried.
export async function signIn(page: Page, email: string, password = SEED_PASSWORD) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.goto("/login");
    await page.getByLabel("Địa chỉ Email").fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email")),
      page.getByRole("button", { name: "Đăng nhập", exact: true }).click(),
    ]);
    if (res.status() !== 429) {
      expect(res.status(), `sign-in ${email}`).toBe(200);
      return;
    }
    await page.waitForTimeout((Number(res.headers()["x-retry-after"]) || 10) * 1000 + 500);
  }
  throw new Error(`sign-in for ${email} stayed rate-limited`);
}
