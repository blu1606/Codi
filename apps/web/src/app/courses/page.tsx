"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Sparkles,
  X,
  RotateCw,
  SlidersHorizontal,
  Check,
  AlertCircle,
} from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import {
  Card,
  CardContent,
} from "@codi-1/ui/components/card";
import { Input } from "@codi-1/ui/components/input";
import { fetchCourses, type CatalogCourse } from "@/lib/course-catalog";
import {
  filterCourseCatalog,
  getTypeaheadSuggestions,
  type CatalogPriceFilter,
  type CatalogSortOption,
} from "@/lib/filter-course-catalog";
import type { CourseOwnershipDetail } from "@/lib/course-ownership";
import { authClient } from "@/lib/auth-client";
import { CatalogCourseCard } from "@/components/courses/catalog-course-card";
import cardStyles from "@/components/courses/catalog-course-card.module.css";

const CATEGORIES = [
  "Tất cả",
  "Frontend",
  "Backend",
  "Fullstack",
  "Data & AI",
  "Mobile",
  "Computer Science",
] as const;

const LEVELS = ["Tất cả cấp độ", "Beginner", "Intermediate", "Advanced"] as const;

const SORT_OPTIONS: { value: CatalogSortOption; label: string }[] = [
  { value: "popular", label: "Phổ biến nhất" },
  { value: "newest", label: "Mới nhất" },
  { value: "price-asc", label: "Giá: Thấp → Cao" },
  { value: "price-desc", label: "Giá: Cao → Thấp" },
  { value: "rating", label: "Đánh giá cao nhất" },
];

const PRICE_OPTIONS: { value: CatalogPriceFilter; label: string }[] = [
  { value: "all", label: "Tất cả học phí" },
  { value: "free", label: "Miễn phí" },
  { value: "paid", label: "Có phí" },
];

function CatalogSkeleton() {
  return (
    <div className={cardStyles.grid} aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={cardStyles.card}>
          <div className="aspect-video w-full bg-muted animate-pulse" />
          <div className="p-5 flex flex-col flex-1 gap-3">
            <div className="flex gap-2">
              <div className="h-4 w-16 bg-muted rounded animate-pulse" />
              <div className="h-4 w-12 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-5 w-3/4 bg-muted rounded animate-pulse mt-1" />
            <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
            <div className="h-10 w-full bg-muted rounded animate-pulse mt-1" />
            <div className="mt-auto pt-4 border-t border-border flex justify-between items-center">
              <div className="h-4 w-20 bg-muted rounded animate-pulse" />
              <div className="h-8 w-24 bg-muted rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CoursesPage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Tất cả");
  const [selectedLevel, setSelectedLevel] = useState<string>("Tất cả cấp độ");
  const [selectedPrice, setSelectedPrice] = useState<CatalogPriceFilter>("all");
  const [selectedSort, setSelectedSort] = useState<CatalogSortOption>("popular");

  // Courses and ownership data
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Typeahead state
  const [showTypeahead, setShowTypeahead] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Ownership map & feedback
  const [ownershipMap, setOwnershipMap] = useState<Record<string, CourseOwnershipDetail>>({});
  const [addingCourseId, setAddingCourseId] = useState<string | null>(null);
  const [enrollingCourseId, setEnrollingCourseId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const userRole = (session?.user as { role?: string } | undefined)?.role ?? null;

  // 1. Fetch catalog courses
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchCourses(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setCourses(data);
        const courseId = new URLSearchParams(window.location.search).get("course");
        const linkedCourse = courseId ? data.find((c) => c.id === courseId) : null;
        if (linkedCourse) router.replace(`/courses/${encodeURIComponent(linkedCourse.slug)}`);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("Không thể tải khóa học. Vui lòng thử lại.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt, router]);

  // 2. Fetch ownership mapping when session and courses exist
  useEffect(() => {
    if (!session?.user || courses.length === 0) {
      setOwnershipMap({});
      return;
    }
    const controller = new AbortController();
    fetch("/api/courses/ownership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courses: courses.map((c) => ({ id: c.id, price: c.price })),
      }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ownership || data?.ownerships) {
          setOwnershipMap(data.ownership || data.ownerships);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [courses, session]);

  // 3. Typeahead suggestions
  const typeaheadResult = useMemo(() => {
    return getTypeaheadSuggestions(courses, searchTerm);
  }, [courses, searchTerm]);

  const flatSuggestions = typeaheadResult.matches;

  // Close typeahead on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowTypeahead(false);
        setActiveSuggestionIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowTypeahead(false);
      setActiveSuggestionIndex(-1);
    } else if (e.key === "ArrowDown" && showTypeahead && flatSuggestions.length > 0) {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev < flatSuggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp" && showTypeahead && flatSuggestions.length > 0) {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev > 0 ? prev - 1 : flatSuggestions.length - 1));
    } else if (e.key === "Enter") {
      if (showTypeahead && activeSuggestionIndex >= 0 && activeSuggestionIndex < flatSuggestions.length) {
        e.preventDefault();
        const selected = flatSuggestions[activeSuggestionIndex];
        setSearchTerm(selected.title);
        setShowTypeahead(false);
        setActiveSuggestionIndex(-1);
      }
    }
  };

  // 4. Filtered & Sorted courses
  const filteredCourses = useMemo(() => {
    return filterCourseCatalog(courses, searchTerm, selectedCategory, selectedLevel, {
      price: selectedPrice,
      sort: selectedSort,
    });
  }, [courses, searchTerm, selectedCategory, selectedLevel, selectedPrice, selectedSort]);

  // 5. Active filter chips
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (searchTerm.trim()) {
      chips.push({
        key: "q",
        label: `Từ khóa: "${searchTerm.trim()}"`,
        onRemove: () => setSearchTerm(""),
      });
    }
    if (selectedCategory !== "Tất cả") {
      chips.push({
        key: "cat",
        label: `Chủ đề: ${selectedCategory}`,
        onRemove: () => setSelectedCategory("Tất cả"),
      });
    }
    if (selectedLevel !== "Tất cả cấp độ") {
      chips.push({
        key: "level",
        label: `Cấp độ: ${selectedLevel}`,
        onRemove: () => setSelectedLevel("Tất cả cấp độ"),
      });
    }
    if (selectedPrice !== "all") {
      chips.push({
        key: "price",
        label: `Học phí: ${selectedPrice === "free" ? "Miễn phí" : "Có phí"}`,
        onRemove: () => setSelectedPrice("all"),
      });
    }
    return chips;
  }, [searchTerm, selectedCategory, selectedLevel, selectedPrice]);

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedCategory("Tất cả");
    setSelectedLevel("Tất cả cấp độ");
    setSelectedPrice("all");
    setSelectedSort("popular");
    setShowTypeahead(false);
    setActiveSuggestionIndex(-1);
  };

  // 6. Ownership CTAs Handlers
  const handleAddToCart = async (course: CatalogCourse) => {
    if (!session?.user) {
      router.push("/login");
      return;
    }
    setAddingCourseId(course.id);
    setFeedback(null);
    try {
      const response = await fetch("/api/student/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        setFeedback({
          type: "error",
          text: result.error || "Không thể thêm khóa học vào giỏ.",
        });
      } else {
        setOwnershipMap((prev) => ({
          ...prev,
          [course.id]: { ownership: "in-cart" },
        }));
        setFeedback({
          type: "success",
          text: result.added
            ? `Đã thêm “${course.title}” vào giỏ hàng.`
            : `Khóa học “${course.title}” đã có trong giỏ hàng.`,
        });
      }
    } catch {
      setFeedback({ type: "error", text: "Không thể kết nối. Vui lòng thử lại." });
    } finally {
      setAddingCourseId(null);
    }
  };

  const handleEnrollFree = async (course: CatalogCourse) => {
    if (!session?.user) {
      router.push("/login");
      return;
    }
    setEnrollingCourseId(course.id);
    setFeedback(null);
    try {
      const response = await fetch("/api/courses/enroll-free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        setFeedback({
          type: "error",
          text: result.error || "Không thể đăng ký khóa học miễn phí.",
        });
      } else {
        setOwnershipMap((prev) => ({
          ...prev,
          [course.id]: { ownership: "owned" },
        }));
        setFeedback({
          type: "success",
          text: `Đăng ký thành công “${course.title}”! Bạn có thể bắt đầu học ngay.`,
        });
      }
    } catch {
      setFeedback({ type: "error", text: "Không thể kết nối. Vui lòng thử lại." });
    } finally {
      setEnrollingCourseId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background font-[family-name:var(--font-geist-sans)]">
      {/* Hero Header Section */}
      <section className="border-b border-border/40 bg-gradient-to-b from-primary/5 via-background to-background py-10 sm:py-14">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Chương trình đào tạo thực chiến Codi</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl text-foreground">
              Khám phá các khóa học <br className="hidden sm:inline" />
              <span className="text-primary">lập trình &amp; công nghệ</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
              Trải nghiệm học tập gắn liền với dự án thực tế, hệ sinh thái bài tập tương tác
              và trợ lý AI hỗ trợ giải đáp thắc mắc 24/7.
            </p>
          </div>

          {/* Search Bar & Instant Filters Grid */}
          <div className="mt-8 grid gap-3 sm:gap-4 md:grid-cols-12 items-center">
            {/* Search Input with Grouped Typeahead */}
            <div ref={searchContainerRef} className="relative md:col-span-5">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showTypeahead && flatSuggestions.length > 0}
                aria-controls="typeahead-suggestions"
                aria-activedescendant={
                  activeSuggestionIndex >= 0 ? `suggestion-${activeSuggestionIndex}` : undefined
                }
                placeholder="Tìm khóa học theo tên, công nghệ (React, Node, AI...)"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowTypeahead(e.target.value.trim().length > 0);
                  setActiveSuggestionIndex(-1);
                }}
                onFocus={() => {
                  if (searchTerm.trim().length > 0) setShowTypeahead(true);
                }}
                onKeyDown={handleSearchKeyDown}
                className="pl-10 pr-9 h-11 rounded-xl bg-card border-border shadow-sm text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setShowTypeahead(false);
                    setActiveSuggestionIndex(-1);
                  }}
                  aria-label="Xóa từ khóa tìm kiếm"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {/* Typeahead Suggestions Dropdown */}
              {showTypeahead && searchTerm.trim().length > 0 && (
                <div
                  id="typeahead-suggestions"
                  role="listbox"
                  className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-border bg-card shadow-lg p-2 text-sm"
                >
                  {flatSuggestions.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      Không tìm thấy gợi ý nào cho &ldquo;{searchTerm}&rdquo;
                    </div>
                  ) : (
                    Object.entries(typeaheadResult.grouped).map(([category, items]) => (
                      <div key={category} role="group" aria-label={category} className="mb-2 last:mb-0">
                        <div className="px-2.5 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {category}
                        </div>
                        {items.map((item) => {
                          const itemIndex = flatSuggestions.findIndex((s) => s.id === item.id);
                          const isSelected = itemIndex === activeSuggestionIndex;
                          return (
                            <button
                              key={item.id}
                              id={`suggestion-${itemIndex}`}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onMouseEnter={() => setActiveSuggestionIndex(itemIndex)}
                              onClick={() => {
                                setSearchTerm(item.title);
                                setShowTypeahead(false);
                                setActiveSuggestionIndex(-1);
                              }}
                              className={`w-full flex items-center justify-between text-left px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-accent text-accent-foreground font-medium"
                                  : "text-foreground hover:bg-muted"
                              }`}
                            >
                              <span className="truncate pr-2">{item.title}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{item.level}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Level Selector */}
            <div className="md:col-span-2">
              <select
                aria-label="Lọc theo cấp độ"
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-card border border-border text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                {LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl === "Tất cả cấp độ" ? "Cấp độ: Tất cả" : lvl}
                  </option>
                ))}
              </select>
            </div>

            {/* Price Filter */}
            <div className="md:col-span-2">
              <select
                aria-label="Lọc theo học phí"
                value={selectedPrice}
                onChange={(e) => setSelectedPrice(e.target.value as CatalogPriceFilter)}
                className="w-full h-11 px-3 rounded-xl bg-card border border-border text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                {PRICE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Selector */}
            <div className="md:col-span-3">
              <select
                aria-label="Sắp xếp danh mục khóa học"
                value={selectedSort}
                onChange={(e) => setSelectedSort(e.target.value as CatalogSortOption)}
                className="w-full h-11 px-3 rounded-xl bg-card border border-border text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    Sắp xếp: {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Chủ đề:
            </span>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Course Listing Section */}
      <section className="container mx-auto max-w-7xl px-4 sm:px-6 py-8 sm:py-10">
        {/* Feedback Alert if any */}
        {feedback && (
          <div
            role="status"
            className={`mb-6 flex items-center justify-between rounded-xl border p-4 text-sm ${
              feedback.type === "success"
                ? "bg-success-soft border-border text-success"
                : "bg-destructive-soft border-border text-destructive"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === "success" ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Đóng thông báo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Active Filter Chips Row */}
        {activeChips.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Bộ lọc đang chọn:</span>
            {activeChips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-xs"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                  aria-label={`Bỏ bộ lọc ${chip.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-semibold text-primary hover:underline cursor-pointer ml-1"
            >
              Xóa bộ lọc
            </button>
          </div>
        )}

        {/* Results Counter & Reset Controls */}
        <div className="flex items-center justify-between pb-6">
          <p className="text-sm text-muted-foreground" role="status">
            Hiển thị <strong className="text-foreground">{filteredCourses.length}</strong> khóa học phù hợp
          </p>
          {activeChips.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs text-primary hover:text-primary cursor-pointer gap-1"
            >
              <X className="h-3.5 w-3.5" />
              Đặt lại bộ lọc
            </Button>
          )}
        </div>

        {/* Catalog Body States: Loading | Error | Empty | Results */}
        {loading ? (
          <CatalogSkeleton />
        ) : error ? (
          <Card className="items-center gap-4 border-dashed p-8 text-center bg-card">
            <CardContent className="space-y-4 max-w-md mx-auto">
              <div className="mx-auto w-12 h-12 rounded-full bg-destructive-soft flex items-center justify-center text-destructive">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">Không tải được danh sách khóa học</h3>
                <p role="alert" className="text-sm text-muted-foreground">
                  {error} Kết nối bị gián đoạn. Bộ lọc của bạn vẫn được giữ.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setAttempt((value) => value + 1)}
                className="gap-2 cursor-pointer"
              >
                <RotateCw className="h-4 w-4" />
                Thử lại
              </Button>
            </CardContent>
          </Card>
        ) : filteredCourses.length === 0 ? (
          <Card className="border border-dashed border-border py-16 text-center bg-card">
            <CardContent className="space-y-4 max-w-md mx-auto">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <Search className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold">Không tìm thấy khóa học phù hợp</h3>
                <p className="text-sm text-muted-foreground">
                  Thử bỏ bớt bộ lọc, hoặc mô tả mục tiêu để AI Codi gợi ý khóa học.
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={handleResetFilters}
                  className="cursor-pointer"
                >
                  Đặt lại bộ lọc
                </Button>
                <Button
                  variant="default"
                  onClick={() =>
                    router.push(
                      `/ai?prompt=${encodeURIComponent("Gợi ý khóa học " + (searchTerm || selectedCategory))}`
                    )
                  }
                  className="gap-1.5 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  Hỏi AI Codi
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Course Cards Grid */
          <div className={cardStyles.grid}>
            {filteredCourses.map((course) => (
              <CatalogCourseCard
                key={course.id}
                course={course}
                ownership={ownershipMap[course.id]}
                userRole={userRole}
                adding={addingCourseId === course.id}
                enrolling={enrollingCourseId === course.id}
                onAddToCart={handleAddToCart}
                onEnrollFree={handleEnrollFree}
              />
            ))}
          </div>
        )}

        {/* AI Learning Advisor Banner */}
        <div className="mt-16 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              Lộ trình cá nhân hóa
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight">
              Bạn chưa rõ nên bắt đầu từ khóa học nào?
            </h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              Cung cấp cho Trợ lý AI Codi mục tiêu nghề nghiệp, thời gian học mỗi ngày và nền tảng hiện tại của bạn để nhận lộ trình chi tiết từng tuần.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => router.push("/ai")}
            className="gap-2 shrink-0 cursor-pointer shadow-sm"
          >
            <Sparkles className="h-4 w-4" />
            Tư vấn lộ trình với AI
          </Button>
        </div>
      </section>
    </div>
  );
}
