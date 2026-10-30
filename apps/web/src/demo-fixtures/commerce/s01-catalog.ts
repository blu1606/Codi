import type { CatalogCourse } from "@/lib/course-catalog";
import catalogSnapshot from "../snapshot/catalog.json";

/**
 * Published catalogue for S01 (results state): the seed courses as GET /api/courses returns them
 * (snapshot from `pnpm demo:snapshot`). The route's public shape has no publishedAt, so the
 * newest-first sort below falls back to 0 for every row.
 */
export const catalogCourses = catalogSnapshot as unknown as CatalogCourse[];

/** Filter/sort results with zero matches (S01 no-results state). */
export const emptyCatalogCourses: CatalogCourse[] = [];

/** Catalog courses for the "sorted by newest" state, newest first. */
export const catalogSortedNewest: CatalogCourse[] = [...catalogCourses].sort(
  (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
);

/** Body of GET /api/courses. */
export function catalogResponse(courses: CatalogCourse[] = catalogCourses) {
  return { courses };
}
