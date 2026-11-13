// Demo certificates in the demo course, so a presenter can sign in and press "Xem chứng chỉ":
//   chungchi.demo@codi.vn    finished every lesson → a valid certificate (also the in-app notice; email only if --email)
//   chungchi.thuhoi@codi.vn  finished every lesson → a certificate an admin revoked (shows the revoked state)
// Both use the seed password, the default path (no AI call) and have every published lesson marked complete; the
// certificate is issued by the app's own issueCertificate. Re-running keeps each existing certificate and its code.
//   npx tsx --env-file=.env scripts/demo-content/seed-demo-certificates.ts [--course id] [--email] [--allow-remote]
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { and, eq, isNull, sql } from "drizzle-orm";
import { hashPassword } from "@codi-1/auth";
import { account, user } from "@codi-1/db/schema/auth";
import { roles, userRoles } from "@codi-1/db/schema/roles";
import { courseCertificates } from "@codi-1/db/schema/certificates";
import { courseChapters, courseLessons } from "@codi-1/db/schema/course-content";
import { courses } from "@codi-1/db/schema/courses";
import { lessonProgress } from "@codi-1/db/schema/learning";
import { learningPathCompletions } from "@codi-1/db/schema/learning-path-runtime";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { db } from "@/services";
import { ENV } from "@/env";
import { issueCertificate, sendCertificateEmail } from "@/lib/certificate-service";

const { values: flags } = parseArgs({
  options: {
    course: { type: "string", default: "course-demo-js-full" },
    email: { type: "boolean", default: false },
    "allow-remote": { type: "boolean", default: false },
  },
  strict: true,
});
const courseId = flags.course!;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CASES = [
  { email: "chungchi.demo@codi.vn", name: "Trần Minh Khoa", revoke: null },
  { email: "chungchi.thuhoi@codi.vn", name: "Lê Thu Hà", revoke: "Demo: chứng chỉ bị thu hồi do đơn hàng của khoá học đã được hoàn tiền." },
] as const;

async function ensureLearner(tx: Tx, email: string, name: string, hashed: string) {
  const [found] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
  const id = found?.id ?? randomUUID().replace(/-/g, "").slice(0, 32);
  if (found) await tx.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, id));
  else {
    await tx.insert(user).values({ id, name, email, emailVerified: true });
    await tx.insert(account).values({ id: `demo-credential-${id}`, accountId: id, providerId: "credential", userId: id, password: hashed });
  }
  await tx.insert(roles).values([{ roleId: "LEARNER", roleName: "Learner" }]).onConflictDoNothing();
  const [role] = await tx.select({ userId: userRoles.userId }).from(userRoles)
    .where(and(eq(userRoles.userId, id), eq(userRoles.roleId, "LEARNER"), isNull(userRoles.revokedAt)));
  if (!role) await tx.insert(userRoles).values({ userId: id, roleId: "LEARNER", grantedAt: new Date() }).onConflictDoNothing();
  return id;
}

/** Enrollment finished on the default path: goal and entry test skipped, every published lesson completed. */
async function finishCourse(tx: Tx, userId: string) {
  const now = new Date();
  const finished = {
    status: "completed" as const, progress: 100, completedAt: now, goalStep: 0, goalEditing: false,
    learningGoal: "finish" as const, selfAssessedLevel: "basic" as const, weeklyGoalMinutes: 300, goalSetAt: now,
    diagnosticStatus: "skipped" as const, diagnosticCardDismissedAt: now, pathStatus: "ready" as const, pathSource: "default" as const,
  };
  const [existing] = await tx.select({ id: studentEnrollments.id }).from(studentEnrollments)
    .where(and(eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, courseId)));
  const enrollmentId = existing?.id
    ?? (await tx.insert(studentEnrollments).values({ userId, courseId, ...finished }).returning({ id: studentEnrollments.id }))[0]!.id;
  if (existing) await tx.update(studentEnrollments).set(finished).where(eq(studentEnrollments.id, enrollmentId));
  const lessons = await tx.select({ id: courseLessons.id }).from(courseLessons)
    .innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
    .where(and(eq(courseChapters.courseId, courseId), eq(courseChapters.isPublished, true), eq(courseLessons.isPublished, true)));
  for (const lesson of lessons) {
    await tx.insert(lessonProgress).values({
      enrollmentId, lessonId: lesson.id, status: "completed", studiedAt: now, firstStartedAt: now, lastAccessedAt: now, completedAt: now,
    }).onConflictDoUpdate({
      target: [lessonProgress.enrollmentId, lessonProgress.lessonId],
      set: { status: "completed", studiedAt: sql`coalesce(${lessonProgress.studiedAt}, ${now})`, completedAt: sql`coalesce(${lessonProgress.completedAt}, ${now})` },
    });
    await tx.insert(learningPathCompletions).values({ enrollmentId, lessonId: lesson.id }).onConflictDoNothing();
  }
  return { enrollmentId, lessons: lessons.length };
}

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x").hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !flags["allow-remote"])
    throw new Error("DATABASE_URL is not local. Re-run with --allow-remote only when seeding that database is intended.");
  const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId));
  if (!course) throw new Error(`course ${courseId} not found`);
  const hashed = await hashPassword(ENV.SEED_ACCOUNT_PASSWORD);
  for (const c of CASES) {
    const result = await db.transaction(async (tx) => {
      const userId = await ensureLearner(tx, c.email, c.name, hashed);
      const { enrollmentId, lessons } = await finishCourse(tx, userId);
      const issued = await issueCertificate(tx, enrollmentId);
      if (!issued) throw new Error(`${c.email}: certificate not issued`);
      if (c.revoke) {
        await tx.update(courseCertificates).set({ revokedAt: new Date(), revokedReason: c.revoke })
          .where(and(eq(courseCertificates.code, issued.code), isNull(courseCertificates.revokedAt)));
      }
      return { ...issued, lessons };
    });
    // The seed never mails by default; --email sends the real "you earned a certificate" email now.
    if (!flags.email) await db.update(courseCertificates).set({ emailSentAt: sql`coalesce(${courseCertificates.emailSentAt}, now())` })
      .where(eq(courseCertificates.code, result.code));
    else if (!c.revoke) console.log(`  email ${await sendCertificateEmail(result.code) ? "sent" : "already sent earlier"}`);
    console.log(`${c.email}: ${result.lessons} lessons completed · certificate ${result.code}${result.created ? " (new)" : " (kept)"}${c.revoke ? " · revoked" : ""} → /verify/${result.code}`);
  }
}

main().then(() => process.exit(0), (error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
