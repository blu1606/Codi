export interface CourseCatalogEntry {
  title: string;
  description: string;
  category: string;
  level: string;
  topics?: readonly string[];
}

/**
 * Lọc danh mục khóa học theo từ khóa tìm kiếm, danh mục và cấp độ.
 * Hàm thuần (pure function), không làm thay đổi mảng dữ liệu đầu vào.
 */
export function filterCourseCatalog<T extends CourseCatalogEntry>(
  courses: readonly T[],
  searchTerm: string,
  selectedCategory: string,
  selectedLevel: string
): T[] {
  const query = searchTerm.trim().toLowerCase();
  return courses.filter((course) => {
    const matchesSearch =
      query === "" ||
      course.title.toLowerCase().includes(query) ||
      course.description.toLowerCase().includes(query) ||
      course.topics?.some((t) => t.toLowerCase().includes(query));

    const matchesCategory =
      selectedCategory === "Tất cả" || course.category === selectedCategory;

    const matchesLevel =
      selectedLevel === "Tất cả cấp độ" || course.level === selectedLevel;

    return matchesSearch && matchesCategory && matchesLevel;
  });
}
