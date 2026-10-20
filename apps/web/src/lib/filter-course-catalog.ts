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
export type CatalogSortOption =
  | "popular"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "enrollment"
  | "relevant";

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
      course.category === selectedCategory ||
      ((selectedCategory === "Dữ liệu" || selectedCategory === "Data & AI") &&
        (course.category === "Dữ liệu" || course.category === "Data & AI")) ||
      ((selectedCategory === "Công cụ" || selectedCategory === "Computer Science" || selectedCategory === "Tools") &&
        (course.category === "Công cụ" || course.category === "Computer Science" || course.category === "Tools"));

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
    case "relevant":
      // Phù hợp nhất (default): sắp xếp theo độ phù hợp từ khóa nếu có query, fallback theo rating & enrollment
      if (query) {
        return result.sort((a, b) => {
          const aTitle = a.title.toLowerCase().includes(query) ? 2 : 0;
          const bTitle = b.title.toLowerCase().includes(query) ? 2 : 0;
          if (aTitle !== bTitle) return bTitle - aTitle;
          return (b.enrollmentCount ?? 0) - (a.enrollmentCount ?? 0);
        });
      }
      return result.sort((a, b) => (b.enrollmentCount ?? 0) - (a.enrollmentCount ?? 0));
    case "enrollment":
      // Học nhiều nhất: theo enrollmentCount giảm dần
      return result.sort((a, b) => (b.enrollmentCount ?? 0) - (a.enrollmentCount ?? 0));
    case "newest":
      // Mới nhất: theo createdAt giảm dần
      return result.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
    case "rating":
      // Đánh giá cao nhất: theo rating giảm dần
      return result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case "price-asc":
      return result.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    case "price-desc":
      return result.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    default:
      return result;
  }
}

export type TypeaheadBadgeType = "Khóa học" | "Chủ đề";

export interface TypeaheadTopResultItem<T> {
  id: string;
  title: string;
  type: TypeaheadBadgeType;
  badgeLabel: string;
  course?: T;
  topic?: string;
  category?: string;
}

export interface TypeaheadResult<T> {
  matches: T[];
  grouped: Record<string, T[]>;
  querySuggestions: string[];
  topResults: TypeaheadTopResultItem<T>[];
  isEmpty: boolean;
}

/**
 * Gợi ý tìm kiếm (typeahead) theo Flow L1:
 * - query suggestions
 * - "Kết quả hàng đầu" với badge loại (Khóa học, Chủ đề)
 * - gom nhóm theo danh mục và "Xem tất cả kết quả"
 */
export function getTypeaheadSuggestions<T extends CourseCatalogEntry>(
  courses: readonly T[],
  query: string
): TypeaheadResult<T> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return {
      matches: [],
      grouped: {},
      querySuggestions: [],
      topResults: [],
      isEmpty: false,
    };
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

  // 1. Query suggestions: các từ khóa/cụm từ gợi ý xuất phát từ tiêu đề khóa học hoặc chủ đề khớp
  const suggestionSet = new Set<string>();
  for (const course of courses) {
    if (course.title.toLowerCase().includes(trimmed)) {
      suggestionSet.add(course.title);
    }
    if (course.topics) {
      for (const t of course.topics) {
        if (t.toLowerCase().includes(trimmed)) {
          suggestionSet.add(t);
        }
      }
    }
  }
  const querySuggestions = Array.from(suggestionSet).slice(0, 5);

  // 2. Kết quả hàng đầu: Khóa học và Chủ đề khớp
  const topResults: TypeaheadTopResultItem<T>[] = [];
  // Thêm các khóa học khớp trước (tối đa 4 khóa học)
  const courseMatches = courses.filter(
    (c) =>
      c.title.toLowerCase().includes(trimmed) ||
      c.description.toLowerCase().includes(trimmed)
  );
  for (const c of courseMatches.slice(0, 4)) {
    const courseAny = c as any;
    topResults.push({
      id: `course-${courseAny.id ?? courseAny.slug ?? c.title}`,
      title: c.title,
      type: "Khóa học",
      badgeLabel: "Khóa học",
      course: c,
      category: c.category,
    });
  }

  // Thêm các chủ đề khớp (tối đa 3 chủ đề)
  const matchedTopics = new Set<string>();
  for (const c of courses) {
    if (c.topics) {
      for (const t of c.topics) {
        if (t.toLowerCase().includes(trimmed) && !matchedTopics.has(t.toLowerCase())) {
          matchedTopics.add(t.toLowerCase());
          topResults.push({
            id: `topic-${t}`,
            title: t,
            type: "Chủ đề",
            badgeLabel: "Chủ đề",
            topic: t,
            category: c.category,
          });
        }
      }
    }
  }

  const isEmpty = matches.length === 0 && topResults.length === 0 && querySuggestions.length === 0;

  return {
    matches,
    grouped,
    querySuggestions,
    topResults,
    isEmpty,
  };
}

