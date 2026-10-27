/**
 * Read-only snapshot of the mockup seed accounts' real data, written as JSON demo fixtures.
 *
 * Every read goes through an existing service function or GET handler. Nothing here inserts,
 * updates or deletes. Writers found while reading were skipped (see the notes in the report).
 * Only rows that belong to seed accounts or seeded courses are kept, and every email is replaced
 * with a stable placeholder before the JSON is written.
 *
 * Run from apps/web: pnpm demo:snapshot
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createDb } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { createLearnerOverviewService } from "../src/lib/learner-overview-service";
import { createLearningPathService } from "../src/lib/learning-path-service";
import { createLessonPlayerService } from "../src/lib/lesson-player-service";
import { getCourseDetail } from "../src/lib/get-course-detail";
import { getAdminPublishedCourses } from "../src/lib/admin-courses-service";
import { getAdminOrderDetail, getAdminOrders } from "../src/lib/admin-orders-service";
import { GET as getCoursesRoute } from "../src/app/api/courses/route";

// Vietnamese UI data is displayed in Asia/Bangkok; set before any Date is formatted.
process.env.TZ = "Asia/Bangkok";

const LEARNER_ID = "usr-learner-001";
const ADMIN_ID = "usr-admin-001";
const JS_COURSE_ID = "course-js-001";

type SeedManifest = {
  users: { id: string; email: string; role: string }[];
  courses: { id: string; slug: string }[];
};

const OUT_DIR = path.resolve("src/demo-fixtures/snapshot");
const EMAIL_KEYS = new Set(["email", "buyerEmail", "instructorEmail"]);

function placeholderEmail(email: string) {
  return `user-${createHash("sha256").update(email).digest("hex").slice(0, 8)}@example.invalid`;
}

/** Replaces email-valued fields with stable placeholders so committed JSON holds no real addresses. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        EMAIL_KEYS.has(key) && typeof child === "string" ? placeholderEmail(child) : redact(child),
      ]),
    );
  }
  return value;
}

async function write(name: string, value: unknown) {
  // JSON.stringify serialises Date as ISO strings; fixture modules revive them where the type needs Date.
  const clean = redact(JSON.parse(JSON.stringify(value)));
  await writeFile(path.join(OUT_DIR, `${name}.json`), `${JSON.stringify(clean, null, 2)}\n`);
  const shape = Array.isArray(value)
    ? `items=${value.length}`
    : Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => `${k}=${(v as unknown[]).length}`)
        .join(" ");
  console.log(`  ${name}.json  ${shape || "object"}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (apps/web/.env)");
  const manifest = JSON.parse(
    await readFile(path.resolve("scripts/data/mockup-seed.json"), "utf8"),
  ) as SeedManifest;
  const db = createDb({ DATABASE_URL: process.env.DATABASE_URL });

  // Seed accounts are matched by email, then their DB ids must carry the expected role.
  const emailOf = new Map(manifest.users.map((u) => [u.id, u.email]));
  const rows = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.email, [...emailOf.values()]));
  const dbIdByManifestId = new Map<string, string>();
  for (const [manifestId, email] of emailOf) {
    const row = rows.find((r) => r.email === email);
    if (row) dbIdByManifestId.set(manifestId, row.id);
  }
  const learnerId = dbIdByManifestId.get(LEARNER_ID);
  const adminId = dbIdByManifestId.get(ADMIN_ID);
  if (!learnerId || !adminId) throw new Error("Seed learner/admin accounts not found; run pnpm db:seed-mockup first");
  if (!(await getActiveRoles(db, learnerId)).includes(ROLE.LEARNER)) throw new Error("Seed learner lacks LEARNER role");
  if (!(await getActiveRoles(db, adminId)).includes(ROLE.ADMIN)) throw new Error("Seed admin lacks ADMIN role");
  console.log(`Seed accounts matched: ${dbIdByManifestId.size}/${manifest.users.length}`);

  // Privacy filter: only seed users' orders and seeded courses leave the database.
  const seedUserIds = new Set(dbIdByManifestId.values());
  const seedCourseIds = new Set(manifest.courses.map((c) => c.id));
  const slugOfJsCourse = manifest.courses.find((c) => c.id === JS_COURSE_ID)?.slug;
  if (!slugOfJsCourse) throw new Error(`Seeded course ${JS_COURSE_ID} missing from manifest`);

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Writing to ${OUT_DIR}`);

  // Learner (usr-learner-001). All reads below are read-only transactions or GET-only paths.
  const overview = await createLearnerOverviewService(db).get(learnerId);
  await write("learner-overview", overview);
  const pathService = createLearningPathService(db);
  await write("learning-path", await pathService.get(learnerId, JS_COURSE_ID));
  await write("knowledge-map", await pathService.getKnowledgeMap(learnerId, JS_COURSE_ID));
  // The lesson the overview would resume into, so the player opens the same lesson as the dashboard.
  const resumeLessonId = overview.courses.find((c) => c.id === JS_COURSE_ID)?.nextLessonId;
  if (!resumeLessonId) throw new Error(`No resume lesson for ${JS_COURSE_ID}`);
  await write("lesson-player", await createLessonPlayerService(db).get(learnerId, JS_COURSE_ID, resumeLessonId));
  const detail = await getCourseDetail(slugOfJsCourse);
  if (!detail) throw new Error(`Seeded course ${slugOfJsCourse} is not published`);
  await write("course-detail", detail);

  // Public catalogue: the same GET handler the catalogue page calls, limited to seeded courses.
  const catalogRes = await getCoursesRoute(new NextRequest("http://localhost/api/courses"));
  const catalogBody = (await catalogRes.json()) as { courses: { id: string }[] };
  await write("catalog", catalogBody.courses.filter((c) => seedCourseIds.has(c.id)));

  // Admin (usr-admin-001): lists are filtered to seeded courses and seed buyers.
  const adminCourses = await getAdminPublishedCourses(db);
  await write("admin-courses", adminCourses.filter((c) => seedCourseIds.has(c.id)));

  const { orders: allOrders } = await getAdminOrders(db, { range: "all", status: "all" });
  const seedOrders = allOrders.filter((o) => seedUserIds.has(o.userId));
  // Stats are recomputed over the seed-only rows with the same formulas as getAdminOrders.
  const paid = seedOrders.filter((o) => o.status === "paid");
  await write("admin-orders", {
    orders: seedOrders,
    stats: {
      total: seedOrders.length,
      paidCount: paid.length,
      pendingCount: seedOrders.filter((o) => o.status === "pending").length,
      overdueCount: seedOrders.filter((o) => o.isOverdue).length,
      reconciliationCount: seedOrders.filter((o) => o.needsReconciliation).length,
      totalRevenue: paid.reduce((sum, o) => sum + o.totalAmount, 0),
    },
  });
  const firstOrder = seedOrders[0];
  if (firstOrder) await write("admin-order-detail", await getAdminOrderDetail(db, firstOrder.id));

  process.exit(0);
}

main().catch((error: unknown) => {
  // Print the message only: connection strings and secrets never reach the log.
  console.error(`demo:snapshot failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
