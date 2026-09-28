import type { Course } from "./data/courses";

/**
 * Lọc danh mục khóa học theo từ khóa tìm kiếm, danh mục và cấp độ.
 * Hàm thuần (pure function), không làm thay đổi mảng dữ liệu đầu vào.
 */
export function filterCourseCatalog(
  courses: readonly Course[],
  searchTerm: string,
  selectedCategory: string,
  selectedLevel: string
): Course[] {
  return courses.filter((course) => {
    const matchesSearch =
      searchTerm.trim() === "" ||
      course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      course.topics.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory =
      selectedCategory === "Tất cả" || course.category === selectedCategory;

    const matchesLevel =
      selectedLevel === "Tất cả cấp độ" || course.level === selectedLevel;

    return matchesSearch && matchesCategory && matchesLevel;
  });
}
