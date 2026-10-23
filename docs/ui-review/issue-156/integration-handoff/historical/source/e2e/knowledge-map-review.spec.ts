import { test, expect, horizontalOverflow, signInViaForm } from "./fixtures";
import { seedEmail } from "./env";

interface CourseFixture {
  id: string;
  skills: number[];
  lessons: string[];
}
const fixture = process.env.E2E_KMAP_FIXTURE
  ? (JSON.parse(process.env.E2E_KMAP_FIXTURE) as {
      learner: CourseFixture;
      lecturer: Record<string, CourseFixture>;
      integration: boolean;
    })
  : null;

test.describe("PR165 real-session knowledge map review", () => {
  test.skip(
    !fixture,
    "Run scripts/verify-knowledge-map-browser.mjs --allow-dev-db against a production QA server.",
  );
  test.beforeEach(async () => {
    // Production Better Auth allows three sign-ins per rolling ten seconds.
    await new Promise((resolve) => setTimeout(resolve, 10_100));
  });

  for (const mobile of [false, true])
    for (const theme of ["light", "dark"] as const) {
      const variant = `${mobile ? "mobile" : "desktop"}-${theme}`;
      test(`learner locked/unlocked, real lesson navigation ${variant}`, async ({
        page,
      }, info) => {
        const course = fixture!.learner;
        await page.setViewportSize(
          mobile ? { width: 375, height: 844 } : { width: 1280, height: 800 },
        );
        await page.addInitScript(
          (value) => localStorage.setItem("theme", value),
          theme,
        );
        await signInViaForm(page, seedEmail("learner"));
        await page.waitForURL((url) => !url.pathname.startsWith("/login"));
        if (fixture!.integration) {
          // #144's actual progress page must still lead into #165.
          await page.goto("/dashboard");
          await expect(
            page.getByText("Tiếp tục học", { exact: true }),
          ).toBeVisible();
          await page.goto("/progress?tab=results");
          const mapLink = page.locator(
            `a[href="/insights/knowledge-map?course=${course.id}"]`,
          );
          await expect(mapLink).toBeVisible();
          await mapLink.click();
        } else await page.goto(`/insights/knowledge-map?course=${course.id}`);
        const graph = page.getByRole("group", {
          name: "Sơ đồ khái niệm, cuộn để xem toàn bộ",
        });
        const nodes = graph.getByRole("button");
        await expect(nodes).toHaveCount(3);
        await expect(graph.locator(":scope > div > svg > path")).toHaveCount(2);
        await expect(
          page.getByRole("button", { name: "Thống kê học tập", exact: true }),
        ).toBeDisabled();
        await page
          .getByRole("button", { name: "Xem dạng danh sách", exact: true })
          .click();
        await expect(page.getByRole("table")).toContainText("Vòng lặp QA");
        await page
          .getByRole("button", { name: "Xem dạng danh sách", exact: true })
          .click();
        await expect(page.getByRole("table")).toHaveCount(0);
        await expect(page.getByText("Đã bỏ QA", { exact: true })).toHaveCount(
          0,
        );
        for (const node of await nodes.all()) {
          const box = await node.boundingBox();
          expect(box?.width).toBe(152);
          expect(box?.height).toBe(60);
        }
        // Check real rendered node/edge alignment, independent of the layout helper.
        const boxes = await Promise.all(
          (await nodes.all()).map((node) => node.boundingBox()),
        );
        const svgBox = await graph.locator(":scope > div > svg").boundingBox();
        for (const [i, edge] of (
          await graph.locator(":scope > div > svg > path").all()
        ).entries()) {
          const points = (await edge.getAttribute("d"))!
            .match(/-?\d+(?:\.\d+)?/g)!
            .map(Number);
          expect(points[0]! + svgBox!.x).toBeCloseTo(boxes[i]!.x + 76, 0);
          expect(points[1]! + svgBox!.y).toBeCloseTo(boxes[i]!.y + 60, 0);
          expect(points.at(-2)! + svgBox!.x).toBeCloseTo(
            boxes[i + 1]!.x + 76,
            0,
          );
          expect(points.at(-1)! + svgBox!.y).toBeCloseTo(
            boxes[i + 1]!.y - 2,
            0,
          );
        }
        await graph
          .getByRole("button", { name: /^Vòng lặp QA: Chưa mở khoá/ })
          .click();
        const details = page
          .getByRole("heading", { name: "Bài học liên quan" })
          .locator("..");
        await expect(
          details.getByText(/Bị khoá, cần hoàn thành bài tiên quyết/),
        ).toBeVisible();
        await expect(details.getByRole("link")).toHaveCount(0);
        await expect(
          graph.locator(":scope > div > svg > path.stroke-viz-1"),
        ).toHaveCount(2);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
        await info.attach(`learner-locked-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        await graph.getByRole("button", { name: /^Hàm QA:/ }).click();
        const lesson = details.locator(
          `a[href="/learn/${course.id}/${course.lessons[1]}"]`,
        );
        await expect(lesson).toBeVisible();
        if (fixture!.integration)
          await expect(lesson).toHaveAccessibleName("Học bài này: Bài Hàm QA");
        await info.attach(`learner-unlocked-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        await lesson.click();
        await expect(page).toHaveURL(
          new RegExp(`/learn/${course.id}/${course.lessons[1]}$`),
        );
        await expect(
          page.getByRole("heading", { name: "Bài Hàm QA", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Về lộ trình" }),
        ).toBeVisible();
        await info.attach(`learner-player-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        // The server layout blocks the player before it can fetch the lesson API.
        await page.goto(`/learn/${course.id}/${course.lessons[2]}`);
        await expect(page.getByRole("status")).toContainText(
          "Bài học này đang bị khoá",
        );
        await expect(page.getByRole("status")).toContainText(
          "Bạn cần học “Hàm QA” trước",
        );
        await expect(
          page.getByRole("link", {
            name: "Đến bài cần học trước",
            exact: true,
          }),
        ).toHaveAttribute("href", `/learn/${course.id}/${course.lessons[1]}`);
        // Check the API guard independently with the same real signed-in session.
        const lockedResponse = await page.request.get(
          `/api/learn/${course.id}/lessons/${course.lessons[2]}`,
        );
        expect(lockedResponse.status()).toBe(403);
        await info.attach(`learner-server-locked-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      });

      test(`lecturer #133 cycle, minimap and declined endpoint ${variant}`, async ({
        page,
      }, info) => {
        test.skip(
          !fixture!.integration,
          "Lecturer #133 is verified only in the separate integration worktree.",
        );
        const course = fixture!.lecturer[variant]!;
        await page.setViewportSize(
          mobile ? { width: 375, height: 844 } : { width: 1280, height: 800 },
        );
        await page.addInitScript(
          (value) => localStorage.setItem("theme", value),
          theme,
        );
        await signInViaForm(page, seedEmail("lecturer"));
        await page.waitForURL((url) => !url.pathname.startsWith("/login"));
        await page.goto(`/dashboard/lecturer/courses/${course.id}/kmap`);
        await expect(
          page.getByText(/Phát hiện vòng lặp phụ thuộc:/),
        ).toBeVisible();
        const confirm = page.getByRole("button", {
          name: "Xác nhận bản đồ kiến thức",
          exact: true,
        });
        await expect(confirm).toBeDisabled();
        const edges = page.locator("svg.pointer-events-none > path");
        const minimap = page.locator('svg[width="128"][height="64"]');
        await expect(edges).toHaveCount(3);
        await expect(
          page.locator("svg.pointer-events-none > path.stroke-destructive"),
        ).toHaveCount(3);
        await expect(minimap.locator("rect")).toHaveCount(3);
        await expect(minimap.locator("line.stroke-destructive")).toHaveCount(3);
        if (!mobile) await expect(minimap).toBeVisible();
        await page
          .getByRole("heading", { name: "Hàm QA", exact: true })
          .click();
        await expect(
          page.getByText("Chi tiết khái niệm", { exact: true }),
        ).toBeVisible();
        // Cycle color wins over selected-neighbour highlighting.
        await expect(
          page.locator("svg.pointer-events-none > path.stroke-destructive"),
        ).toHaveCount(3);
        await info.attach(`lecturer-cycle-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        await page
          .getByRole("button", { name: "Danh sách", exact: true })
          .click();
        const concepts = page.locator('[data-slot="card"]').filter({
          has: page.getByText(/^Khái niệm \(\d+\)$/),
        });
        const row = concepts
          .getByText("Vòng lặp QA", { exact: true })
          .locator("../../..");
        await row.getByRole("button", { name: "Bỏ", exact: true }).click();
        await expect(confirm).toBeEnabled();
        await page.reload();
        await expect(
          page.getByText(/Phát hiện vòng lặp phụ thuộc:/),
        ).toHaveCount(0);
        // Persisted edges referencing declined nodes must never reach either renderer.
        await expect(edges).toHaveCount(1);
        await expect(minimap.locator("line")).toHaveCount(1);
        await expect(minimap.locator("rect")).toHaveCount(2);
        const first = page
          .getByRole("heading", { name: "Biến QA", exact: true })
          .locator("..");
        const second = page
          .getByRole("heading", { name: "Hàm QA", exact: true })
          .locator("..");
        const a = await first.boundingBox();
        const b = await second.boundingBox();
        expect(a!.width).toBe(232);
        expect(b!.width).toBe(232);
        expect(b!.x).toBeGreaterThan(a!.x);
        const canvas = await page
          .locator("svg.pointer-events-none")
          .boundingBox();
        const points = (await edges.getAttribute("d"))!
          .match(/-?\d+(?:\.\d+)?/g)!
          .map(Number);
        expect(points[0]! + canvas!.x).toBeCloseTo(a!.x + a!.width, 0);
        expect(points[1]! + canvas!.y).toBeCloseTo(a!.y + 64, 0);
        expect(points.at(-2)! + canvas!.x).toBeCloseTo(b!.x - 4, 0);
        expect(points.at(-1)! + canvas!.y).toBeCloseTo(b!.y + 64, 0);
        await info.attach(`lecturer-dag-${variant}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      });
    }
});
