import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth, db } from "@/services";
import { studentActivities, studentCart, studentEnrollments, studentTransactions, studentWishlist } from "@codi-1/db";

async function currentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [activities, enrollments, wishlist, cart, transactions] = await Promise.all([
    db.select().from(studentActivities).where(eq(studentActivities.userId, user.id)).orderBy(desc(studentActivities.occurredAt)).limit(365),
    db.select().from(studentEnrollments).where(eq(studentEnrollments.userId, user.id)),
    db.select().from(studentWishlist).where(eq(studentWishlist.userId, user.id)),
    db.select().from(studentCart).where(eq(studentCart.userId, user.id)),
    db.select().from(studentTransactions).where(eq(studentTransactions.userId, user.id)).orderBy(desc(studentTransactions.createdAt)),
  ]);
  return NextResponse.json({ activities, enrollments, wishlist, cart, transactions });
}

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  if (!["login", "course_view", "lesson_complete", "quiz_complete", "course_enrolled"].includes(body.type)) {
    return NextResponse.json({ error: "Invalid activity type" }, { status: 400 });
  }
  const [activity] = await db.insert(studentActivities).values({ userId: user.id, type: body.type, courseId: body.courseId ?? null, metadata: body.metadata ? JSON.stringify(body.metadata) : null }).returning();
  return NextResponse.json({ activity }, { status: 201 });
}
