import { createRequire } from "node:module";
import path from "node:path";

import { test as base, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { authFile, dbAllowed, seedPassword, throwawayEmail, type SeedRole } from "./env";

export { expect };

// Console / page errors that are not product defects in the flow under test. Each entry says why.
const KNOWN_NOISE: { pattern: RegExp; reason: string }[] = [
  {
    // Same-origin 4xx/5xx responses are recorded separately below; the console copy has no request context.
    pattern: /^Failed to load resource: the server responded with a status of \d+/,
    reason: "duplicate of network status",
  },
  {
    // The suite itself blocks the VietQR image (see watch()), which Chrome reports as a failed resource.
    pattern: /^Failed to load resource: net::ERR_BLOCKED_BY_CLIENT/,
    reason: "image blocked by the test harness",
  },
  {
    // Known defect: React hydration mismatch on /login and on several signed-in pages (reported in
    // plans/reports/ui-test-*). It is asserted by the dedicated health tests (UI-LRN-29, UI-ADM-22,
    // UI-COM-health) so it does not mask the flow result of every other test.
    pattern: /Hydration failed because the server rendered|hydration-mismatch/i,
    reason: "known hydration defect, covered by health tests",
  },
  {
    // React 19 dev-only warning for the inline theme script injected by next-themes' ThemeProvider (the app
    // itself renders no <script>). Logged on client-side navigations; no user-visible effect.
    pattern: /^Encountered a script tag while rendering React component/,
    reason: "third-party dev warning (next-themes)",
  },
];

export interface Health {
  /** Expect an exact response during this action; bounded repeats require evidence at the call site. */
  expectHttp(page: Page, response: { status: number; method: string; pathname: string; maxCount?: number }, action: () => Promise<unknown>): Promise<void>;
  /** Accept an extra console/page error for the current test only (for example an expected 500 path). */
  allow(pattern: RegExp): void;
  /** Start collecting errors from another page (role pages and throwaway contexts call this). */
  watch(page: Page): void;
  /** Errors collected so far that are neither known noise nor allowed by the test. */
  unexpected(): string[];
  /** Same, but including known noise (used by the dedicated health tests). */
  all(): string[];
}

function createHealth(baseURL: string): Health {
  const allowed: RegExp[] = [];
  const errors: { text: string; expected: boolean }[] = [];
  const pending: { page: Page; status: number; method: string; pathname: string; remaining: number }[] = [];
  const origin = new URL(baseURL).origin;
  const watched = new WeakSet<Page>();
  return {
    async expectHttp(page, response, action) {
      const rule = { page, ...response, remaining: response.maxCount ?? 1 };
      pending.push(rule);
      try {
        const [actual] = await Promise.all([
          page.waitForResponse((res) => {
            const url = new URL(res.url());
            return url.origin === origin && url.pathname === response.pathname && res.request().method() === response.method;
          }),
          action(),
        ]);
        expect(actual.status(), `${response.method} ${response.pathname}`).toBe(response.status);
      } finally {
        pending.splice(pending.indexOf(rule), 1);
      }
    },
    allow: (pattern) => void allowed.push(pattern),
    watch(page) {
      if (watched.has(page)) return;
      watched.add(page);
      // The VietQR image URL and picture encode the receiving bank account. Never load it, so failure
      // screenshots and reports cannot contain it. The checkout screen stays usable without the image.
      void page.route(/^https:\/\/img\.vietqr\.io\//, (route) => route.abort("blockedbyclient"));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push({ text: `console: ${msg.text().slice(0, 400)}`, expected: false });
      });
      page.on("pageerror", (err) => errors.push({ text: `pageerror: ${err.message.slice(0, 400)}`, expected: false }));
      page.on("response", (res) => {
        const url = new URL(res.url());
        if (res.status() >= 400 && url.origin === origin) {
          const rule = pending.find((entry) => entry.remaining > 0 && entry.page === page &&
            entry.status === res.status() && entry.method === res.request().method() && entry.pathname === url.pathname);
          if (rule) rule.remaining--;
          errors.push({ text: `http ${res.status()} ${res.request().method()} ${url.pathname}`, expected: Boolean(rule) });
        }
      });
    },
    all: () => errors.map((e) => e.text),
    unexpected: () =>
      errors.filter(
        (e) => !e.expected &&
          !KNOWN_NOISE.some((n) => n.pattern.test(e.text.replace(/^(console|pageerror): /, ""))) &&
          !allowed.some((a) => a.test(e.text)),
      ).map((e) => e.text),
  };
}

/** Text of the Next.js dev "N Issues" badge / error overlay, or null when the overlay is clean. */
export async function devOverlayIssues(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const text = document.querySelector("nextjs-portal")?.shadowRoot?.textContent ?? "";
    const badge = text.match(/\d+\s+Issues?/i)?.[0];
    const error = text.match(/(Unhandled Runtime Error|Build Error|Server Error|Runtime Error|Console Error)/)?.[0];
    return badge ?? error ?? null;
  });
}

/** Signs in through the /login form. Does not assert the landing page. */
export async function signInViaForm(page: Page, email: string, password = seedPassword()): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Địa chỉ Email").fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

/** Width the document scrolls to beyond the viewport (0 means no horizontal overflow). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

// ---- Throwaway accounts (dev DB only) ----

interface PgClient {
  connect(): Promise<void>;
  query(sql: string, params: unknown[]): Promise<{ rows: { value: string }[] }>;
  end(): Promise<void>;
}

// `pg` is a dependency of @codi-1/db, not of the web app; resolve it from there.
const requireFromDb = createRequire(path.resolve(__dirname, "..", "..", "..", "packages", "db", "package.json"));

/** Latest email-verification OTP for a throwaway address, read from the dev `verification` table. */
async function readVerificationOtp(email: string): Promise<string | null> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const { Client } = requireFromDb("pg") as { Client: new (cfg: { connectionString: string }) => PgClient };
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      "select value from verification where lower(identifier) = lower($1) order by created_at desc limit 1",
      [`email-verification-otp-${email}`],
    );
    return rows[0]?.value.split(":")[0] ?? null;
  } finally {
    await client.end();
  }
}

export interface Throwaway {
  email: string;
  context: BrowserContext;
  page: Page;
}

/** Registers a new learner (`<base>+uitest<tag><ts>@…`) through the UI and completes the OTP step. */
async function registerThrowaway(browser: Browser, health: Health, tag: string): Promise<Throwaway> {
  const email = throwawayEmail(tag);
  const context = await browser.newContext();
  const page = await context.newPage();
  health.watch(page);
  await page.goto("/login?tab=signup");
  await page.getByLabel("Họ và tên").fill(`UI Test ${tag}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(seedPassword());
  await page.getByRole("button", { name: "Đăng ký tài khoản" }).click();
  await expect(page.getByText("Xác thực tài khoản")).toBeVisible();
  let otp: string | null = null;
  await expect
    .poll(async () => (otp = await readVerificationOtp(email)), { message: "OTP row for throwaway", timeout: 15_000 })
    .not.toBeNull();
  await page.getByLabel("Chữ số 1 của mã xác thực").click();
  await page.keyboard.type(otp ?? "");
  await page.getByRole("button", { name: "Xác thực và hoàn tất" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { email, context, page };
}

interface Fixtures {
  health: Health;
  /** Opens a page signed in as a seeded role (storage state from the setup project). */
  rolePage: (role: SeedRole) => Promise<Page>;
  /** Creates a verified throwaway learner. Skips the test unless E2E_ALLOW_DB=1. */
  throwaway: (tag: string) => Promise<Throwaway>;
}

export const test = base.extend<Fixtures>({
  health: [
    async ({ page, baseURL }, use, testInfo) => {
      const health = createHealth(baseURL ?? "http://localhost:3002");
      health.watch(page);
      await use(health);
      await testInfo.attach("browser-health", { body: JSON.stringify(health.all()), contentType: "application/json" });
      const unexpected = health.unexpected();
      expect(unexpected, "unexpected console errors, page errors or 4xx/5xx responses").toEqual([]);
    },
    { auto: true },
  ],
  rolePage: async ({ browser, health }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (role) => {
      const context = await browser.newContext({ storageState: authFile(role) });
      contexts.push(context);
      const page = await context.newPage();
      health.watch(page);
      return page;
    });
    await Promise.all(contexts.map((c) => c.close()));
  },
  throwaway: async ({ browser, health }, use) => {
    const created: Throwaway[] = [];
    await use(async (tag) => {
      test.skip(!dbAllowed(), "Throwaway sign-up reads the OTP from the dev DB; set E2E_ALLOW_DB=1 to run it.");
      const account = await registerThrowaway(browser, health, tag);
      created.push(account);
      return account;
    });
    await Promise.all(created.map((t) => t.context.close()));
  },
});
