import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { courses, orders, orderItems } from "@codi-1/db";
import { db } from "@/services";

export default async function CheckoutRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order: orderCode } = await searchParams;
  if (!orderCode || typeof orderCode !== "string") {
    redirect("/courses");
  }

  const trimmedCode = orderCode.trim();

  // Find course slug from order
  const [row] = await db
    .select({ slug: courses.slug })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(courses, eq(courses.id, orderItems.courseId))
    .where(eq(orders.code, trimmedCode))
    .limit(1);

  if (row?.slug) {
    redirect(`/courses/${row.slug}/checkout?order=${encodeURIComponent(trimmedCode)}`);
  }

  // Fallback to legacy studentTransactions
  const { studentTransactions } = await import("@codi-1/db/schema/student-profile");
  const [txRow] = await db
    .select({ slug: courses.slug })
    .from(studentTransactions)
    .innerJoin(courses, eq(courses.id, studentTransactions.courseId))
    .where(eq(studentTransactions.id, trimmedCode))
    .limit(1);

  if (txRow?.slug) {
    redirect(`/courses/${txRow.slug}/checkout?order=${encodeURIComponent(trimmedCode)}`);
  }

  // Fallback to courses catalog if order not found
  redirect("/courses");
}
