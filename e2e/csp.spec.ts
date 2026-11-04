import { expect, test, type Page } from "@playwright/test";
import { SEED, signIn, watchHealth } from "./health";

// The Content-Security-Policy must not block anything the app needs. Each test opens the main pages of one role and
// fails on any securitypolicyviolation event (the browser's report of a blocked script, style, font, image, frame or
// request) as well as on the console errors and failed requests watchHealth collects. Read-only: the learner opens
// a lesson but saves nothing.

// Violations are sent to the test process as they happen, so they survive page navigations.
async function recordViolations(page: Page) {
  const violations: string[] = [];
  await page.exposeFunction("__reportCspViolation", (text: string) => violations.push(text));
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __reportCspViolation: (t: string) => void }).__reportCspViolation(
        `${e.effectiveDirective} blocked ${e.blockedURI || "(inline)"} on ${location.pathname}`,
      );
    });
  });
  return { assertNone: () => expect(violations, "CSP violations").toEqual([]) };
}

// Pages with Cloudflare Turnstile (sign-up, when its keys are set) keep a connection open and never reach
// "networkidle", so that wait is best effort: it only gives late requests time to report violations.
async function visit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("load");
  await expect(page.locator("#app-main")).toBeVisible();
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
}

test.describe("Content-Security-Policy", () => {
  test("the page carries the policy, without inline scripts or eval", async ({ request }) => {
    const res = await request.get("/");
    const csp = res.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  test("guest pages load nothing the policy blocks", async ({ page, baseURL }) => {
    const health = watchHealth(page, baseURL!);
    const csp = await recordViolations(page);
    for (const path of ["/", "/courses", "/courses/javascript-nen-tang", "/login", "/register"]) await visit(page, path);
    csp.assertNone();
    health.assertClean();
  });

  test("learner pages, including a lesson with a YouTube video, load nothing the policy blocks", async ({ page, baseURL }) => {
    const health = watchHealth(page, baseURL!);
    const csp = await recordViolations(page);
    await signIn(page, SEED.learner);
    for (const path of ["/dashboard", "/progress", "/insights", "/profile", "/settings", "/cart"]) await visit(page, path);

    const detail = await (await page.request.get("/api/courses/javascript-nen-tang")).json();
    const lessonId = detail.chapters[0].lessons[0].id;
    await visit(page, `/learn/${detail.course.id}/${lessonId}`);
    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/"]')).toBeAttached();
    csp.assertNone();
    health.assertClean();
  });

  test("lecturer pages load nothing the policy blocks", async ({ page, baseURL }) => {
    const health = watchHealth(page, baseURL!);
    const csp = await recordViolations(page);
    await signIn(page, SEED.lecturer);
    for (const path of ["/teach", "/teach/courses", "/teach/grading", "/teach/progress"]) await visit(page, path);
    csp.assertNone();
    health.assertClean();
  });

  test("admin pages load nothing the policy blocks", async ({ page, baseURL }) => {
    const health = watchHealth(page, baseURL!);
    const csp = await recordViolations(page);
    await signIn(page, SEED.admin);
    for (const path of ["/admin", "/admin/users", "/admin/courses", "/admin/finance", "/admin/insights"]) await visit(page, path);
    csp.assertNone();
    health.assertClean();
  });
});
