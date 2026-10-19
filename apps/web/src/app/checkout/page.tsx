import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { courses, orders, orderItems } from "@codi-1/db";
import { auth, db } from "@/services";

export default async function CheckoutRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const { order: orderCode } = await searchParams;
  if (!orderCode || typeof orderCode !== "string") {
    redirect("/courses");
  }

  const trimmedCode = orderCode.trim();

  if (!session?.user) {
    redirect(`/login?next=${encodeURIComponent(`/checkout?order=${trimmedCode}`)}`);
  }

  // Find course slug from order scoped to the current user
  const [row] = await db
    .select({ slug: courses.slug })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .innerJoin(courses, eq(courses.id, orderItems.courseId))
    .where(and(eq(orders.code, trimmedCode), eq(orders.userId, session.user.id)))
    .limit(1);

  if (row?.slug) {
    redirect(`/courses/${row.slug}/checkout?order=${encodeURIComponent(trimmedCode)}`);
  }

  // Fallback to legacy studentTransactions scoped to the current user
  const { studentTransactions } = await import("@codi-1/db/schema/student-profile");
  const [txRow] = await db
    .select({ slug: courses.slug })
    .from(studentTransactions)
    .innerJoin(courses, eq(courses.id, studentTransactions.courseId))
    .where(and(eq(studentTransactions.id, trimmedCode), eq(studentTransactions.userId, session.user.id)))
    .limit(1);

  if (txRow?.slug) {
    redirect(`/courses/${txRow.slug}/checkout?order=${encodeURIComponent(trimmedCode)}`);
  }

  // Fallback to courses catalog if order not found
  redirect("/courses");
}
