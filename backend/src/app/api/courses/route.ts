import { NextRequest, NextResponse } from "next/server";
import { and, asc, countDistinct, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/services";
import { courses, courseDetails, studentEnrollments, user } from "@codi-1/db";

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
    // Count distinct enrollment rows so each learner is counted once.
    const enrollmentCount = countDistinct(studentEnrollments.id);
    const statusFilter = includeHidden
      ? inArray(courses.status, ["published", "hidden"])
      : eq(courses.status, "published");

    // Public catalogue fields only: lifecycle, pricing audit and knowledge-map columns stay internal.
    // The last explicitly confirmed snapshot is public; live skills can contain
    // unconfirmed edits and must never be used here. All other fields stay internal.
    // Fail closed for missing/malformed legacy snapshots, including bad skill items.
    const map = courses.confirmedKnowledgeMap;
    const safeSkills = sql`case when jsonb_typeof(${map}->'skills') = 'array' then ${map}->'skills' else '[]'::jsonb end`;
    const safeEdges = sql`case when jsonb_typeof(${map}->'edges') = 'array' then ${map}->'edges' else '[]'::jsonb end`;
    const safeLinks = sql`case when jsonb_typeof(${map}->'links') = 'array' then ${map}->'links' else '[]'::jsonb end`;
    const topicsAgg = sql<string[]>`case when ${courses.status} = 'published'
      and jsonb_typeof(${map}) = 'object' and ${map}->'version' = '1'::jsonb
      and jsonb_typeof(${map}->'publicationId') = 'string' and length(${map}->>'publicationId') > 0
      and jsonb_typeof(${map}->'publishedAt') = 'string' and length(${map}->>'publishedAt') > 0
      and jsonb_typeof(${map}->'contentGeneration') = 'number' and ${map}->>'contentGeneration' ~ '^[0-9]+$'
      and jsonb_typeof(${map}->'skills') = 'array'
      and jsonb_typeof(${map}->'edges') = 'array' and jsonb_typeof(${map}->'links') = 'array'
      and not exists (select 1 from jsonb_array_elements(${safeSkills}) as item
        where jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'name') is distinct from 'string'
          or length(btrim(item->>'name')) < 1
          or jsonb_typeof(item->'id') is distinct from 'number' or item->>'id' !~ '^[1-9][0-9]*$'
          or jsonb_typeof(item->'bktPInit') is distinct from 'number'
          or jsonb_typeof(item->'bktPLearn') is distinct from 'number'
          or jsonb_typeof(item->'bktPGuess') is distinct from 'number'
          or jsonb_typeof(item->'bktPSlip') is distinct from 'number'
          or not case when jsonb_typeof(item->'bktPInit') = 'number' then (item->>'bktPInit')::numeric between 0 and 1 else false end
          or not case when jsonb_typeof(item->'bktPLearn') = 'number' then (item->>'bktPLearn')::numeric between 0 and 1 else false end
          or not case when jsonb_typeof(item->'bktPGuess') = 'number' then (item->>'bktPGuess')::numeric between 0 and 1 else false end
          or not case when jsonb_typeof(item->'bktPSlip') = 'number' then (item->>'bktPSlip')::numeric between 0 and 1 else false end
          or not case when jsonb_typeof(item->'bktPGuess') = 'number' and jsonb_typeof(item->'bktPSlip') = 'number'
            then (item->>'bktPGuess')::numeric + (item->>'bktPSlip')::numeric < 1 else false end)
      and not exists (select 1 from jsonb_array_elements(${safeSkills}) as s group by s->'id' having count(*) > 1)
      and not exists (select 1 from jsonb_array_elements(${safeEdges}) as edge
        where jsonb_typeof(edge) <> 'object'
          or jsonb_typeof(edge->'from') is distinct from 'number' or edge->>'from' !~ '^[1-9][0-9]*$'
          or jsonb_typeof(edge->'to') is distinct from 'number' or edge->>'to' !~ '^[1-9][0-9]*$'
          or edge->'from' = edge->'to'
          or not exists (select 1 from jsonb_array_elements(${safeSkills}) as s where s->'id' = edge->'from')
          or not exists (select 1 from jsonb_array_elements(${safeSkills}) as s where s->'id' = edge->'to'))
      and not exists (select 1 from jsonb_array_elements(${safeLinks}) as link
        where jsonb_typeof(link) <> 'object'
          or jsonb_typeof(link->'lessonId') is distinct from 'string' or length(btrim(link->>'lessonId')) < 1
          or jsonb_typeof(link->'skillId') is distinct from 'number' or link->>'skillId' !~ '^[1-9][0-9]*$'
          or not exists (select 1 from jsonb_array_elements(${safeSkills}) as s where s->'id' = link->'skillId'))
      then coalesce((select array_agg(distinct btrim(item->>'name') order by btrim(item->>'name'))
        from jsonb_array_elements(${safeSkills}) as item), array[]::text[])
      else array[]::text[] end`.as("topics");

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
