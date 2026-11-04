import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { auth, db } from "@/services";

/**
 * Profile page data the stock /api/student/profile does not carry: the activity heatmap derived from real learning
 * records (sign-ins and other logged activities, enrolments, completed lessons, submitted assessments, study days)
 * and the signed-in user's orders. Day keys use the Vietnam calendar.
 *
 * GET ?year=YYYY → { year, days: [{ day: "YYYY-MM-DD", count }], orders: [{ id, code, status, totalAmount, createdAt, items: [{ courseId, title }] }] }
 */
type DayRow = { day: string; count: number };
type OrderRow = { id: number; code: string; status: string; totalAmount: number; createdAt: string; items: { courseId: string; title: string }[] | null };

const TZ = "Asia/Ho_Chi_Minh";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  const userId = session.user.id;
  const requested = Number(request.nextUrl.searchParams.get("year"));
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : new Date().getFullYear();

  try {
    const days = await db.execute(sql`
      with events as (
        select occurred_at as at from student_activities where user_id = ${userId}
        union all
        select enrolled_at from student_enrollments where user_id = ${userId}
        union all
        select lp.completed_at from lesson_progress lp
          join student_enrollments e on e.id = lp.enrollment_id
          where e.user_id = ${userId} and lp.completed_at is not null
        union all
        select s.submitted_at from assessment_submissions s
          join student_enrollments e on e.id = s.enrollment_id
          where e.user_id = ${userId} and s.submitted_at is not null
      ), keyed as (
        select to_char(at at time zone ${TZ}, 'YYYY-MM-DD') as day from events where at is not null
        union all
        select to_char(date, 'YYYY-MM-DD') from student_study_days where user_id = ${userId} and seconds > 0
      )
      select day, count(*)::int as count from keyed where day like ${`${year}-%`} group by day order by day`);

    const orders = await db.execute(sql`
      select o.id::int as "id", o.code, o.status::text as status, o.total_amount as "totalAmount", o.created_at as "createdAt",
        (select json_agg(json_build_object('courseId', i.course_id, 'title', i.course_title) order by i.id)
           from order_items i where i.order_id = o.id) as items
      from orders o where o.user_id = ${userId}
      order by o.created_at desc, o.id desc limit 100`);

    return NextResponse.json({
      year,
      days: (days.rows as DayRow[]).map((r) => ({ day: r.day, count: Number(r.count) })),
      orders: (orders.rows as OrderRow[]).map((o) => ({
        ...o,
        createdAt: new Date(o.createdAt).toISOString(),
        items: o.items ?? [],
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Failed to load profile summary", error);
    return NextResponse.json({ error: "Không thể tải dữ liệu hồ sơ." }, { status: 500 });
  }
}
