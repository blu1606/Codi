import type { courses } from "@codi-1/db";

export type CatalogCourse = Omit<typeof courses.$inferSelect, "createdAt"> & {
  createdAt: string;
  enrollmentCount: number;
  coverImageUrl?: string | null;
};

export async function fetchCourses(signal: AbortSignal, query = ""): Promise<CatalogCourse[]> {
  const response = await fetch(`/api/courses${query}`, { signal });
  if (!response.ok) throw new Error("Không thể tải khóa học. Vui lòng thử lại.");
  const body = await response.json();
  if (!Array.isArray(body.courses)) throw new Error("Dữ liệu khóa học không hợp lệ.");
  return body.courses;
}
