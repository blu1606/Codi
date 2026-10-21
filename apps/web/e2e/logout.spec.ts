import type { Page, Route } from "@playwright/test";
import { setTimeout as wait } from "node:timers/promises";
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

// Observe real browser fetch calls without replacing their responses. Counting at
// invocation makes the negative assertion deterministic, without a quiet-time sleep.
async function observeCartRequests(page: Page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch;
    const observer = { started: 0, aborted: 0 };
    Object.assign(window, { logoutCartObserver: observer });
    window.fetch = function (input, init) {
      const url = input instanceof Request ? input.url : String(input);
      if (new URL(url, location.href).pathname === "/api/student/cart") {
        observer.started++;
        const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
        signal?.addEventListener("abort", () => { observer.aborted++; }, { once: true });
      }
      return originalFetch.call(this, input, init);
    };
  });
}

async function cartObservation(page: Page, update = false) {
  return page.evaluate((dispatch) => {
    if (dispatch) window.dispatchEvent(new Event("codi:cart-updated"));
    return { ...(window as Window & { logoutCartObserver?: { started: number; aborted: number } }).logoutCartObserver! };
  }, update);
}

for (const theme of ["light", "dark"] as const) {
  for (const mobile of [false, true]) {
    test.describe(`overlapping logouts ${theme} ${mobile ? "@mobile 375px" : "desktop"}`, () => {
      test.beforeEach(async () => {
        // Production Better Auth permits 3 sign-ins per rolling 10s window.
        // Each case signs in twice; let the previous case's window expire.
        await wait(10_100);
      });
      test.use({
        viewport: mobile ? { width: 375, height: 812 } : { width: 1280, height: 800 },
        colorScheme: theme,
      });

      for (const order of ["failure-first", "success-first", "both-fail"] as const) {
        test(`UI-COM-32 overlapping logout ${order}`, async ({ page, health }, testInfo) => {
          await observeCartRequests(page);
          await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
          await Promise.all([
            page.waitForResponse((response) => cartRequest(response.url()) && response.status() === 200),
            signInViaForm(page, seedEmail("learner")),
          ]);
          await page.waitForURL("**/dashboard");
          await expect(accountMenu(page)).toBeVisible();
          // Keep the old cookie only in memory to verify actual server revocation.
          const oldCookie = (await page.context().cookies()).map(({ name, value }) => `${name}=${value}`).join("; ");
          const heldLogouts: Route[] = [];
          await page.route("**/api/auth/sign-out", (route) => { heldLogouts.push(route); });
          let heldCart!: Route;
          await page.route("**/api/student/cart", (route) => { heldCart = route; });
          await cartObservation(page, true);
          await expect.poll(() => Boolean(heldCart)).toBe(true);
          const beforeLogout = await cartObservation(page);
          const aborted = page.waitForEvent("requestfailed", (request) => cartRequest(request.url()));
          // Two separate UI callers share one real session and remain in flight.
          await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
          await expect.poll(() => heldLogouts.length).toBe(1);
          await accountMenu(page).click();
          await page.getByRole("menuitem", { name: "Đăng xuất", exact: true }).click();
          await expect.poll(() => heldLogouts.length).toBe(2);
          expect((await aborted).failure()?.errorText).toContain("ERR_ABORTED");
          expect((await cartObservation(page)).aborted).toBeGreaterThan(beforeLogout.aborted);
          await heldCart.abort();
          await page.unroute("**/api/student/cart");
          expect((await cartObservation(page, true)).started).toBe(beforeLogout.started);

          const fail = (route: Route) => health.expectHttp(page,
            { status: 503, method: "POST", pathname: "/api/auth/sign-out" },
            () => route.fulfill({ status: 503, json: { code: "SERVICE_UNAVAILABLE", message: "Injected logout failure" } }));
          const guest = () => expect(page.getByRole("banner").getByRole("link", { name: "Đăng nhập" })).toBeVisible();
          const screenshot = async (state: string) => {
            await testInfo.attach(state, { body: await page.screenshot({ animations: "disabled" }), contentType: "image/png" });
          };

          await screenshot("two-logouts-pending");
          if (order === "success-first") {
            // Successful logout always reaches Better Auth and the real database.
            await heldLogouts[1].continue();
            await guest();
            await expect(page).toHaveURL(/\/$/);
          }
          await fail(heldLogouts[0]);
          await expect(page.getByText("Không thể đăng xuất. Vui lòng thử lại.").first()).toBeVisible();
          // Neither another pending logout nor a completed one may be released.
          expect((await cartObservation(page, true)).started).toBe(beforeLogout.started);
          await screenshot(order === "success-first" ? "success-then-failure" : "failure-with-second-pending");

          if (order === "both-fail") {
            const restoredCart = page.waitForResponse((response) => cartRequest(response.url()) && response.status() === 200);
            await fail(heldLogouts[1]);
            await restoredCart;
            await expect(accountMenu(page)).toBeVisible();
            await expect(page).toHaveURL(/\/dashboard$/);
            const session = await page.request.get("/api/auth/get-session", { headers: { cookie: oldCookie } });
            expect(session.status()).toBe(200);
            expect((await session.json())?.session?.id).toBeTruthy();
            await screenshot("both-failed-session-and-cart-restored");
            await page.unroute("**/api/auth/sign-out");
            await accountMenu(page).click();
            await page.getByRole("menuitem", { name: "Đăng xuất", exact: true }).click();
          } else if (order === "failure-first") {
            await heldLogouts[1].continue();
          }

          await guest();
          await expect(accountMenu(page)).toHaveCount(0);
          await expect(page).toHaveURL(/\/$/);
          const ended = await cartObservation(page);
          expect((await cartObservation(page, true)).started).toBe(ended.started);
          const revoked = await page.request.get("/api/auth/get-session?disableCookieCache=true", { headers: { cookie: oldCookie } });
          expect(revoked.status()).toBe(200);
          expect(await revoked.json()).toBeNull();
          await screenshot("guest-after-real-session-revocation");
          await page.goto("/dashboard");
          await expect(page).toHaveURL(/\/login$/);

          // A fresh login for the same learner must be able to load its own cart.
          await page.unroute("**/api/auth/sign-out");
          await Promise.all([
            page.waitForResponse((response) => cartRequest(response.url()) && response.status() === 200),
            signInViaForm(page, seedEmail("learner")),
          ]);
          await page.waitForURL("**/dashboard");
          await expect(accountMenu(page)).toBeVisible();
          await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
          await page.waitForURL("**/login");
          await guest();
        });
      }
    });
  }
}
