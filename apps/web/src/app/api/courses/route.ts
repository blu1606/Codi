import { NextRequest, NextResponse } from "next/server";
import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/services";
import { courses, courseDetails, studentEnrollments } from "@codi-1/db";

export async function GET(request: NextRequest) {
  const sort = request.nextUrl.searchParams.get("sort") ?? "title";
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);

  if (sort !== "title" && sort !== "popular") {
    return NextResponse.json({ error: "Invalid sort" }, { status: 400 });
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    return NextResponse.json({ error: "Limit must be between 1 and 100" }, { status: 400 });
  }

  try {
    // Count enrollment rows, not activity events, so each learner is counted once.
    const enrollmentCount = count(studentEnrollments.id);
    // Public catalogue fields only: lifecycle, pricing audit and knowledge-map columns stay internal.
    const query = db
      .select({
        id: courses.id, slug: courses.slug, title: courses.title, category: courses.category,
        level: courses.level, duration: courses.duration, description: courses.description,
        price: courses.price, instructorId: courses.instructorId, rating: courses.rating,
        reviewCount: courses.reviewCount, createdAt: courses.createdAt,
        enrollmentCount, coverImageUrl: courseDetails.coverImageUrl,
      })
      .from(courses)
      .leftJoin(studentEnrollments, eq(studentEnrollments.courseId, courses.id))
      .leftJoin(courseDetails, eq(courseDetails.courseId, courses.id))
      .where(eq(courses.status, "published"))
      .groupBy(courses.id, courseDetails.coverImageUrl)
      .orderBy(...(sort === "popular"
        ? [desc(enrollmentCount), asc(courses.title), asc(courses.id)]
        : [asc(courses.title), asc(courses.id)]));

    const data = await (limit === undefined ? query : query.limit(limit));
    return NextResponse.json({ courses: data });
  } catch (error) {
    console.error("Failed to load courses", error);
    return NextResponse.json({ error: "Không thể tải khóa học." }, { status: 500 });
  }
}
