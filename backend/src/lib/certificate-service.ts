// Course completion certificates: issuing (inside the transaction that completes the course), the one-time email after
// that transaction commits, the public lookup behind /verify and the holder / admin actions.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { courseCertificates } from "@codi-1/db/schema/certificates";
import { courseChapters, courseLessons } from "@codi-1/db/schema/course-content";
import { courses } from "@codi-1/db/schema/courses";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { createMailer, type Mailer } from "@codi-1/auth";
import { ENV } from "@/env.server";
import { db } from "@/services";
import {
  assertCertificateAction, certificateView, CertificateError, newCertificateCode, type CertificateAction, type CertificateViewer,
} from "./certificate-contract";
import { createNotificationService } from "./notification-service";
import { appLink, button, escapeHtml, layout } from "./order-email-templates";

type Store = Pick<Database, "select" | "insert" | "update">;

export const certificateHref = (code: string) => `/verify/${code}`;

/** Published lessons of the course: the length printed on the certificate. */
async function courseLength(store: Store, courseId: string) {
  const [row] = await store
    .select({ count: sql<number>`count(*)::int`, seconds: sql<number>`coalesce(sum(${courseLessons.durationSeconds}), 0)::int` })
    .from(courseLessons)
    .innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
    .where(and(eq(courseChapters.courseId, courseId), eq(courseChapters.isPublished, true), eq(courseLessons.isPublished, true)));
  return { lessonCount: row?.count ?? 0, totalSeconds: row?.seconds ?? 0 };
}

/**
 * Issues the enrollment's certificate unless it has one (at most one per enrollment, also under concurrent calls).
 * Call inside the transaction that marks the course complete; the in-app notice is part of it, and the email is
 * scheduled to go out once the row is committed.
 */
export async function issueCertificate(store: Store, enrollmentId: number) {
  const [existing] = await store.select({ code: courseCertificates.code }).from(courseCertificates)
    .where(eq(courseCertificates.enrollmentId, enrollmentId)).limit(1);
  if (existing) return { code: existing.code, created: false };
  const [facts] = await store
    .select({ userId: studentEnrollments.userId, courseId: courses.id, courseTitle: courses.title, recipientName: user.name, instructorId: courses.instructorId })
    .from(studentEnrollments)
    .innerJoin(courses, eq(courses.id, studentEnrollments.courseId))
    .innerJoin(user, eq(user.id, studentEnrollments.userId))
    .where(eq(studentEnrollments.id, enrollmentId))
    .limit(1);
  if (!facts) return null;
  const [lecturer] = facts.instructorId
    ? await store.select({ name: user.name }).from(user).where(eq(user.id, facts.instructorId)).limit(1)
    : [];
  const length = await courseLength(store, facts.courseId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCertificateCode();
    const [row] = await store.insert(courseCertificates).values({
      code, enrollmentId, userId: facts.userId, courseId: facts.courseId,
      recipientName: facts.recipientName.trim() || "Học viên Codi", courseTitle: facts.courseTitle,
      lecturerName: lecturer?.name ?? null, ...length,
    }).onConflictDoNothing().returning({ code: courseCertificates.code });
    if (row) {
      await createNotificationService(store).notify(facts.userId, "🎓 Bạn đã nhận chứng chỉ hoàn thành khoá học",
        `Chúc mừng bạn đã hoàn thành "${facts.courseTitle}". Xem, tải và chia sẻ chứng chỉ của bạn.`, certificateHref(row.code));
      scheduleCertificateEmail(row.code);
      return { code: row.code, created: true };
    }
    // Nothing inserted: either another request issued it for this enrollment, or the random code collided.
    const [raced] = await store.select({ code: courseCertificates.code }).from(courseCertificates)
      .where(eq(courseCertificates.enrollmentId, enrollmentId)).limit(1);
    if (raced) return { code: raced.code, created: false };
  }
  throw new Error("Could not allocate a unique certificate code");
}

// ───────────────────────── email ─────────────────────────
let cachedMailer: Mailer | null | undefined;
const mailer = () => (cachedMailer === undefined
  ? (cachedMailer = createMailer({ RESEND_API_KEY: ENV.RESEND_API_KEY, EMAIL_FROM: ENV.EMAIL_FROM }))
  : cachedMailer);

export function certificateEmailHtml(input: { appUrl: string; recipientName: string; courseTitle: string; code: string }) {
  const link = appLink(input.appUrl, certificateHref(input.code));
  return layout("Chứng chỉ hoàn thành khoá học", `
              <h2 style="margin: 0 0 12px; font-size: 20px; color: #0f172a;">Chúc mừng ${escapeHtml(input.recipientName)}!</h2>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6;">Bạn đã hoàn thành khoá học <strong>${escapeHtml(input.courseTitle)}</strong> trên Codi và nhận chứng chỉ hoàn thành.</p>
              <p style="margin: 0 0 20px; font-size: 14px; color: #475569;">Mã chứng chỉ: <strong style="font-family: Consolas, monospace; color: #0f172a;">${escapeHtml(input.code)}</strong>. Bất kỳ ai cũng có thể xác minh chứng chỉ bằng mã này.</p>
              <p style="margin: 0 0 24px;">${button(link, "Xem và tải chứng chỉ")}</p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">Hoặc mở: ${escapeHtml(link)}</p>`);
}

/**
 * Sends the "you earned a certificate" email once, a moment after the issuing transaction commits. A rolled-back
 * issue leaves no row, so nothing is sent; the email_sent_at claim makes a second call a no-op.
 */
export function scheduleCertificateEmail(code: string, delayMs = 2000) {
  const timer = setTimeout(() => { sendCertificateEmail(code).catch((error) => {
    console.warn("[certificates] email not sent:", error instanceof Error ? error.message : error);
  }); }, delayMs);
  timer.unref?.();
}

export async function sendCertificateEmail(code: string, database: Store = db, send: Mailer | null = mailer()) {
  const [claimed] = await database.update(courseCertificates).set({ emailSentAt: new Date() })
    .where(and(eq(courseCertificates.code, code), isNull(courseCertificates.emailSentAt), isNull(courseCertificates.revokedAt)))
    .returning({ userId: courseCertificates.userId, recipientName: courseCertificates.recipientName, courseTitle: courseCertificates.courseTitle });
  if (!claimed?.userId) return false;
  const [owner] = await database.select({ email: user.email }).from(user).where(eq(user.id, claimed.userId)).limit(1);
  if (!owner?.email) return false;
  const html = certificateEmailHtml({ appUrl: ENV.BETTER_AUTH_URL, recipientName: claimed.recipientName, courseTitle: claimed.courseTitle, code });
  const subject = `🎓 Chứng chỉ hoàn thành "${claimed.courseTitle}"`;
  if (!send) {
    console.log(`[certificates] email (no RESEND_API_KEY) to ${owner.email}: ${subject} ${appLink(ENV.BETTER_AUTH_URL, certificateHref(code))}`);
    return true;
  }
  try {
    await send.send({ to: owner.email, subject, html });
    return true;
  } catch (error) {
    // Release the claim so a later attempt can send it.
    await database.update(courseCertificates).set({ emailSentAt: null }).where(eq(courseCertificates.code, code));
    throw error;
  }
}

// ───────────────────────── lookup and actions ─────────────────────────
async function findByCode(store: Store, code: string) {
  const [row] = await store
    .select({ cert: courseCertificates, courseSlug: courses.slug, courseStatus: courses.status })
    .from(courseCertificates)
    .leftJoin(courses, eq(courses.id, courseCertificates.courseId))
    .where(eq(courseCertificates.code, code))
    .limit(1);
  return row ?? null;
}

const toView = (row: NonNullable<Awaited<ReturnType<typeof findByCode>>>, viewer: CertificateViewer) =>
  certificateView(row.cert, viewer, row.courseStatus === "published" ? row.courseSlug : null);

export async function getCertificate(code: string, viewer: CertificateViewer) {
  const row = await findByCode(db, code);
  if (!row) throw new CertificateError("Không tìm thấy chứng chỉ với mã này.", 404);
  return toView(row, viewer);
}

export async function actOnCertificate(code: string, viewer: CertificateViewer & { userId: string }, act: CertificateAction) {
  return db.transaction(async (tx) => {
    const [cert] = await tx.select().from(courseCertificates).where(eq(courseCertificates.code, code)).for("update");
    if (!cert) throw new CertificateError("Không tìm thấy chứng chỉ với mã này.", 404);
    assertCertificateAction(cert, viewer, act.action);
    const notify = createNotificationService(tx);
    if (act.action === "rename") {
      await tx.update(courseCertificates).set({ recipientName: act.name.replace(/\s+/g, " "), nameEditedAt: new Date() })
        .where(eq(courseCertificates.id, cert.id));
    } else if (act.action === "revoke") {
      await tx.update(courseCertificates).set({ revokedAt: new Date(), revokedReason: act.reason, revokedBy: viewer.userId })
        .where(eq(courseCertificates.id, cert.id));
      if (cert.userId) await notify.notify(cert.userId, "Chứng chỉ của bạn đã bị thu hồi",
        `Chứng chỉ "${cert.courseTitle}" (${cert.code}) đã bị thu hồi. Lý do: ${act.reason}`, certificateHref(cert.code));
    } else {
      await tx.update(courseCertificates).set({ revokedAt: null, revokedReason: null, revokedBy: null })
        .where(eq(courseCertificates.id, cert.id));
      if (cert.userId) await notify.notify(cert.userId, "Chứng chỉ của bạn đã được khôi phục",
        `Chứng chỉ "${cert.courseTitle}" (${cert.code}) đã hợp lệ trở lại.`, certificateHref(cert.code));
    }
    const row = await findByCode(tx, code);
    return toView(row!, viewer);
  });
}

/** The learner's certificates, newest first; completed enrollments from before certificates existed are issued now. */
export async function listCertificates(userId: string) {
  const missing = await db.select({ id: studentEnrollments.id }).from(studentEnrollments)
    .leftJoin(courseCertificates, eq(courseCertificates.enrollmentId, studentEnrollments.id))
    .where(and(eq(studentEnrollments.userId, userId), eq(studentEnrollments.status, "completed"), isNull(courseCertificates.id)));
  for (const enrollment of missing) await db.transaction((tx) => issueCertificate(tx, enrollment.id));
  const rows = await db.select().from(courseCertificates).where(eq(courseCertificates.userId, userId))
    .orderBy(asc(courseCertificates.issuedAt));
  return rows.reverse().map((cert) => ({
    code: cert.code, courseId: cert.courseId, courseTitle: cert.courseTitle, issuedAt: cert.issuedAt.toISOString(),
    status: cert.revokedAt ? ("revoked" as const) : ("valid" as const),
  }));
}

/** Every certificate for the admin list, newest first (bounded; the page filters and searches it). */
export async function listAllCertificates(limit = 1000) {
  const rows = await db.select({ cert: courseCertificates, email: user.email }).from(courseCertificates)
    .leftJoin(user, eq(user.id, courseCertificates.userId))
    .orderBy(sql`${courseCertificates.issuedAt} desc`, sql`${courseCertificates.id} desc`).limit(limit);
  return rows.map(({ cert, email }) => ({
    code: cert.code, recipientName: cert.recipientName, email, courseTitle: cert.courseTitle,
    issuedAt: cert.issuedAt.toISOString(), status: cert.revokedAt ? ("revoked" as const) : ("valid" as const),
    revokedAt: cert.revokedAt ? cert.revokedAt.toISOString() : null, revokedReason: cert.revokedReason,
    nameEdited: !!cert.nameEditedAt, emailSent: !!cert.emailSentAt,
  }));
}

/** The certificate of one enrollment for the path view: null until the course is complete. */
export async function enrollmentCertificate(store: Store, enrollmentId: number) {
  const [cert] = await store.select({ code: courseCertificates.code, revokedAt: courseCertificates.revokedAt })
    .from(courseCertificates).where(eq(courseCertificates.enrollmentId, enrollmentId)).limit(1);
  return cert ? { code: cert.code, status: cert.revokedAt ? ("revoked" as const) : ("valid" as const) } : null;
}
