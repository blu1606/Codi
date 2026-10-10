import { NextResponse } from "next/server";
import { db } from "@/services";
import { studentTransactions } from "@codi-1/db/schema/student-profile";
import { auth } from "@/services";
import { headers } from "next/headers";

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseId } = await req.json();

    if (!courseId) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }

    const { courses } = await import("@codi-1/db/schema/courses");
    const { eq } = await import("drizzle-orm");
    const [course] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const amount = course.price;

    // Generate a simple ID like CODI12345
    const transactionId = `CODI${Math.floor(10000 + Math.random() * 90000)}`;

    await db.insert(studentTransactions).values({
      id: transactionId,
      userId: session.user.id,
      courseId,
      amount,
      status: "pending",
    });

    return NextResponse.json({ transactionId });
  } catch (error) {
    console.error("Create transaction error:", error);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}
