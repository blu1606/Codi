import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth, db } from "@/services";
import { courses, studentActivities, studentCart, studentEnrollments, studentTransactions, studentWishlist } from "@codi-1/db";

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requestedYear = Number(request.nextUrl.searchParams.get("year"));
  const year = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : new Date().getFullYear();
  try {
  if (request.nextUrl.searchParams.get("scope") === "activities") {
    const allActivities = await db.select().from(studentActivities).where(eq(studentActivities.userId, user.id)).orderBy(desc(studentActivities.occurredAt));
    const activities = allActivities.filter((activity) => {
      const occurredAt = new Date(activity.occurredAt);
      return !Number.isNaN(occurredAt.getTime()) && occurredAt.getFullYear() === year;
    });
    return NextResponse.json({ activities });
  }
  const [allActivities, enrollments, wishlist, cart, transactions] = await Promise.all([
    db.select().from(studentActivities).where(eq(studentActivities.userId, user.id)).orderBy(desc(studentActivities.occurredAt)),
    db.select({ enrollment: studentEnrollments, course: courses }).from(studentEnrollments).innerJoin(courses, eq(studentEnrollments.courseId, courses.id)).where(eq(studentEnrollments.userId, user.id)),
    db.select().from(studentWishlist).where(eq(studentWishlist.userId, user.id)),
    db.select().from(studentCart).where(eq(studentCart.userId, user.id)),
    db.select().from(studentTransactions).where(eq(studentTransactions.userId, user.id)).orderBy(desc(studentTransactions.createdAt)),
  ]);
  const activities = allActivities.filter((activity) => {
    const occurredAt = new Date(activity.occurredAt);
    return !Number.isNaN(occurredAt.getTime()) && occurredAt.getFullYear() === year;
  });
  return NextResponse.json({ activities, enrollments, wishlist, cart, transactions });
  } catch (error) {
    console.error("Failed to load student profile", error);
    return NextResponse.json({ error: "Failed to load student profile" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body phải là JSON hợp lệ" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body không hợp lệ" }, { status: 400 });
  }
  const payload = body as { type?: unknown; courseId?: unknown; metadata?: unknown };
  const validTypes = ["login", "course_view", "lesson_complete", "quiz_complete", "course_enrolled"] as const;
  if (typeof payload.type !== "string" || !validTypes.includes(payload.type as typeof validTypes[number])) {
    return NextResponse.json({ error: "Invalid activity type" }, { status: 400 });
  }
  if (payload.courseId !== undefined && payload.courseId !== null && typeof payload.courseId !== "string") {
    return NextResponse.json({ error: "courseId phải là chuỗi" }, { status: 400 });
  }
  const [activity] = await db.insert(studentActivities).values({ userId: user.id, type: payload.type as typeof validTypes[number], courseId: (payload.courseId as string | null | undefined) ?? null, metadata: payload.metadata === undefined ? null : JSON.stringify(payload.metadata) }).returning();
  return NextResponse.json({ activity }, { status: 201 });
}
