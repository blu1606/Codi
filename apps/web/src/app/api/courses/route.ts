import { NextRequest, NextResponse } from "next/server";
import { and, asc, countDistinct, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/services";
import { courses, courseDetails, skills, studentEnrollments, user } from "@codi-1/db";

export async function GET(request: NextRequest) {
  const sort = request.nextUrl.searchParams.get("sort") ?? "title";
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  const includeHidden = request.nextUrl.searchParams.get("include_hidden") === "true";

  if (sort !== "title" && sort !== "popular") {
    return NextResponse.json({ error: "Invalid sort" }, { status: 400 });
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    return NextResponse.json({ error: "Limit must be between 1 and 100" }, { status: 400 });
  }

  try {
    // Count distinct enrollment rows so each learner is counted once, even when joined with multiple skills.
    const enrollmentCount = countDistinct(studentEnrollments.id);
    const statusFilter = includeHidden
      ? inArray(courses.status, ["published", "hidden"])
      : eq(courses.status, "published");

    // Public catalogue fields only: lifecycle, pricing audit and knowledge-map columns stay internal.
    // Suppress topic names until the published course's current map is confirmed.
    // Keep this gate inside the aggregate so other courses and their counts remain visible.
    const topicEligibility = and(
      eq(courses.status, "published"),
      eq(courses.knowledgeMapStatus, "confirmed"),
      inArray(skills.review, ["accepted", "edited"]),
    );
    const topicsAgg = sql<string[]>`COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT CASE WHEN ${topicEligibility} THEN ${skills.name} END), NULL), ARRAY[]::text[])`.as("topics");

    const query = db
      .select({
        id: courses.id, slug: courses.slug, title: courses.title, category: courses.category,
        level: courses.level, duration: courses.duration, description: courses.description,
        price: courses.price, instructorId: courses.instructorId, rating: courses.rating,
        reviewCount: courses.reviewCount, createdAt: courses.createdAt,
        status: courses.status,
        enrollmentCount, coverImageUrl: courseDetails.coverImageUrl,
        instructorName: user.name,
        topics: topicsAgg,
      })
      .from(courses)
      .leftJoin(studentEnrollments, eq(studentEnrollments.courseId, courses.id))
      .leftJoin(courseDetails, eq(courseDetails.courseId, courses.id))
      .leftJoin(user, eq(courses.instructorId, user.id))
      .leftJoin(skills, eq(skills.courseId, courses.id))
      .where(statusFilter)
      .groupBy(courses.id, courseDetails.coverImageUrl, user.name)
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
