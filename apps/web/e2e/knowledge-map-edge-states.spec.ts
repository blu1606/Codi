import { seedEmail } from "./env";
import { expect, horizontalOverflow, signInViaForm, test } from "./fixtures";

interface EdgeFixture {
  id: string;
  unconfirmedCourseId: string;
}
const course: EdgeFixture | null = process.env.E2E_KMAP_CTA_FIXTURE
  ? JSON.parse(process.env.E2E_KMAP_CTA_FIXTURE)
  : null;

test.describe("UI-LRN-25 real-session map edge states", () => {
  test.skip(
    !course?.unconfirmedCourseId,
    "Run verify-knowledge-map-cta.mjs --allow-dev-db --edge-states.",
  );

  for (const mobile of [false, true]) {
    for (const theme of ["light", "dark"] as const) {
      const variant = `${mobile ? "mobile" : "desktop"}-${theme}`;
      test(`unconfirmed map and concept without lessons ${variant}`, async ({
        page,
      }, info) => {
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

        const hiddenId = course!.unconfirmedCourseId;
        await page.goto(`/insights/knowledge-map?course=${hiddenId}`);
        await expect(
          page.getByRole("heading", {
            name: "Chưa có bản đồ kiến thức",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByText(
            "Bản đồ xuất hiện sau khi giảng viên xác nhận các khái niệm và điều kiện tiên quyết của khoá học.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Xem dạng danh sách", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: "Bài học liên quan", exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: /^Học bài này/ }),
        ).toHaveCount(0);
        await expect(
          page.getByRole("link", { name: "Về lộ trình", exact: true }),
        ).toHaveAttribute("href", `/learn/${hiddenId}`);
        await expect(page.locator("html")).toHaveClass(
          new RegExp(`\\b${theme}\\b`),
        );
        const hiddenResponse = await page.request.get(
          `/api/insights/knowledge-map?course=${hiddenId}`,
        );
        expect(hiddenResponse.status()).toBe(200);
        const hidden = await hiddenResponse.json();
        expect(hidden).toMatchObject({
          courseId: hiddenId,
          confirmed: false,
          nodes: [],
          edges: [],
        });
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        await info.attach(`unconfirmed-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });

        await page.goto(`/insights/knowledge-map?course=${course!.id}`);
        await page
          .getByRole("button", { name: "Xem dạng danh sách", exact: true })
          .click();
        await page
          .getByRole("table")
          .getByRole("button", {
            name: "Khái niệm chưa có bài QA",
            exact: true,
          })
          .click();
        const details = page
          .getByRole("heading", { name: "Bài học liên quan", exact: true })
          .locator("..");
        await expect(
          details.getByText("Chưa có bài được xuất bản cho khái niệm này.", {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          details.getByText("Chưa học", { exact: true }),
        ).toBeVisible();
        await expect(details.getByRole("link")).toHaveCount(0);
        const mapResponse = await page.request.get(
          `/api/insights/knowledge-map?course=${course!.id}`,
        );
        expect(mapResponse.status()).toBe(200);
        const map = await mapResponse.json();
        expect(map.confirmed).toBe(true);
        expect(
          map.nodes.find(
            (node: { name: string }) =>
              node.name === "Khái niệm chưa có bài QA",
          ),
        ).toMatchObject({ level: 0, locked: false, lessons: [] });
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        await info.attach(`no-related-lessons-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      });
    }
  }
});
