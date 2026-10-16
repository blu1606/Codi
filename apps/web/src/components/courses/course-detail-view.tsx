"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  Clock,
  Clock3,
  FileText,
  MessageCircle,
  Presentation,
  RotateCw,
  ShoppingCart,
  Sparkles,
  Star,
  Terminal,
  User,
  Users,
  Video,
} from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Card } from "@codi-1/ui/components/card";
import { authClient } from "@/lib/auth-client";
import {
  CourseDetailError,
  fetchCourseDetail,
  formatLessonDuration,
  type CourseDetail,
} from "@/lib/course-details";
import type { CourseOwnershipDetail } from "@/lib/course-ownership";
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
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getLessonIcon(title: string) {
  const lower = title.toLowerCase();
  if (
    lower.includes("video") ||
    lower.includes("giới thiệu") ||
    lower.includes("cài đặt") ||
    lower.includes("state") ||
    lower.includes("props") ||
    lower.includes("useeffect") ||
    lower.includes("router cơ bản") ||
    lower.includes("component") ||
    lower.includes("gọi api")
  ) {
    return Video;
  }
  if (
    lower.includes("thử thách") ||
    lower.includes("luyện tập") ||
    lower.includes("code") ||
    lower.includes("reducer")
  ) {
    return Terminal;
  }
  if (lower.includes("pdf") || lower.includes("slide") || lower.includes("sự kiện") || lower.includes("context api")) {
    return Presentation;
  }
  return BookOpen;
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
  const [ownership, setOwnership] = useState<CourseOwnershipDetail | null>(null);
  const [adding, setAdding] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [cartMessage, setCartMessage] = useState("");

  const userRole = (session?.user as { role?: string } | undefined)?.role ?? null;
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

  const handleAddToCart = async () => {
    if (!detail || adding || sessionLoading) return;
    if (!session?.user) {
      router.push("/login");
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
      if (!response.ok) throw new Error(result.error || "Không thể thêm khóa học vào giỏ.");
      setOwnership({ ownership: "in-cart" });
      setCartMessage(result.added ? `Đã thêm “${detail.course.title}” vào giỏ hàng.` : "Khóa học đã có trong giỏ hàng.");
    } catch (err: unknown) {
      setCartMessage(err instanceof Error ? err.message : "Không thể kết nối. Vui lòng thử lại.");
    } finally {
      setAdding(false);
    }
  };

  const handleEnrollFree = async () => {
    if (!detail || enrolling || sessionLoading) return;
    if (!session?.user) {
      router.push("/login");
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
      if (!response.ok) throw new Error(result.error || "Không thể đăng ký khóa học miễn phí.");
      setOwnership({ ownership: "owned" });
      setCartMessage(`Đăng ký thành công “${detail.course.title}”! Bạn có thể bắt đầu học ngay.`);
    } catch (err: unknown) {
      setCartMessage(err instanceof Error ? err.message : "Không thể kết nối. Vui lòng thử lại.");
    } finally {
      setEnrolling(false);
    }
  };

  const handleBuyNow = async () => {
    if (!detail || sessionLoading) return;
    if (!session?.user) {
      router.push("/login" as any);
      return;
    }
    // Add to cart and redirect straight to cart/checkout
    await handleAddToCart();
    router.push("/cart" as any);
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
    return (
      <main className={styles.page} aria-busy="true">
        <div className={styles.container}>
          <div className="space-y-6 motion-safe:animate-pulse">
            <div className="h-4 w-48 rounded bg-muted" />
            <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
              <div className="space-y-6">
                <div className="h-10 w-3/4 rounded bg-muted" />
                <div className="h-16 rounded bg-muted" />
                <div className="h-40 rounded-xl bg-muted" />
                <div className="h-64 rounded-xl bg-muted" />
              </div>
              <div className="h-80 rounded-xl bg-muted" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !detail) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <Card className="mx-auto max-w-xl items-center gap-4 rounded-2xl border border-border p-8 text-center bg-card">
            <BookOpen className="size-10 text-muted-foreground mx-auto" />
            <h1 className="text-2xl font-bold">
              {error?.notFound ? "Không tìm thấy khoá học" : "Chưa thể tải khoá học"}
            </h1>
            <p role="alert" className="text-sm text-muted-foreground">
              {error?.message}
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {!error?.notFound && (
                <Button onClick={() => setAttempt((v) => v + 1)} className="gap-1.5 cursor-pointer">
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

  const { course, chapters, summary, instructor, learningOutcomes, requirements } = detail;
  const ownState = ownership?.ownership ?? (course.price === 0 ? "free" : "not-owned");
  const allExpanded = chapters.length > 0 && chapters.every((ch) => openChapters.has(ch.id));
  const levelText = LEVEL_LABELS[course.level] ?? course.level;

  const ratingBreakdown = detail.ratingBreakdown ?? [92, 24, 8, 3, 1];
  const totalBreakdown = ratingBreakdown.reduce((sum, n) => sum + n, 0) || 1;
  const reviews = detail.reviews ?? [];

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

        <div className={styles.layout}>
          {/* Main Column */}
          <div className={styles.mainCol}>
            {/* Header info */}
            <header className={styles.header}>
              <h1 className={styles.title}>{course.title}</h1>
              <p className={styles.description}>{course.description}</p>

              {/* Meta stats row matching Screenshot 1 */}
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
                  <Star className={`h-4 w-4 ${styles.starFilled}`} />
                  <strong className="text-foreground">{detail.rating.toFixed(1)}</strong>
                  <span>({detail.reviewCount} đánh giá)</span>
                </span>
                <span className={styles.metaItem}>
                  <Users className="h-4 w-4" />
                  <span>{course.enrollmentCount.toLocaleString("vi-VN")} học viên</span>
                </span>
                {instructor && (
                  <span className={styles.metaItem}>
                    <User className="h-4 w-4" />
                    <span>{instructor.name}</span>
                  </span>
                )}
              </div>
            </header>

            {/* 01 · Bạn sẽ học được gì? (Screenshot 1) */}
            <section className={styles.section} aria-labelledby="outcomes-heading">
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

            {/* 02 · Nội dung khóa học (Screenshot 1) */}
            <section className={styles.section} aria-labelledby="curriculum-heading">
              <div className={styles.curriculumHeader}>
                <h2 id="curriculum-heading" className={styles.sectionTitle}>
                  02 · Nội dung khóa học
                </h2>
                {chapters.length > 0 && (
                  <div className={styles.curriculumActions}>
                    <button
                      type="button"
                      onClick={() => setOpenChapters(new Set(chapters.map((ch) => ch.id)))}
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
                {chapters.length} chương · {summary.lessonCount} bài học · {course.duration}
              </p>

              {chapters.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
                  Nội dung học đang được chuẩn bị. Giảng viên sẽ sớm cập nhật đề cương.
                </div>
              ) : (
                <div className={styles.chaptersList}>
                  {chapters.map((chapter, i) => {
                    const isOpen = openChapters.has(chapter.id);
                    const chapterDuration = chapter.lessons.reduce(
                      (acc, les) => acc + (les.durationSeconds || 0),
                      0
                    );
                    const formattedDuration = formatLessonDuration(chapterDuration);

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
                            {chapter.lessons.length} bài{formattedDuration ? ` · ${formattedDuration}` : ""}
                          </span>
                        </button>

                        {isOpen && (
                          <ul className={styles.lessonsList}>
                            {chapter.lessons.map((lesson) => {
                              const LessonIcon = getLessonIcon(lesson.title);
                              return (
                                <li key={lesson.id} className={styles.lessonItem}>
                                  <div className={styles.lessonMain}>
                                    <LessonIcon className={`h-4 w-4 ${styles.lessonIcon}`} />
                                    <span>{lesson.title}</span>
                                  </div>
                                  {lesson.durationSeconds > 0 && (
                                    <span className={styles.lessonDuration}>
                                      {formatLessonDuration(lesson.durationSeconds)}
                                    </span>
                                  )}
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

            {/* 03 · Yêu cầu trước khi học (Screenshot 2) */}
            <section className={styles.section} aria-labelledby="requirements-heading">
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
                <p className="text-sm text-muted-foreground">Không có yêu cầu đặc biệt.</p>
              )}
            </section>

            {/* 04 · Giảng viên (Screenshot 2) */}
            <section className={styles.section} aria-labelledby="instructor-heading">
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

            {/* Đánh giá của học viên (Screenshot 2) */}
            <section className={styles.section} aria-labelledby="reviews-heading">
              <h2 id="reviews-heading" className={styles.sectionTitle}>
                Đánh giá của học viên
              </h2>

              {/* Reviews section */}
              {detail.reviewCount > 0 ? (
                <>
                  {/* Score breakdown card */}
                  <div className={styles.ratingBox}>
                    <div className={styles.ratingScore}>
                      <span className={styles.scoreNum}>{detail.rating.toFixed(1)}</span>
                      <div className={styles.starsRow}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-4 w-4 ${styles.starFilled}`} />
                        ))}
                      </div>
                      <span className={styles.ratingTotal}>{detail.reviewCount} đánh giá</span>
                    </div>

                    <div className={styles.breakdownList}>
                      {[5, 4, 3, 2, 1].map((stars, idx) => {
                        const countVal = ratingBreakdown[idx] ?? 0;
                        const pct = totalBreakdown > 0 ? Math.round((countVal / totalBreakdown) * 100) : 0;
                        return (
                          <div key={stars} className={styles.breakdownRow}>
                            <span className={styles.breakdownLabel}>{stars} sao</span>
                            <div className={styles.breakdownTrack} aria-hidden="true">
                              <div
                                className={styles.breakdownFill}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className={styles.breakdownCount}>{countVal}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Reviews list */}
                  {reviews.length > 0 ? (
                    <div className={styles.reviewsList}>
                      {reviews.map((r) => (
                        <div key={r.id} className={styles.reviewCard}>
                          <div className={styles.reviewHeader}>
                            <div className={styles.userAvatar}>
                              {getInitials(r.userName)}
                            </div>
                            <span className={styles.userName}>{r.userName}</span>
                            <div className={styles.starsRow}>
                              {Array.from({ length: r.stars }).map((_, i) => (
                                <Star key={i} className={`h-3.5 w-3.5 ${styles.starFilled}`} />
                              ))}
                            </div>
                            <span className={styles.reviewDate}>{r.createdAt}</span>
                          </div>

                          {r.text && <p className={styles.reviewText}>{r.text}</p>}

                          {r.reply && (
                            <div className={styles.replyBox}>
                              <div className={styles.replyHeader}>
                                <MessageCircle className="h-3.5 w-3.5" />
                                <span>Phản hồi của giảng viên</span>
                                <span className={styles.replyBadge}>Giảng viên</span>
                              </div>
                              <p className={styles.replyText}>{r.reply.text}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có đánh giá nào.</p>
              )}
            </section>
          </div>

          {/* Sticky Sidebar matching Screenshots 1 & 2 */}
          <aside className={styles.sidebar} aria-label="Đăng ký khóa học">
            <div className={styles.sidebarCard}>
              <h2 className={styles.sidebarTitle}>Đăng ký khóa học</h2>

              <div className={styles.priceSection}>
                <span className={styles.priceLabel}>Học phí khóa học</span>
                <span className={styles.priceValue}>
                  {course.price === 0 ? "Miễn phí" : `${course.price.toLocaleString("vi-VN")} ₫`}
                </span>
              </div>

              {/* Ownership-aware CTA section */}
              {isPrivilegedRole ? (
                <p className="text-xs text-muted-foreground">
                  Bạn đang xem với vai trò {userRole === "lecturer" ? "giảng viên" : "quản trị viên"}. Chỉ tài khoản học viên mới mua được khoá học.
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
                    href={(ownership?.pendingOrderId ? `/checkout?order=${ownership.pendingOrderId}` : "/checkout") as any}
                    className={styles.ctaPrimaryBtn}
                  >
                    Tiếp tục thanh toán
                  </Link>
                </>
              ) : ownState === "in-cart" ? (
                <>
                  <button type="button" disabled className={styles.ctaSecondaryBtn}>
                    <Check className="h-4 w-4" />
                    Đã trong giỏ hàng
                  </button>
                  <Link href={"/cart" as any} className={styles.ctaPrimaryBtn}>
                    Xem giỏ hàng / Thanh toán
                  </Link>
                </>
              ) : ownState === "free" ? (
                <>
                  <button
                    type="button"
                    onClick={handleEnrollFree}
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
                    onClick={handleBuyNow}
                    disabled={adding}
                    className={styles.ctaPrimaryBtn}
                  >
                    Mua ngay
                  </button>
                  <button
                    type="button"
                    onClick={handleAddToCart}
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
    </main>
  );
}
