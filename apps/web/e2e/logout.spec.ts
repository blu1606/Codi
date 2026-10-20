import type { Page, Route } from "@playwright/test";
import { seedEmail } from "./env";
import { expect, signInViaForm, test } from "./fixtures";

const accountMenu = (page: Page) => page.getByRole("button", { name: /^Mở menu tài khoản của / });
const cartRequest = (url: string) => new URL(url).pathname === "/api/student/cart";

async function reachCourses(page: Page) {
  // Each test must own its session: logout revokes it.
  await signInViaForm(page, seedEmail("learner"));
  await page.waitForURL("**/dashboard");
  await Promise.all([
    page.waitForResponse((response) => cartRequest(response.url()) && response.status() === 200),
    page.goto("/courses"),
  ]);
}

test("UI-COM-32 logout cancels pending cart requests before revoking the session", async ({ page }) => {
  await reachCourses(page);
  let heldRoute!: Route;
  let reportStarted!: () => void;
  const started = new Promise<void>((resolve) => { reportStarted = resolve; });
  let cartRequests = 0;
  await page.route("**/api/student/cart", (route) => {
    heldRoute = route;
    cartRequests++;
    reportStarted();
    // Deliberately hold the request until logout cancels it in the browser.
  });
  const aborted = page.waitForEvent("requestfailed", (request) => cartRequest(request.url()));
  await page.evaluate(() => window.dispatchEvent(new Event("codi:cart-updated")));
  await started;
  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  const request = await aborted;
  expect(request.failure()?.errorText).toContain("ERR_ABORTED");
  await expect(page.getByRole("banner").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
  await expect(accountMenu(page)).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("codi:cart-updated")));
  expect(cartRequests).toBe(1);
  await heldRoute.abort();
});

test("UI-COM-32 failed logout preserves the session and cart, then allows retry", async ({ page, health }) => {
  await reachCourses(page);
  await page.route("**/api/auth/sign-out", (route) => route.fulfill({
    status: 503,
    json: { code: "SERVICE_UNAVAILABLE", message: "Logout temporarily unavailable" },
  }));
  await accountMenu(page).click();
  const restoredCart = page.waitForResponse((response) => cartRequest(response.url()) && response.status() === 200);
  // Only this intentionally injected POST failure is expected. Cart 401s remain failures.
  await health.expectHttp(page, { status: 503, method: "POST", pathname: "/api/auth/sign-out" },
    () => page.getByRole("menuitem", { name: "Đăng xuất" }).click());
  await expect(page.getByText("Không thể đăng xuất. Vui lòng thử lại.")).toBeVisible();
  await restoredCart;
  await expect(accountMenu(page)).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Đăng nhập" })).toHaveCount(0);
  await page.unroute("**/api/auth/sign-out");
  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
});
