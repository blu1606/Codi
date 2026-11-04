import { and, desc, eq, inArray } from "drizzle-orm";
import { courses, user } from "@codi-1/db";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { createNotificationService } from "./notification-service";

export type AdminCourseItem = {
  id: string;
  slug: string;
  title: string;
  category: string;
  level: string;
  price: number;
  status: "published" | "hidden";
  hiddenReason: string | null;
  rating: number;
  reviewCount: number;
  learnersCount: number;
  instructorId: string | null;
  instructorName: string;
  instructorEmail: string;
};

export async function getAdminPublishedCourses(db: any): Promise<AdminCourseItem[]> {
  const rows = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      category: courses.category,
      level: courses.level,
      price: courses.price,
      status: courses.status,
      hiddenReason: courses.hiddenReason,
      rating: courses.rating,
      reviewCount: courses.reviewCount,
      instructorId: courses.instructorId,
      instructorName: user.name,
      instructorEmail: user.email,
    })
    .from(courses)
    .leftJoin(user, eq(courses.instructorId, user.id))
    .where(inArray(courses.status, ["published", "hidden"]))
    .orderBy(desc(courses.createdAt));

  // Count enrolled learners for each course
  const courseIds = rows.map((r: any) => r.id);
  const learnersCountMap: Record<string, number> = {};

  if (courseIds.length > 0) {
    const enrollments = await db
      .select({
        courseId: studentEnrollments.courseId,
      })
      .from(studentEnrollments)
      .where(inArray(studentEnrollments.courseId, courseIds));

    for (const e of enrollments) {
      learnersCountMap[e.courseId] = (learnersCountMap[e.courseId] || 0) + 1;
    }
  }

  return rows.map((r: any) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    level: r.level,
    price: r.price,
    status: r.status,
    hiddenReason: r.hiddenReason,
    rating: r.rating,
    reviewCount: r.reviewCount,
    learnersCount: learnersCountMap[r.id] || 0,
    instructorId: r.instructorId,
    instructorName: r.instructorName || "Giảng viên",
    instructorEmail: r.instructorEmail || "",
  }));
}

export async function adminHideCourse(
  db: any,
  courseId: string,
  reason: string,
  adminUserId: string
): Promise<{ success: boolean; title: string }> {
  if (!reason || !reason.trim()) {
    throw new Error("Lý do ẩn khoá học là bắt buộc.");
  }

  return await db.transaction(async (tx: any) => {
    const [course] = await tx
      .select({
        id: courses.id,
        title: courses.title,
        status: courses.status,
        instructorId: courses.instructorId,
      })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new Error("Không tìm thấy khoá học.");
    }

    if (course.status !== "published") {
      throw new Error("Chỉ có thể ẩn khoá học đang được xuất bản.");
    }

    const trimmedReason = reason.trim();

    await tx
      .update(courses)
      .set({
        status: "hidden",
        hiddenReason: trimmedReason,
      })
      .where(eq(courses.id, courseId));

    if (course.instructorId) {
      try {
        const notificationService = createNotificationService(tx);
        await notificationService.notify(
          course.instructorId,
          "Khoá học đã bị ẩn",
          `${course.title}: ${trimmedReason}`,
          `/dashboard/lecturer`
        );
      } catch {
        // Notification best-effort
      }
    }

    return { success: true, title: course.title };
  });
}

export async function adminUnhideCourse(
  db: any,
  courseId: string,
  adminUserId: string
): Promise<{ success: boolean; title: string }> {
  return await db.transaction(async (tx: any) => {
    const [course] = await tx
      .select({
        id: courses.id,
        title: courses.title,
        status: courses.status,
        instructorId: courses.instructorId,
      })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new Error("Không tìm thấy khoá học.");
    }

    if (course.status !== "hidden") {
      throw new Error("Chỉ có thể hiện lại khoá học đang bị ẩn.");
    }

    await tx
      .update(courses)
      .set({
        status: "published",
        hiddenReason: null,
      })
      .where(eq(courses.id, courseId));

    if (course.instructorId) {
      try {
        const notificationService = createNotificationService(tx);
        await notificationService.notify(
          course.instructorId,
          "Khoá học đã hiện lại",
          course.title,
          `/dashboard/lecturer`
        );
      } catch {
        // Notification best-effort
      }
    }

    return { success: true, title: course.title };
  });
}

export async function adminUpdateCoursePrice(
  db: any,
  courseId: string,
  newPrice: number,
  adminUserId: string
): Promise<{ success: boolean; title: string; oldPrice: number; newPrice: number }> {
  if (isNaN(newPrice) || newPrice < 0 || !Number.isInteger(newPrice)) {
    throw new Error("Giá phải là số nguyên không âm.");
  }

  return await db.transaction(async (tx: any) => {
    const [course] = await tx
      .select({
        id: courses.id,
        title: courses.title,
        price: courses.price,
        status: courses.status,
        instructorId: courses.instructorId,
      })
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new Error("Không tìm thấy khoá học.");
    }

    if (course.status !== "published" && course.status !== "hidden") {
      throw new Error(
        `Chỉ có thể đổi giá cho khoá học đã xuất bản hoặc tạm ẩn (trạng thái hiện tại: ${course.status}).`
      );
    }

    if (course.price === newPrice) {
      throw new Error("Giá mới đang trùng giá hiện tại.");
    }

    const oldPrice = course.price;

    await tx
      .update(courses)
      .set({
        price: newPrice,
        priceUpdatedBy: adminUserId,
        priceUpdatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));

    if (course.instructorId) {
      try {
        const notificationService = createNotificationService(tx);
        const formatVnd = (n: number) => (n === 0 ? "Miễn phí" : `${n.toLocaleString("vi-VN")} ₫`);
        await notificationService.notify(
          course.instructorId,
          "Giá khoá học đã thay đổi",
          `${course.title}: ${formatVnd(oldPrice)} → ${formatVnd(newPrice)}`,
          `/dashboard/lecturer`
        );
      } catch {
        // Notification best-effort
      }
    }

    return { success: true, title: course.title, oldPrice, newPrice };
  });
}
