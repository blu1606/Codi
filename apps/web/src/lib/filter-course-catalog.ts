export interface CourseCatalogEntry {
  title: string;
  description: string;
  category: string;
  level: string;
  topics?: readonly string[];
  price?: number;
  enrollmentCount?: number;
  rating?: number;
  createdAt?: string | Date;
}

export type CatalogPriceFilter = "all" | "free" | "paid";
export type CatalogSortOption = "popular" | "newest" | "price-asc" | "price-desc" | "rating";

export interface ExtendedFilterOptions {
  price?: CatalogPriceFilter;
  sort?: CatalogSortOption;
}

/**
 * Lọc và sắp xếp danh mục khóa học theo từ khóa tìm kiếm, danh mục, cấp độ, giá và tiêu chí sắp xếp.
 * Hàm thuần (pure function), không làm thay đổi mảng dữ liệu đầu vào.
 */
export function filterCourseCatalog<T extends CourseCatalogEntry>(
  courses: readonly T[],
  searchTerm: string,
  selectedCategory: string,
  selectedLevel: string,
  options?: ExtendedFilterOptions
): T[] {
  const query = searchTerm.trim().toLowerCase();
  const priceFilter = options?.price ?? "all";
  const sortOption = options?.sort;

  const filtered = courses.filter((course) => {
    const matchesSearch =
      query === "" ||
      course.title.toLowerCase().includes(query) ||
      course.description.toLowerCase().includes(query) ||
      course.topics?.some((t) => t.toLowerCase().includes(query));

    const matchesCategory =
      selectedCategory === "Tất cả" ||
      selectedCategory === "all" ||
      course.category === selectedCategory;

    const matchesLevel =
      selectedLevel === "Tất cả" ||
      selectedLevel === "Tất cả cấp độ" ||
      selectedLevel === "all" ||
      course.level === selectedLevel ||
      ((selectedLevel === "Beginner" || selectedLevel === "Cơ bản") &&
        (course.level === "Beginner" || course.level === "Cơ bản")) ||
      ((selectedLevel === "Intermediate" || selectedLevel === "Trung cấp") &&
        (course.level === "Intermediate" || course.level === "Trung cấp")) ||
      ((selectedLevel === "Advanced" || selectedLevel === "Nâng cao") &&
        (course.level === "Advanced" || course.level === "Nâng cao"));

    const price = course.price ?? 0;
    const matchesPrice =
      priceFilter === "all" ||
      (priceFilter === "free" && price === 0) ||
      (priceFilter === "paid" && price > 0);

    return matchesSearch && matchesCategory && matchesLevel && matchesPrice;
  });

  if (!sortOption) {
    return filtered;
  }

  const result = [...filtered];
  switch (sortOption) {
    case "popular":
      return result.sort((a, b) => (b.enrollmentCount ?? 0) - (a.enrollmentCount ?? 0));
    case "newest":
      return result.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    case "price-asc":
      return result.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    case "price-desc":
      return result.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    case "rating":
      return result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    default:
      return result;
  }
}

export interface TypeaheadResult<T> {
  matches: T[];
  grouped: Record<string, T[]>;
  isEmpty: boolean;
}

/**
 * Gợi ý tìm kiếm (typeahead) gom nhóm theo danh mục.
 */
export function getTypeaheadSuggestions<T extends CourseCatalogEntry>(
  courses: readonly T[],
  query: string
): TypeaheadResult<T> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return { matches: [], grouped: {}, isEmpty: false };
  }

  const matches = courses.filter((course) => {
    return (
      course.title.toLowerCase().includes(trimmed) ||
      course.description.toLowerCase().includes(trimmed) ||
      course.category.toLowerCase().includes(trimmed) ||
      course.topics?.some((t) => t.toLowerCase().includes(trimmed))
    );
  });

  const grouped: Record<string, T[]> = {};
  for (const match of matches) {
    if (!grouped[match.category]) {
      grouped[match.category] = [];
    }
    grouped[match.category].push(match);
  }

  return {
    matches,
    grouped,
    isEmpty: matches.length === 0,
  };
}
