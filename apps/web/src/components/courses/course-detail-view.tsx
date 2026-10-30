"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock,
  EyeOff,
  MessageCircle,
  Presentation,
  RotateCw,
  ShoppingCart,
  Sparkles,
  Star,
  Terminal,
  Upload,
  User,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@codi-1/ui/components/button";
import { CourseDetailSkeleton } from "@/components/skeletons/course-detail-skeleton";
import { Card } from "@codi-1/ui/components/card";
import { authClient } from "@/lib/auth-client";
import {
  CourseDetailError,
  fetchCourseDetail,
  formatLessonDuration,
  getLessonTypeMeta,
  type CourseDetail,
  type LessonContentType,
} from "@/lib/course-details";
import type { CourseOwnershipDetail } from "@/lib/course-ownership";
import AuthModal from "@/components/auth/auth-modal";
import CourseReviewList from "./course-review-list";
import styles from "./course-detail.module.css";

const LEVEL_LABELS: Record<string, string> = {
  Beginner: "Cơ bản",
  Intermediate: "Trung cấp",
  Advanced: "Nâng cao",
  "Cơ bản": "Cơ bản",
  "Trung cấp": "Trung cấp",
  "Nâng cao": "Nâng cao",
};

function getInitials(name?: string | null): string {
  if (!name) return "CD";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (
    parts[parts.length - 2][0] + parts[parts.length - 1][0]
  ).toUpperCase();
}

function getLessonIcon(type: LessonContentType) {
  switch (type) {
    case "quiz":
      return ClipboardCheck;
    case "assignment":
      return Upload;
    case "code":
    case "tutorial":
      return Terminal;
    case "pdf":
      return Presentation;
    case "reading":
      return BookOpen;
    case "video":
    default:
      return Video;
  }
}

export default function CourseDetailView({ slug }: { slug: string }) {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // Curriculum accordion state
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());

  // Ownership state
  const [ownership, setOwnership] = useState<CourseOwnershipDetail | null>(
    null,
  );
  const [adding, setAdding] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [cartMessage, setCartMessage] = useState("");

  // Gated Auth Modal state (Flow L2, S03)
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<
    "add-to-cart" | "buy-now" | "enroll-free" | null
  >(null);
  const [intentReason, setIntentReason] = useState("");
  const isResumingRef = useRef(false);

  const userRole =
    (session?.user as { role?: string } | undefined)?.role ?? null;
  const isPrivilegedRole = userRole === "lecturer" || userRole === "admin";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchCourseDetail(slug, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setDetail(data);
        // Default first chapter open
        setOpenChapters(new Set(data.chapters.slice(0, 1).map((ch) => ch.id)));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError({
          message: err instanceof Error ? err.message : "Không thể tải khóa học. Vui lòng thử lại.",
          notFound: err instanceof CourseDetailError && err.status === 404,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug, attempt]);

  // Check ownership
  useEffect(() => {
    if (!detail || !session?.user?.id) {
      setOwnership(null);
      return;
    }
    const controller = new AbortController();
    fetch("/api/courses/ownership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courses: [{ id: detail.course.id }],
      }),
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.ownership?.[detail.course.id]) {
          setOwnership(data.ownership[detail.course.id]);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [detail, session?.user?.id]);

  // Check and resume pending intent stored in sessionStorage (e.g. from page reload or redirect)
  useEffect(() => {
    if (!detail || !session?.user) return;
    if (isResumingRef.current) return;
    try {
      const stored = sessionStorage.getItem("codi_pending_course_intent");
      if (!stored) return;
      const parsed = JSON.parse(stored) as {
        courseId?: string;
        slug?: string;
        action?: "add-to-cart" | "buy-now" | "enroll-free";
        createdAt?: number;
      };

      // 15-minute TTL check
      const INTENT_TTL_MS = 15 * 60 * 1000;
      if (parsed.createdAt && Date.now() - parsed.createdAt > INTENT_TTL_MS) {
        sessionStorage.removeItem("codi_pending_course_intent");
        return;
      }

      if (parsed.courseId === detail.course.id || parsed.slug === slug) {
        sessionStorage.removeItem("codi_pending_course_intent");
        setPendingIntent(null);
        isResumingRef.current = true;
        void (async () => {
          try {
            if (parsed.action === "buy-now") {
              await handleBuyNow(true);
            } else if (parsed.action === "add-to-cart") {
              await handleAddToCart(true);
            } else if (parsed.action === "enroll-free") {
              await handleEnrollFree(true);
            }
          } finally {
            isResumingRef.current = false;
          }
        })();
      }
    } catch {
      // Ignore JSON errors
    }
  }, [detail, session?.user, slug]);

  const handleAddToCart = async (isGatedReturn = false) => {
    if (!detail || adding) return;
    if (!isGatedReturn && !session?.user) {
      setPendingIntent("add-to-cart");
      try {
        sessionStorage.setItem(
          "codi_pending_course_intent",
          JSON.stringify({
            action: "add-to-cart",
            courseId: detail.course.id,
            slug,
            createdAt: Date.now(),
          }),
        );
      } catch {}
      setIntentReason(
        "Đăng nhập để thêm khoá học vào giỏ. Sau khi đăng nhập, khoá học sẽ được thêm tự động.",
      );
      setAuthModalOpen(true);
      return;
    }
    if (isPrivilegedRole) {
      toast.warning("Chỉ tài khoản học viên mới thêm được khoá học vào giỏ.");
      return;
    }

    setAdding(true);
    setCartMessage("");
    try {
      const response = await fetch("/api/student/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: detail.course.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setPendingIntent("add-to-cart");
          setIntentReason(
            "Đăng nhập để thêm khoá học vào giỏ. Sau khi đăng nhập, khoá học sẽ được thêm tự động.",
          );
          setAuthModalOpen(true);
          return;
        }
        throw new Error(result.error || "Không thể thêm khóa học vào giỏ.");
      }
      try {
        sessionStorage.removeItem("codi_pending_course_intent");
      } catch {}
      setOwnership({ ownership: "in-cart" });
      const successText = result.added
        ? `Đã thêm “${detail.course.title}” vào giỏ hàng.`
        : "Khóa học đã có trong giỏ hàng.";
      setCartMessage(successText);
      toast.success(successText, {
        action: {
          label: "Xem giỏ hàng",
          onClick: () => router.push("/cart" as any),
        },
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("codi:cart-updated"));
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Không thể kết nối. Vui lòng thử lại.";
      setCartMessage(msg);
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  const handleEnrollFree = async (isGatedReturn = false) => {
    if (!detail || enrolling) return;
    if (!isGatedReturn && !session?.user) {
      setPendingIntent("enroll-free");
      try {
        sessionStorage.setItem(
          "codi_pending_course_intent",
          JSON.stringify({
            action: "enroll-free",
            courseId: detail.course.id,
            slug,
            createdAt: Date.now(),
          }),
        );
      } catch {}
      setIntentReason("Đăng nhập để đăng ký khoá học miễn phí.");
      setAuthModalOpen(true);
      return;
    }
    if (isPrivilegedRole) {
      toast.warning("Chỉ tài khoản học viên mới đăng ký được khoá học.");
      return;
    }

    setEnrolling(true);
    setCartMessage("");
    try {
      const response = await fetch("/api/courses/enroll-free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: detail.course.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setPendingIntent("enroll-free");
          setIntentReason("Đăng nhập để đăng ký khoá học miễn phí.");
          setAuthModalOpen(true);
          return;
        }
        throw new Error(result.error || "Không thể đăng ký khóa học miễn phí.");
      }
      try {
        sessionStorage.removeItem("codi_pending_course_intent");
      } catch {}
      setOwnership({ ownership: "owned" });
      const successText = `Đã đăng ký “${detail.course.title}”.`;
      setCartMessage(successText);
      toast.success(successText);
      router.push(`/learn/${detail.course.id}/onboarding` as any);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Không thể kết nối. Vui lòng thử lại.";
      setCartMessage(msg);
      toast.error(msg);
    } finally {
      setEnrolling(false);
    }
  };

  const handleBuyNow = async (isGatedReturn = false) => {
    if (!detail || adding) return;
    if (!isGatedReturn && !session?.user) {
      setPendingIntent("buy-now");
      try {
        sessionStorage.setItem(
          "codi_pending_course_intent",
          JSON.stringify({
            action: "buy-now",
            courseId: detail.course.id,
            slug,
            createdAt: Date.now(),
          }),
        );
      } catch {}
      setIntentReason("Đăng nhập để mua khoá học.");
      setAuthModalOpen(true);
      return;
    }
    if (isPrivilegedRole) {
      toast.warning("Chỉ tài khoản học viên mới mua được khoá học.");
      return;
    }

    setAdding(true);
    setCartMessage("");
    try {
      const response = await fetch("/api/orders/buy-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: detail.course.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setPendingIntent("buy-now");
          setIntentReason("Đăng nhập để mua khoá học.");
          setAuthModalOpen(true);
          return;
        }
        if (response.status === 409) {
          // Already owned
          try {
            sessionStorage.removeItem("codi_pending_course_intent");
          } catch {}
          setOwnership({ ownership: "owned" });
          toast.success("Bạn đã sở hữu khóa học này.");
          return;
        }
        throw new Error(result.error || "Không thể xử lý mua ngay.");
      }
      try {
        sessionStorage.removeItem("codi_pending_course_intent");
      } catch {}
      // Direct to checkout page with order param
      const targetUrl = `/checkout?order=${encodeURIComponent(result.orderCode || result.orderId)}`;
      window.location.href = targetUrl;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Không thể xử lý mua ngay.";
      setCartMessage(msg);
      toast.error(msg);
    } finally {
      setAdding(false);
    }
  };

  const handleAuthSuccess = async () => {
    setAuthModalOpen(false);
    if (isResumingRef.current) return;
    let intent = pendingIntent;
    if (!intent) {
      try {
        const stored = sessionStorage.getItem("codi_pending_course_intent");
        if (stored) {
          const parsed = JSON.parse(stored);
          intent = parsed.action;
        }
      } catch {}
    }
    setPendingIntent(null);
    try {
      sessionStorage.removeItem("codi_pending_course_intent");
    } catch {}

    if (!intent) return;
    isResumingRef.current = true;

    // Refresh authClient session store to guarantee current credentials
    try {
      await authClient.getSession();
    } catch {
      // Continue anyway
    }

    try {
      if (intent === "add-to-cart") {
        await handleAddToCart(true);
      } else if (intent === "buy-now") {
        await handleBuyNow(true);
      } else if (intent === "enroll-free") {
        await handleEnrollFree(true);
      }
    } finally {
      isResumingRef.current = false;
    }
  };
  const toggleChapter = (id: string) => {
    setOpenChapters((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <CourseDetailSkeleton />;
  }

  if (error || !detail) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <Card className="mx-auto max-w-xl items-center gap-4 rounded-2xl border border-border p-8 text-center bg-card">
            <BookOpen className="size-10 text-muted-foreground mx-auto" />
            <h1 className="text-2xl font-semibold">
              {error?.notFound
                ? "Không tìm thấy khoá học"
                : "Chưa thể tải khoá học"}
            </h1>
            <p role="alert" className="text-sm text-muted-foreground">
              {error?.message}
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {!error?.notFound && (
                <Button
                  onClick={() => setAttempt((v) => v + 1)}
                  className="gap-1.5 cursor-pointer"
                >
                  <RotateCw className="h-4 w-4" />
                  Thử lại
                </Button>
              )}
              <Link
                href="/courses"
                className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Xem danh sách khoá học
              </Link>
            </div>
          </Card>
        </div>
      </main>
    );
  }

  const {
    course,
    chapters,
    summary,
    instructor,
    learningOutcomes,
    requirements,
  } = detail;
  const ownState =
    ownership?.ownership ?? (course.price === 0 ? "free" : "not-owned");
  const levelText = LEVEL_LABELS[course.level] ?? course.level;

  const reviews = detail.reviews ?? [];
  // Calculate star breakdown [5-star, 4-star, 3-star, 2-star, 1-star] from reviews
  const ratingBreakdown = [5, 4, 3, 2, 1].map(
    (stars) => reviews.filter((r) => r.stars === stars).length,
  );
  const totalBreakdown = ratingBreakdown.reduce((sum, n) => sum + n, 0);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* Breadcrumb: Khoá học / Category / Title */}
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link href="/courses">Khoá học</Link>
          <span>/</span>
          <span>{course.category}</span>
          <span>/</span>
          <span className={styles.breadcrumbCurrent} aria-current="page">
            {course.title}
          </span>
        </nav>

        {/* Hidden notice for already-enrolled learners */}
        {course.status === "hidden" && ownState === "owned" && (
          <div
            role="status"
            className="rounded-xl border border-info/30 bg-info/10 p-4 text-xs text-info mb-4"
          >
            <strong className="block font-semibold mb-1">
              Khoá học đang tạm ẩn với người mua mới
            </strong>
            Bạn đã sở hữu khoá học nên vẫn học bình thường.
          </div>
        )}

        <div className={styles.layout}>
          {/* Main Column */}
          <div className={styles.mainCol}>
            {/* Header info */}
            <header className={styles.header}>
              <h1 className={styles.title}>{course.title}</h1>
              <p className={styles.description}>{course.description}</p>

              {/* Meta stats row */}
              <div className={styles.metaRow}>
                <span className={styles.metaItem}>
                  <BarChart3 className="h-4 w-4" />
                  <span>{levelText}</span>
                </span>
                <span className={styles.metaItem}>
                  <Clock className="h-4 w-4" />
                  <span>{course.duration}</span>
                </span>
                <span className={styles.metaItem}>
                  {detail.rating > 0 && detail.reviewCount > 0 ? (
                    <>
                      <Star className={`h-4 w-4 ${styles.starFilled}`} />
                      <strong className="text-foreground">
                        {detail.rating.toFixed(1)}
                      </strong>
                      <span>({detail.reviewCount} đánh giá)</span>
                    </>
                  ) : (
                    <span>Chưa có đánh giá</span>
                  )}
                </span>
                <span className={styles.metaItem}>
                  <Users className="h-4 w-4" />
                  <span>
                    {course.enrollmentCount.toLocaleString("vi-VN")} học viên
                  </span>
                </span>
                {instructor && (
                  <span className={styles.metaItem}>
                    <User className="h-4 w-4" />
                    <span>{instructor.name}</span>
                  </span>
                )}
              </div>
            </header>

            {/* 01 · Bạn sẽ học được gì? */}
            <section
              className={styles.section}
              aria-labelledby="outcomes-heading"
            >
              <h2 id="outcomes-heading" className={styles.sectionTitle}>
                01 · Bạn sẽ học được gì?
              </h2>
              {learningOutcomes.length > 0 ? (
                <div className={styles.outcomesGrid}>
                  {learningOutcomes.map((outcome, idx) => (
                    <div key={idx} className={styles.outcomeItem}>
                      <Check className={`h-4 w-4 ${styles.checkIcon}`} />
                      <span>{outcome}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Giảng viên đang cập nhật mục tiêu khoá học.
                </p>
              )}
            </section>

            {/* 02 · Nội dung khóa học (S02 Syllabus) */}
            <section
              className={styles.section}
              aria-labelledby="curriculum-heading"
            >
              <div className={styles.curriculumHeader}>
                <h2 id="curriculum-heading" className={styles.sectionTitle}>
                  02 · Nội dung khóa học
                </h2>
                {chapters.length > 0 && (
                  <div className={styles.curriculumActions}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenChapters(new Set(chapters.map((ch) => ch.id)))
                      }
                      className={styles.expandBtn}
                    >
                      Mở rộng tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenChapters(new Set())}
                      className={styles.expandBtn}
                    >
                      Thu gọn tất cả
                    </button>
                  </div>
                )}
              </div>

              <p className={styles.curriculumSummary}>
                {chapters.length} chương · {summary.lessonCount} bài học ·{" "}
                {course.duration}
              </p>

              {chapters.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-border bg-muted/20 text-center text-sm text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">
                    Nội dung học đang được chuẩn bị
                  </p>
                  <p>Giảng viên sẽ sớm cập nhật đề cương.</p>
                </div>
              ) : (
                <div className={styles.chaptersList}>
                  {chapters.map((chapter) => {
                    const isOpen = openChapters.has(chapter.id);
                    const chapterDuration = chapter.lessons.reduce(
                      (acc, les) => acc + (les.durationSeconds || 0),
                      0,
                    );
                    const formattedDuration =
                      formatLessonDuration(chapterDuration);

                    return (
                      <div key={chapter.id} className={styles.chapterCard}>
                        <button
                          type="button"
                          onClick={() => toggleChapter(chapter.id)}
                          aria-expanded={isOpen}
                          className={styles.chapterToggle}
                        >
                          <span>{chapter.title}</span>
                          <span className={styles.chapterMeta}>
                            {chapter.lessons.length} bài
                            {formattedDuration ? ` · ${formattedDuration}` : ""}
                          </span>
                        </button>

                        {isOpen && (
                          <ul className={styles.lessonsList}>
                            {chapter.lessons.map((lesson) => {
                              const meta = getLessonTypeMeta(lesson.title);
                              const LessonIcon = getLessonIcon(meta.type);

                              return (
                                <li
                                  key={lesson.id}
                                  className={styles.lessonItem}
                                >
                                  <div className={styles.lessonMain}>
                                    <LessonIcon
                                      className={`h-4 w-4 ${styles.lessonIcon}`}
                                    />
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                                      <span className="font-medium text-foreground">
                                        {lesson.title}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground font-normal">
                                        {meta.label}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {lesson.isFreePreview && (
                                      <span className="inline-flex items-center rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground border border-accent/30">
                                        Học thử
                                      </span>
                                    )}
                                    {lesson.durationSeconds > 0 && (
                                      <span className={styles.lessonDuration}>
                                        {formatLessonDuration(
                                          lesson.durationSeconds,
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 03 · Yêu cầu trước khi học */}
            <section
              className={styles.section}
              aria-labelledby="requirements-heading"
            >
              <h2 id="requirements-heading" className={styles.sectionTitle}>
                03 · Yêu cầu trước khi học
              </h2>
              {requirements.length > 0 ? (
                <ul className={styles.requirementsList}>
                  {requirements.map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Không có yêu cầu đặc biệt.
                </p>
              )}
            </section>

            {/* 04 · Giảng viên */}
            <section
              className={styles.section}
              aria-labelledby="instructor-heading"
            >
              <h2 id="instructor-heading" className={styles.sectionTitle}>
                04 · Giảng viên
              </h2>
              <div className={styles.instructorCard}>
                <div className={styles.instructorAvatar}>
                  {getInitials(instructor?.name)}
                </div>
                <div className={styles.instructorInfo}>
                  <h3>{instructor?.name ?? "Codi"}</h3>
                  <p>{instructor?.title ?? "Giảng viên tại Codi"}</p>
                </div>
              </div>
            </section>

            {/* Đánh giá của học viên */}
            <section
              id="reviews"
              className={styles.section}
              aria-labelledby="reviews-heading"
            >
              <h2 id="reviews-heading" className={styles.sectionTitle}>
                Đánh giá của học viên
              </h2>

              {reviews.length > 0 || detail.reviewCount > 0 ? (
                <>
                  {/* Score breakdown card */}
                  <div className={styles.ratingBox}>
                    <div className={styles.ratingScore}>
                      <span className={styles.scoreNum}>
                        {detail.rating.toFixed(1)}
                      </span>
                      <div className={styles.starsRow}>
                        {Array.from({ length: 5 }).map((_, i) => {
                          const isFilled = i < Math.round(detail.rating);
                          return (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${isFilled ? styles.starFilled : "text-muted-foreground/30 fill-transparent"}`}
                            />
                          );
                        })}
                      </div>
                      <span className={styles.ratingTotal}>
                        {detail.reviewCount} đánh giá
                      </span>
                    </div>

                    {totalBreakdown > 0 ? (
                      <div className={styles.breakdownList}>
                        {[5, 4, 3, 2, 1].map((stars, idx) => {
                          const countVal = ratingBreakdown[idx] ?? 0;
                          const pct = Math.round(
                            (countVal / totalBreakdown) * 100,
                          );
                          return (
                            <div key={stars} className={styles.breakdownRow}>
                              <span className={styles.breakdownLabel}>
                                {stars} sao
                              </span>
                              <div
                                className={styles.breakdownTrack}
                                aria-hidden="true"
                              >
                                <div
                                  className={styles.breakdownFill}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className={styles.breakdownCount}>
                                {countVal}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  {/* Reviews list */}
                  <CourseReviewList reviews={reviews} />
                </>
              ) : (
                <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-muted-foreground">
                  <p className="text-sm font-medium">
                    Chưa có đánh giá nào cho khoá học này.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Đánh giá và nhận xét từ sinh viên đã học sẽ được hiển thị
                    tại đây.
                  </p>
                </div>
              )}
            </section>
          </div>

          {/* Sticky Sidebar (S02 Purchase Card) */}
          <aside className={styles.sidebar} aria-label="Đăng ký khóa học">
            <div className={styles.sidebarCard}>
              <h2 className={styles.sidebarTitle}>Đăng ký khóa học</h2>

              <div className={styles.priceSection}>
                <span className={styles.priceLabel}>Học phí khóa học</span>
                <span className={styles.priceValue}>
                  {course.price === 0
                    ? "Miễn phí"
                    : `${course.price.toLocaleString("vi-VN")} ₫`}
                </span>
              </div>

              {/* Ownership-aware CTA section (Flow L1, §7.2, decision 42) */}
              {isPrivilegedRole ? (
                <p className="text-xs text-muted-foreground">
                  Bạn đang xem với vai trò {userRole === "lecturer" ? "giảng viên" : "quản trị viên"}. Chỉ tài khoản học viên
                  mới mua được khoá học.
                </p>
              ) : ownState === "owned" ? (
                <Link
                  href={`/learn/${course.id}` as any}
                  className={styles.ctaPrimaryBtn}
                >
                  Tiếp tục học
                </Link>
              ) : ownState === "pending-payment" ? (
                <>
                  <div className="rounded-lg bg-warning/10 p-3 text-xs text-warning border border-warning/20">
                    Đơn hàng đang chờ thanh toán.
                  </div>
                  <Link
                    href={
                      (ownership?.pendingOrderId
                        ? `/checkout?order=${ownership.pendingOrderId}`
                        : `/checkout`) as any
                    }
                    className={styles.ctaPrimaryBtn}
                  >
                    Tiếp tục thanh toán
                  </Link>
                </>
              ) : ownState === "in-cart" ? (
                <div className="flex flex-col gap-2.5">
                  <div className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-primary bg-primary/10 rounded-lg py-2">
                    <Check className="h-4 w-4" />
                    Đã trong giỏ hàng
                  </div>
                  <Link href={"/cart" as any} className={styles.ctaPrimaryBtn}>
                    Thanh toán
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleBuyNow()}
                    disabled={adding}
                    className={styles.ctaSecondaryBtn}
                  >
                    Mua ngay
                  </button>
                </div>
              ) : ownState === "free" ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleEnrollFree()}
                    disabled={enrolling}
                    className={styles.ctaPrimaryBtn}
                  >
                    {enrolling ? "Đang xử lý…" : "Đăng ký miễn phí"}
                  </button>
                  <p className="text-xs text-muted-foreground text-center">
                    Khoá miễn phí: vào học ngay, không cần thanh toán.
                  </p>
                </>
              ) : (
                /* Paid course: Mua ngay (primary) + Thêm vào giỏ (secondary) (mockup decision 42) */
                <div className="flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleBuyNow()}
                    disabled={adding}
                    className={styles.ctaPrimaryBtn}
                  >
                    Mua ngay
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddToCart()}
                    disabled={adding}
                    className={styles.ctaSecondaryBtn}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {adding ? "Đang thêm…" : "Thêm vào giỏ"}
                  </button>
                </div>
              )}

              {cartMessage && (
                <p role="status" className="text-xs text-primary font-medium">
                  {cartMessage}
                </p>
              )}

              {/* Facts list */}
              <dl className={styles.factsList}>
                <div className={styles.factRow}>
                  <dt>Trình độ</dt>
                  <dd>{levelText}</dd>
                </div>
                <div className={styles.factRow}>
                  <dt>Số chương</dt>
                  <dd>{chapters.length}</dd>
                </div>
                <div className={styles.factRow}>
                  <dt>Số bài học</dt>
                  <dd>{summary.lessonCount}</dd>
                </div>
                <div className={styles.factRow}>
                  <dt>Thời lượng</dt>
                  <dd>{course.duration}</dd>
                </div>
              </dl>

              {/* AI Advisor Link */}
              <Link
                href={`/ai?prompt=${encodeURIComponent(`Khoá "${course.title}" có phù hợp với tôi không?`)}`}
                className={styles.aiAdvisorLink}
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                <span>Hỏi trợ lý AI Codi</span>
              </Link>
            </div>
          </aside>
        </div>
      </div>

      {/* S03 Gated Sign-in / OTP Modal */}
      <AuthModal
        open={authModalOpen}
        onOpenChange={(open) => {
          setAuthModalOpen(open);
          if (!open) {
            setPendingIntent(null);
            try {
              sessionStorage.removeItem("codi_pending_course_intent");
            } catch {}
          }
        }}
        returnTo={`/courses/${course.slug}`}
        intentReason={intentReason}
        courseTitle={detail?.course.title}
        onSuccess={handleAuthSuccess}
      />
    </main>
  );
}
