import type { AdminCourseItem } from "@/lib/admin-courses-service";
import snapshot from "../snapshot/admin-courses.json";

/** Seeded published and hidden courses for S33, written by `pnpm demo:snapshot`. */
export const adminCourses = snapshot as unknown as AdminCourseItem[];

export const adminCoursesEmpty: AdminCourseItem[] = [];
