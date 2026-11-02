import { and, desc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { requireRole, ROLE, type RoleId } from "@codi-1/auth";
import { coursePublicationRequests, courses, notifications, publicationReviewFlags } from "@codi-1/db";
import { session as authSessions } from "@codi-1/db/schema/auth";
import { auth, db } from "@/services";

export type PublicationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Notice = typeof notifications.$inferInsert;
async function readIdentity() {
  const identity = await auth.api.getSession({ headers: await headers() });
  if (!identity?.user || !identity.session?.id) throw new Error("Unauthorized");
  return identity;
}
type PublicationIdentity = Awaited<ReturnType<typeof readIdentity>>;
export interface PublicationContext {
  tx: PublicationTransaction;
  course: typeof courses.$inferSelect;
  request: typeof coursePublicationRequests.$inferSelect | undefined;
  actorId: string;
  notify: (notice: Notice) => void;
}

/** Course first, then latest request. Never acquire graph/enrollment locks later. */
export async function publicationCourseTransaction<T>(
  courseId: string,
  role: RoleId,
  work: (context: PublicationContext) => Promise<T>,
  authenticated?: PublicationIdentity,
): Promise<T> {
  const identity = authenticated ?? await readIdentity();
  const notices: Notice[] = [];
  const result = await db.transaction(async (tx) => {
    const [course] = await tx.select().from(courses).where(eq(courses.id, courseId)).for("update");
    if (!course) throw new Error("Không tìm thấy khoá học.");
    // Recheck on this connection after waiting: no pooled auth request under a lock.
    const [live] = await tx.select({ id: authSessions.id }).from(authSessions)
      .where(and(eq(authSessions.id, identity.session.id), eq(authSessions.userId, identity.user.id),
        gt(authSessions.expiresAt, new Date())));
    if (!live) throw new Error("Unauthorized");
    await requireRole(tx as unknown as typeof db, identity.user.id, role);
    if (role === ROLE.LECTURER && course.instructorId !== identity.user.id)
      throw new Error("Không có quyền truy cập khoá học này.");
    const [request] = await tx.select().from(coursePublicationRequests)
      .where(eq(coursePublicationRequests.courseId, courseId))
      .orderBy(desc(coursePublicationRequests.round)).limit(1).for("update");
    return work({ tx, course, request, actorId: identity.user.id, notify: notice => { notices.push(notice); } });
  });
  // Only a committed transition can notify. Delivery failure must not invite a retry
  // of a transition that already committed.
  if (notices.length) {
    try { await db.insert(notifications).values(notices); }
    catch { console.error("Publication committed; notification delivery failed."); }
  }
  return result;
}

export function requireActivePublication(context: PublicationContext, requestId: number) {
  const { course, request } = context;
  if (!request || request.id !== requestId || request.courseId !== course.id)
    throw new Error("Yêu cầu duyệt không khớp với vòng mới nhất của khoá học.");
  if (request.status !== "in_review") throw new Error("Yêu cầu duyệt đã được kết luận trước đó.");
  if (course.status !== "pending") throw new Error("Khoá học không ở trạng thái chờ duyệt (pending).");
  return request;
}

export async function publicationRequestTransaction<T>(
  requestId: number, work: (context: PublicationContext) => Promise<T>,
  authenticated?: PublicationIdentity,
): Promise<T> {
  const identity = authenticated ?? await readIdentity();
  const [locator] = await db.select({ courseId: coursePublicationRequests.courseId })
    .from(coursePublicationRequests).where(eq(coursePublicationRequests.id, requestId));
  if (!locator) throw new Error("Không tìm thấy yêu cầu duyệt.");
  return publicationCourseTransaction(locator.courseId, ROLE.ADMIN, async context => {
    requireActivePublication(context, requestId);
    return work(context);
  }, identity);
}

export async function publicationFlagTransaction<T>(
  flagId: number, work: (context: PublicationContext, flag: typeof publicationReviewFlags.$inferSelect) => Promise<T>,
): Promise<T> {
  const identity = await readIdentity();
  const [locator] = await db.select({ requestId: publicationReviewFlags.requestId })
    .from(publicationReviewFlags).where(eq(publicationReviewFlags.id, flagId));
  if (!locator) throw new Error("Không tìm thấy góp ý.");
  return publicationRequestTransaction(locator.requestId, async context => {
    const [flag] = await context.tx.select().from(publicationReviewFlags)
      .where(and(eq(publicationReviewFlags.id, flagId), eq(publicationReviewFlags.requestId, locator.requestId)));
    if (!flag) throw new Error("Không tìm thấy góp ý trong vòng duyệt.");
    return work(context, flag);
  }, identity);
}

export function requirePublicationClaim(rows: readonly unknown[]) {
  if (rows.length !== 1) throw new Error("Trạng thái đã thay đổi. Vui lòng tải lại vòng duyệt.");
}
