import { seedEmail } from "./env";
import { expect, signInViaForm, test } from "./fixtures";

interface MapFixture {
  id: string;
  lessons: string[];
}

const course: MapFixture | null = process.env.E2E_KMAP_CTA_FIXTURE
  ? JSON.parse(process.env.E2E_KMAP_CTA_FIXTURE)
  : null;

test.describe("UI-LRN-25 real-session lesson CTA", () => {
  test.skip(
    !course,
    "Run scripts/verify-knowledge-map-cta.mjs --allow-dev-db.",
  );

  for (const mobile of [false, true]) {
    for (const theme of ["light", "dark"] as const) {
      const variant = `${mobile ? "mobile" : "desktop"}-${theme}`;
      test(`available CTA opens player; locked lesson is denied ${variant}`, async ({
        page,
      }, info) => {
        // Production Better Auth limits sign-ins to three per rolling ten seconds.
        await new Promise((resolve) => setTimeout(resolve, 10_100));
        await page.setViewportSize(
          mobile ? { width: 375, height: 844 } : { width: 1280, height: 800 },
        );
        await page.addInitScript(
          (value) => localStorage.setItem("theme", value),
          theme,
        );
        await signInViaForm(page, seedEmail("learner"));
        await page.waitForURL((url) => !url.pathname.startsWith("/login"));
        await page.goto(`/insights/knowledge-map?course=${course!.id}`);
        await expect(
          page.getByRole("heading", { name: "Bản đồ kiến thức của tôi" }),
        ).toBeVisible();
        await expect(page.locator("html")).toHaveClass(
          new RegExp(`\\b${theme}\\b`),
        );
        await page
          .getByRole("button", { name: "Xem dạng danh sách", exact: true })
          .click();
        const table = page.getByRole("table");
        await expect(table.getByRole("button")).toHaveCount(3);
        await table
          .getByRole("button", { name: "Vòng lặp QA", exact: true })
          .click();
        const details = page
          .getByRole("heading", { name: "Bài học liên quan" })
          .locator("..");
        await expect(
          details.getByText(
            "Bài Vòng lặp QA · Bị khoá, cần hoàn thành bài tiên quyết",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(details.getByRole("link")).toHaveCount(0);
        await info.attach(`locked-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });

        await table
          .getByRole("button", { name: "Hàm QA", exact: true })
          .click();
        await expect(
          details.getByText("Chưa học", { exact: true }),
        ).toBeVisible();
        const cta = details.getByRole("link", {
          name: "Học bài này: Bài Hàm QA",
          exact: true,
        });
        await expect(cta).toHaveText("Học bài này");
        await expect(cta).toHaveAttribute(
          "href",
          `/learn/${course!.id}/${course!.lessons[1]}`,
        );
        await cta.scrollIntoViewIfNeeded();
        const box = await cta.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(
          page.viewportSize()!.width,
        );
        await info.attach(`unlocked-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });

        await cta.click();
        await expect(page).toHaveURL(
          new RegExp(`/learn/${course!.id}/${course!.lessons[1]}$`),
        );
        await expect(
          page.getByRole("heading", { name: "Bài Hàm QA", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Về lộ trình", exact: true }),
        ).toBeVisible();
        const available = await page.request.get(
          `/api/learn/${course!.id}/lessons/${course!.lessons[1]}`,
        );
        expect(available.status()).toBe(200);
        await info.attach(`player-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });

        await page.goto(`/learn/${course!.id}/${course!.lessons[2]}`);
        await expect(page.getByRole("status")).toContainText(
          "Bài học này đang bị khoá",
        );
        await expect(page.getByRole("status")).toContainText(
          "Bạn cần học “Hàm QA” trước",
        );
        const prerequisite = page.getByRole("link", {
          name: "Đến bài cần học trước",
          exact: true,
        });
        await expect(prerequisite).toHaveAttribute(
          "href",
          `/learn/${course!.id}/${course!.lessons[1]}`,
        );
        // Separate API request proves the server guard independently of hidden UI.
        const locked = await page.request.get(
          `/api/learn/${course!.id}/lessons/${course!.lessons[2]}`,
        );
        expect(locked.status()).toBe(403);
        await info.attach(`server-locked-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        await prerequisite.click();
        await expect(
          page.getByRole("heading", { name: "Bài Hàm QA", exact: true }),
        ).toBeVisible();
      });
    }
  }
});
