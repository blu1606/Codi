import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { courses, orders, orderItems } from "@codi-1/db";
import { studentTransactions } from "@codi-1/db/schema/student-profile";
import { db } from "@/services";

export default async function CheckoutRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderParam } = await searchParams;
  if (!orderParam || typeof orderParam !== "string") {
    redirect("/courses");
  }

  const trimmed = orderParam.trim();
  const orderIdNum = Number(trimmed);

  // 1. If numeric orderId, query orders by id
  if (!Number.isNaN(orderIdNum) && orderIdNum > 0) {
    const [rowById] = await db
      .select({ slug: courses.slug, code: orders.code })
      .from(orders)
      .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
      .innerJoin(courses, eq(courses.id, orderItems.courseId))
      .where(eq(orders.id, orderIdNum))
      .limit(1);

    if (rowById?.slug) {
      redirect(`/courses/${rowById.slug}/checkout?order=${encodeURIComponent(rowById.code)}`);
    }
  }

  // 2. Query orders by order code (e.g. CODI12345)
  const [rowByCode] = await db
    .select({ slug: courses.slug, code: orders.code })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(courses, eq(courses.id, orderItems.courseId))
    .where(eq(orders.code, trimmed))
    .limit(1);

  if (rowByCode?.slug) {
    redirect(`/courses/${rowByCode.slug}/checkout?order=${encodeURIComponent(rowByCode.code)}`);
  }

  // 3. Fallback to legacy studentTransactions
  const [txRow] = await db
    .select({ slug: courses.slug, id: studentTransactions.id })
    .from(studentTransactions)
    .innerJoin(courses, eq(courses.id, studentTransactions.courseId))
    .where(eq(studentTransactions.id, trimmed))
    .limit(1);

  if (txRow?.slug) {
    redirect(`/courses/${txRow.slug}/checkout?order=${encodeURIComponent(txRow.id)}`);
  }

  // Fallback to courses catalog if order not found
  redirect("/courses");
}
