"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Sparkles,
  X,
  RotateCw,
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
import AuthModal from "@/components/auth/auth-modal";

const CATEGORIES = [
  "Tất cả",
  "Frontend",
  "Backend",
  "Dữ liệu",
  "Công cụ",
] as const;

const LEVELS: { value: string; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "Beginner", label: "Cơ bản" },
  { value: "Intermediate", label: "Trung cấp" },
  { value: "Advanced", label: "Nâng cao" },
];

const PRICE_OPTIONS: { value: CatalogPriceFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "free", label: "Miễn phí" },
  { value: "paid", label: "Trả phí" },
];

function CatalogSkeleton() {
  return (
    <div className={cardStyles.grid} aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={cardStyles.card}>
          <div className="aspect-video w-full bg-muted animate-pulse" />
          <div className="p-4 flex flex-col flex-1 gap-2.5">
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-muted rounded-full animate-pulse" />
            </div>
            <div className="h-5 w-3/4 bg-muted rounded animate-pulse mt-1" />
            <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
            <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
            <div className="mt-auto pt-3 border-t border-border flex justify-between items-center">
              <div className="h-5 w-20 bg-muted rounded animate-pulse" />
              <div className="h-8 w-24 bg-muted rounded-lg animate-pulse" />
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

  // Filters state (matches Mockup S01 & user requirements)
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("Tất cả");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
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
  const [authModalState, setAuthModalState] = useState<{
    open: boolean;
    course?: CatalogCourse;
    action?: "cart" | "enroll";
  }>({ open: false });
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const userRole = (session?.user as { role?: string } | undefined)?.role ?? null;

  // Hydrate filters from URL query parameters on initial load
  const initialCourseIdRef = useRef<string | null>(null);

  // 1. Fetch catalog courses
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchCourses(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        // Filter out internal dev learning-path records from public course catalog
        const publicCourses = data.filter((c) => !c.id.startsWith("dev-path-"));
        setCourses(publicCourses);
        const targetCourseId = initialCourseIdRef.current;
        const linkedCourse = targetCourseId ? publicCourses.find((c) => c.id === targetCourseId) : null;
        if (linkedCourse) {
          router.replace(`/courses/${encodeURIComponent(linkedCourse.slug)}`);
        } else if (targetCourseId && typeof window !== "undefined") {
          // If the course id doesn't exist, remove it from URL so it doesn't linger
          initialCourseIdRef.current = null;
          const currentParams = new URLSearchParams(window.location.search);
          currentParams.delete("course");
          const qs = currentParams.toString();
          window.history.replaceState(null, "", qs ? `/courses?${qs}` : "/courses");
        }
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

  const isHydratedRef = useRef(false);

  // Hydrate filters from URL query parameters on initial load
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    initialCourseIdRef.current = params.get("course");

    const qParam = params.get("q");
    if (qParam) setSearchTerm(qParam);

    const catParam = params.get("cat");
    if (catParam && (CATEGORIES as readonly string[]).includes(catParam)) {
      setSelectedCategory(catParam);
    }

    const levelParam = params.get("level");
    if (levelParam) {
      const normalized = levelParam.trim().toLowerCase();
      if (normalized === "beginner" || normalized === "cơ bản" || normalized === "co ban") {
        setSelectedLevel("Beginner");
      } else if (normalized === "intermediate" || normalized === "trung cấp" || normalized === "trung cap") {
        setSelectedLevel("Intermediate");
      } else if (normalized === "advanced" || normalized === "nâng cao" || normalized === "nang cao") {
        setSelectedLevel("Advanced");
      } else if (normalized === "all" || normalized === "tất cả") {
        setSelectedLevel("all");
      }
      // Unknown or invalid level parameter is ignored
    }

    const priceParam = params.get("price");
    if (priceParam === "free" || priceParam === "paid" || priceParam === "all") {
      setSelectedPrice(priceParam);
    }

    const sortParam = params.get("sort");
    if (
      sortParam === "popular" ||
      sortParam === "newest" ||
      sortParam === "price-asc" ||
      sortParam === "price-desc" ||
      sortParam === "rating"
    ) {
      setSelectedSort(sortParam);
    }
    isHydratedRef.current = true;
  }, []);

  // Sync active filters and sort to URL query params
  useEffect(() => {
    if (!isHydratedRef.current || typeof window === "undefined") return;
    const currentParams = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();

    // Preserve unmanaged or temporary params like course deep-link
    const courseParam = currentParams.get("course");
    if (courseParam) params.set("course", courseParam);

    if (searchTerm.trim()) params.set("q", searchTerm.trim());
    if (selectedCategory !== "Tất cả") params.set("cat", selectedCategory);
    if (selectedLevel !== "all") params.set("level", selectedLevel);
    if (selectedPrice !== "all") params.set("price", selectedPrice);
    if (selectedSort !== "popular") params.set("sort", selectedSort);

    const queryString = params.toString();
    const newUrl = queryString ? `/courses?${queryString}` : "/courses";
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== newUrl) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [searchTerm, selectedCategory, selectedLevel, selectedPrice, selectedSort]);

  // 2. Fetch ownership mapping when session and courses exist
  useEffect(() => {
    if (!session?.user?.id || courses.length === 0) {
      setOwnershipMap({});
      return;
    }
    const controller = new AbortController();
    fetch("/api/courses/ownership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courses: courses.map((c) => ({ id: c.id })),
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
  }, [courses, session?.user?.id]);

  // 3. Typeahead suggestions
  const typeaheadResult = useMemo(() => {
    return getTypeaheadSuggestions(courses, searchTerm);
  }, [courses, searchTerm]);

  // Build unified flat list for accessible keyboard navigation (ArrowDown/Up, Enter)
  // across Query Suggestions, Top Results, and "Xem tất cả kết quả"
  type NavigableItem =
    | { kind: "query"; text: string }
    | { kind: "topResult"; item: typeof typeaheadResult.topResults[number] }
    | { kind: "seeAll"; count: number };

  const navigableItems = useMemo<NavigableItem[]>(() => {
    const items: NavigableItem[] = [];
    for (const q of typeaheadResult.querySuggestions) {
      items.push({ kind: "query", text: q });
    }
    for (const top of typeaheadResult.topResults) {
      items.push({ kind: "topResult", item: top });
    }
    if (typeaheadResult.matches.length > 0 || typeaheadResult.topResults.length > 0) {
      items.push({ kind: "seeAll", count: typeaheadResult.matches.length });
    }
    return items;
  }, [typeaheadResult]);

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
    } else if (e.key === "ArrowDown" && showTypeahead && navigableItems.length > 0) {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev < navigableItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp" && showTypeahead && navigableItems.length > 0) {
      e.preventDefault();
      setActiveSuggestionIndex((prev) => (prev > 0 ? prev - 1 : navigableItems.length - 1));
    } else if (e.key === "Enter") {
      if (showTypeahead && activeSuggestionIndex >= 0 && activeSuggestionIndex < navigableItems.length) {
        e.preventDefault();
        const selected = navigableItems[activeSuggestionIndex];
        setShowTypeahead(false);
        setActiveSuggestionIndex(-1);
        if (selected.kind === "query") {
          setSearchTerm(selected.text);
        } else if (selected.kind === "topResult") {
          if (selected.item.course) {
            router.push(`/courses/${encodeURIComponent(selected.item.course.slug)}`);
          } else {
            setSearchTerm(selected.item.title);
          }
        } else if (selected.kind === "seeAll") {
          // Keep current searchTerm and submit/close
        }
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
        label: `Danh mục: ${selectedCategory}`,
        onRemove: () => setSelectedCategory("Tất cả"),
      });
    }
    if (selectedLevel !== "all") {
      const levelObj = LEVELS.find((l) => l.value === selectedLevel);
      chips.push({
        key: "level",
        label: `Trình độ: ${levelObj?.label ?? selectedLevel}`,
        onRemove: () => setSelectedLevel("all"),
      });
    }
    if (selectedPrice !== "all") {
      chips.push({
        key: "price",
        label: `Giá: ${selectedPrice === "free" ? "Miễn phí" : "Trả phí"}`,
        onRemove: () => setSelectedPrice("all"),
      });
    }
    if (selectedSort !== "popular") {
      const sortLabels: Record<CatalogSortOption, string> = {
        popular: "Phổ biến nhất",
        newest: "Mới nhất",
        "price-asc": "Giá: thấp → cao",
        "price-desc": "Giá: cao → thấp",
        rating: "Đánh giá cao nhất",
      };
      chips.push({
        key: "sort",
        label: `Sắp xếp: ${sortLabels[selectedSort]}`,
        onRemove: () => setSelectedSort("popular"),
      });
    }
    return chips;
  }, [searchTerm, selectedCategory, selectedLevel, selectedPrice, selectedSort]);

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedCategory("Tất cả");
    setSelectedLevel("all");
    setSelectedPrice("all");
    setSelectedSort("popular");
    setShowTypeahead(false);
    setActiveSuggestionIndex(-1);
  };

  // 6. Ownership CTAs Handlers
  const handleAddToCart = async (course: CatalogCourse, isGatedReturn = false) => {
    if (!isGatedReturn && !session?.user) {
      setAuthModalState({
        open: true,
        course,
        action: "cart",
      });
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
        if (response.status === 401) {
          setAuthModalState({
            open: true,
            course,
            action: "cart",
          });
          return;
        }
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
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("codi:cart-updated"));
        }
      }
    } catch {
      setFeedback({ type: "error", text: "Không thể kết nối. Vui lòng thử lại." });
    } finally {
      setAddingCourseId(null);
    }
  };

  const handleEnrollFree = async (course: CatalogCourse, isGatedReturn = false) => {
    if (!isGatedReturn && !session?.user) {
      setAuthModalState({
        open: true,
        course,
        action: "enroll",
      });
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
        if (response.status === 401) {
          setAuthModalState({
            open: true,
            course,
            action: "enroll",
          });
          return;
        }
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
    <div className="min-h-screen bg-background font-[family-name:var(--font-geist-sans)] py-8 sm:py-10">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6">
        {/* Header (Screenshot 3 & S01 Mockup) */}
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Khoá học
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-muted-foreground">
            Tìm khoá học phù hợp với mục tiêu của bạn.
          </p>
        </div>

        {/* 4-Control Filter Bar matching Screenshot 3 */}
        <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4 items-end">
          {/* 1. Tìm kiếm */}
          <div ref={searchContainerRef} className="lg:col-span-6 relative">
            <label htmlFor="f-search" className="block text-xs font-bold text-foreground mb-1.5">
              Tìm kiếm
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="f-search"
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showTypeahead && navigableItems.length > 0}
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
                  className="pr-8 h-10 rounded-lg bg-card border-border text-sm"
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
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Button
                type="button"
                onClick={() => setShowTypeahead(false)}
                className="h-10 px-4 rounded-lg gap-1.5 shrink-0 cursor-pointer"
              >
                <Search className="h-4 w-4" />
                <span>Tìm</span>
              </Button>
            </div>

            {/* Typeahead Suggestions Dropdown matching Flow L1 */}
            {showTypeahead && searchTerm.trim().length > 0 && (
              <div
                id="typeahead-suggestions"
                role="listbox"
                className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-96 overflow-y-auto rounded-xl border border-border bg-card shadow-lg p-2 text-sm divide-y divide-border/50"
              >
                {navigableItems.length === 0 ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    Không tìm thấy gợi ý nào cho &ldquo;{searchTerm}&rdquo;
                  </div>
                ) : (
                  <>
                    {/* Section 1: Query suggestions (if any) */}
                    {typeaheadResult.querySuggestions.length > 0 && (
                      <div role="group" aria-label="Gợi ý tìm kiếm" className="pb-2">
                        <div className="px-2.5 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Gợi ý tìm kiếm
                        </div>
                        {typeaheadResult.querySuggestions.map((qText) => {
                          const itemIndex = navigableItems.findIndex(
                            (item) => item.kind === "query" && item.text === qText
                          );
                          const isSelected = itemIndex === activeSuggestionIndex;
                          return (
                            <button
                              key={`query-${qText}`}
                              id={`suggestion-${itemIndex}`}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onMouseEnter={() => setActiveSuggestionIndex(itemIndex)}
                              onClick={() => {
                                setSearchTerm(qText);
                                setShowTypeahead(false);
                                setActiveSuggestionIndex(-1);
                              }}
                              className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-accent text-accent-foreground font-medium"
                                  : "text-foreground hover:bg-muted"
                              }`}
                            >
                              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{qText}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Section 2: Kết quả hàng đầu (badge: Khóa học, Chủ đề) */}
                    {typeaheadResult.topResults.length > 0 && (
                      <div role="group" aria-label="Kết quả hàng đầu" className="py-2">
                        <div className="px-2.5 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Kết quả hàng đầu
                        </div>
                        {typeaheadResult.topResults.map((top) => {
                          const itemIndex = navigableItems.findIndex(
                            (item) => item.kind === "topResult" && item.item.id === top.id
                          );
                          const isSelected = itemIndex === activeSuggestionIndex;
                          return (
                            <button
                              key={top.id}
                              id={`suggestion-${itemIndex}`}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onMouseEnter={() => setActiveSuggestionIndex(itemIndex)}
                              onClick={() => {
                                setShowTypeahead(false);
                                setActiveSuggestionIndex(-1);
                                if (top.course) {
                                  router.push(`/courses/${encodeURIComponent(top.course.slug)}`);
                                } else {
                                  setSearchTerm(top.title);
                                }
                              }}
                              className={`w-full flex items-center justify-between text-left px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                                isSelected
                                  ? "bg-accent text-accent-foreground font-medium"
                                  : "text-foreground hover:bg-muted"
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 pr-2">
                                <span
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                                    top.type === "Khóa học"
                                      ? "bg-primary/10 text-primary border border-primary/20"
                                      : "bg-secondary text-secondary-foreground"
                                  }`}
                                >
                                  {top.badgeLabel}
                                </span>
                                <span className="truncate font-medium">{top.title}</span>
                              </div>
                              {top.course ? (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {LEVELS.find((l) => l.value === top.course?.level)?.label ?? top.course.level}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {top.category}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Section 3: Xem tất cả kết quả */}
                    <div className="pt-2">
                      {(() => {
                        const seeAllIndex = navigableItems.findIndex((item) => item.kind === "seeAll");
                        const isSelected = seeAllIndex === activeSuggestionIndex;
                        return (
                          <button
                            id={`suggestion-${seeAllIndex}`}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onMouseEnter={() => setActiveSuggestionIndex(seeAllIndex)}
                            onClick={() => {
                              setShowTypeahead(false);
                              setActiveSuggestionIndex(-1);
                            }}
                            className={`w-full flex items-center justify-between text-left px-2.5 py-2 rounded-lg cursor-pointer transition-colors font-medium ${
                              isSelected
                                ? "bg-accent text-accent-foreground"
                                : "text-primary hover:bg-muted"
                            }`}
                          >
                            <span>Xem tất cả kết quả</span>
                            <span className="text-xs text-muted-foreground">
                              {typeaheadResult.matches.length} kết quả
                            </span>
                          </button>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 2. Danh mục: Tất cả (default), Frontend, Backend, Dữ liệu, Công cụ */}
          <div className="lg:col-span-2">
            <label htmlFor="f-category" className="block text-xs font-bold text-foreground mb-1.5">
              Danh mục
            </label>
            <select
              id="f-category"
              aria-label="Lọc theo danh mục"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-card border border-border text-sm text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Trình độ: Tất cả, Cơ bản, Trung cấp, Nâng cao */}
          <div className="lg:col-span-2">
            <label htmlFor="f-level" className="block text-xs font-bold text-foreground mb-1.5">
              Trình độ
            </label>
            <select
              id="f-level"
              aria-label="Lọc theo trình độ"
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-card border border-border text-sm text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              {LEVELS.map((lvl) => (
                <option key={lvl.value} value={lvl.value}>
                  {lvl.label}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Giá: Tất cả, Miễn phí, Trả phí */}
          <div className="lg:col-span-2">
            <label htmlFor="f-price" className="block text-xs font-bold text-foreground mb-1.5">
              Giá
            </label>
            <select
              id="f-price"
              aria-label="Lọc theo học phí"
              value={selectedPrice}
              onChange={(e) => setSelectedPrice(e.target.value as CatalogPriceFilter)}
              className="w-full h-10 px-3 rounded-lg bg-card border border-border text-sm text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              {PRICE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Feedback Alert if any */}
        {feedback && (
          <div
            role="status"
            className={`my-4 flex items-center justify-between rounded-xl border p-4 text-sm ${
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

        {/* Active Filter Chips */}
        {activeChips.length > 0 && (
          <div className="my-3 flex flex-wrap items-center gap-2">
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

        {/* Results Counter & Sort (Screenshot 3 & S01 Mockup) */}
        <div className="my-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground font-medium" role="status">
            {loading ? "Đang tải danh sách khoá học…" : `${filteredCourses.length} khoá học`}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="f-sort" className="text-xs text-muted-foreground font-medium shrink-0">
              Sắp xếp:
            </label>
            <select
              id="f-sort"
              aria-label="Sắp xếp danh sách khóa học"
              value={selectedSort}
              onChange={(e) => setSelectedSort(e.target.value as CatalogSortOption)}
              className="h-9 px-2.5 rounded-lg bg-card border border-border text-xs text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              <option value="popular">Phổ biến nhất</option>
              <option value="newest">Mới nhất</option>
              <option value="price-asc">Giá: thấp → cao</option>
              <option value="price-desc">Giá: cao → thấp</option>
              <option value="rating">Đánh giá cao nhất</option>
            </select>
          </div>
        </div>

        {/* Course Cards Grid or States */}
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
      </div>

      <AuthModal
        open={authModalState.open}
        onOpenChange={(open) => setAuthModalState((prev) => ({ ...prev, open }))}
        courseTitle={authModalState.course?.title}
        intentReason={
          authModalState.action === "cart"
            ? "thêm khoá học vào giỏ hàng"
            : "đăng ký khoá học miễn phí"
        }
        onSuccess={async () => {
          const c = authModalState.course;
          const a = authModalState.action;
          setAuthModalState({ open: false });
          if (!c) return;

          try {
            await authClient.getSession();
          } catch {
            // Continue
          }

          if (a === "cart") {
            await handleAddToCart(c, true);
          } else if (a === "enroll") {
            await handleEnrollFree(c, true);
          }
        }}
      />
    </div>
  );
}
