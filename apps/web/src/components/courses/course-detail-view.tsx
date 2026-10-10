"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, BookOpen, BrainCircuit, Braces, Check,
  ChevronDown, ChevronRight, Clock3, Code2, Database, FileText,
  GitBranch, GraduationCap, Layers3, Loader2, ShoppingBag, Smartphone, Sparkles, Users,
} from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Card } from "@codi-1/ui/components/card";
import { authClient } from "@/lib/auth-client";
import { CourseDetailError, fetchCourseDetail, formatLessonDuration, type CourseDetail } from "@/lib/course-details";
import styles from "./course-detail.module.css";

const levels: Record<string, string> = { Beginner: "Cơ bản", Intermediate: "Trung cấp", Advanced: "Nâng cao" };
const icons: Record<string, typeof Code2> = {
  Frontend: Braces, Backend: Database, Fullstack: Code2,
  "Data & AI": BrainCircuit, Mobile: Smartphone, "Computer Science": GitBranch,
};

export default function CourseDetailView({ slug }: { slug: string }) {
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = authClient.useSession();
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [inCart, setInCart] = useState(false);
  const [cartMessage, setCartMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchCourseDetail(slug, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setDetail(data);
        setOpenChapters(new Set(data.chapters.slice(0, 1).map((chapter) => chapter.id)));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError({
          message: err instanceof Error ? err.message : "Không thể tải khóa học. Vui lòng thử lại.",
          notFound: err instanceof CourseDetailError && err.status === 404,
        });
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, attempt]);

  const handleAddToCart = async () => {
    if (!detail || adding || sessionLoading || inCart) return;
    if (!session?.user) { router.push("/login"); return; }
    setAdding(true);
    setCartMessage("");
    try {
      const response = await fetch("/api/student/cart", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: detail.course.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể thêm khóa học vào giỏ.");
      setInCart(true);
      setCartMessage(result.added ? "Đã thêm khóa học vào giỏ của bạn." : "Khóa học đã có trong giỏ của bạn.");
    } catch (err: unknown) {
      setCartMessage(err instanceof Error ? err.message : "Không thể kết nối. Vui lòng thử lại.");
    } finally { setAdding(false); }
  };

  const toggleChapter = (id: string) => setOpenChapters((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (loading) return (
    <main className={styles.page} aria-busy="true">
      <div className={styles.container} role="status">
        <span className="sr-only">Đang tải thông tin khóa học…</span>
        <div aria-hidden="true" className="space-y-8 motion-safe:animate-pulse">
          <div className="h-4 w-48 rounded bg-muted" />
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6"><div className="h-24 max-w-2xl rounded-xl bg-muted" /><div className="h-12 rounded bg-muted" /><div className="h-64 rounded-2xl bg-muted" /></div>
            <div className="h-96 rounded-2xl bg-muted" />
          </div>
        </div>
      </div>
    </main>
  );

  if (error || !detail) return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Card className="mx-auto max-w-xl items-center gap-4 rounded-2xl border border-border p-8 text-center ring-0">
          <BookOpen aria-hidden="true" className="size-10 text-muted-foreground" />
          <h1 className="text-2xl font-semibold">{error?.notFound ? "Không tìm thấy khóa học" : "Chưa thể tải khóa học"}</h1>
          <p role="alert" className="text-sm text-muted-foreground">{error?.message}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {!error?.notFound && <Button onClick={() => setAttempt((value) => value + 1)} className="h-10 rounded-lg px-4">Thử lại</Button>}
            <Button variant="outline" nativeButton={false} render={<Link href="/courses" />} className="h-10 rounded-lg px-4">Xem các khóa học</Button>
          </div>
        </Card>
      </div>
    </main>
  );

  const { course, chapters, summary } = detail;
  const Icon = icons[course.category] ?? Code2;
  const allExpanded = chapters.length > 0 && chapters.every((chapter) => openChapters.has(chapter.id));
  const level = levels[course.level] ?? course.level;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav aria-label="Đường dẫn" className={styles.breadcrumb}>
          <Link href="/courses"><ArrowLeft aria-hidden="true" className="size-4" /> Khóa học</Link>
          <ChevronRight aria-hidden="true" className="size-3.5" />
          <span>{course.category}</span>
        </nav>

        <div className={styles.layout}>
          <header id="overview" className={styles.intro}>
            <div className={styles.badges}>
              <span className={styles.category}><Icon aria-hidden="true" className="size-3.5" />{course.category}</span>
              <span className={styles.level}>{level}</span>
            </div>
            <h1 className={styles.title}>{course.title}</h1>
            <p className={styles.description}>{course.description}</p>
            <div className={styles.metadata}>
              <span><Users aria-hidden="true" className="size-4" /><strong>{course.enrollmentCount.toLocaleString("vi-VN")}</strong> học viên đã đăng ký</span>
              <span><Clock3 aria-hidden="true" className="size-4" />{course.duration}</span>
            </div>
            <nav aria-label="Các phần của khóa học" className={styles.sectionNav}>
              <a href="#outcomes">Bạn sẽ học được gì</a>
              <a href="#curriculum">Nội dung khóa học</a>
              <a href="#requirements">Yêu cầu</a>
            </nav>
          </header>

          <aside className={styles.sidebar} aria-label="Đăng ký khóa học">
            <Card className={styles.enrollmentCard}>
              {detail.introVideoUrl && detail.introVideoCaptionsUrl ? (
                <video className={styles.cover} controls crossOrigin="anonymous" preload="metadata" poster={detail.coverImageUrl ?? undefined} aria-label={`Giới thiệu: ${course.title}`} src={detail.introVideoUrl}>
                  <track kind="captions" src={detail.introVideoCaptionsUrl} srcLang="vi" label="Tiếng Việt" default />
                </video>
              ) : (
                <div className={styles.cover}>
                  {detail.coverImageUrl ? (
                    <Image src={detail.coverImageUrl} alt={course.title} fill sizes="(max-width: 1024px) 100vw, 360px" className="object-cover" unoptimized />
                  ) : (
                    <div className={styles.coverArt} aria-hidden="true">
                      <span className={styles.coverBrand}>CODI <span>/ COURSE</span></span>
                      <Icon className={styles.coverIcon} strokeWidth={1.2} />
                      <span className={styles.coverCategory}>{course.category}</span>
                      <span className={styles.coverCode}>{"{ learn. build. grow. }"}</span>
                    </div>
                  )}
                </div>
              )}
              <div className={styles.cardBody}>
                <p className={styles.priceLabel}>Học phí khóa học</p>
                <p className={styles.price}>{course.price === 0 ? "Miễn phí" : `${course.price.toLocaleString("vi-VN")} ₫`}</p>
                <Button onClick={handleAddToCart} disabled={adding || sessionLoading || inCart} className={styles.enrollButton}>
                  {adding ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <ShoppingBag aria-hidden="true" className="size-4" />}
                  {inCart ? "Đã trong giỏ hàng" : "Thêm vào giỏ"}
                  {!adding && !inCart && <ArrowRight aria-hidden="true" className="ml-auto size-4" />}
                </Button>
                {cartMessage && <p role="status" className="mt-3 text-sm leading-6 text-muted-foreground">{cartMessage}</p>}
                <dl className={styles.facts}>
                  <div><dt><GraduationCap aria-hidden="true" className="size-4" />Trình độ</dt><dd>{level}</dd></div>
                  <div><dt><Layers3 aria-hidden="true" className="size-4" />Số chương</dt><dd>{summary.chapterCount}</dd></div>
                  <div><dt><BookOpen aria-hidden="true" className="size-4" />Số bài học</dt><dd>{summary.lessonCount}</dd></div>
                  <div><dt><Clock3 aria-hidden="true" className="size-4" />Thời lượng</dt><dd>{course.duration}</dd></div>
                </dl>
                <p className={styles.cardNote}>Xem nội dung và yêu cầu bên dưới để chọn khóa học phù hợp với bạn.</p>
              </div>
            </Card>
            <Link href={`/ai?topic=${encodeURIComponent(course.title)}`} className={styles.advisor}>
              <Sparkles aria-hidden="true" className="size-4 shrink-0" />
              <span>Chưa chắc khóa học phù hợp?<strong>Hỏi trợ lý AI Codi</strong></span>
              <ArrowRight aria-hidden="true" className="ml-auto size-4" />
            </Link>
          </aside>

          <div className={styles.content}>
            <section id="outcomes" className={styles.section} aria-labelledby="outcomes-title">
              <div className={styles.sectionHeading}><span className={styles.sectionNumber}>01</span><h2 id="outcomes-title">Bạn sẽ học được gì?</h2></div>
              {detail.learningOutcomes.length > 0 ? (
                <ul className={styles.outcomes}>
                  {detail.learningOutcomes.map((outcome, index) => <li key={index}><Check aria-hidden="true" className="size-4 shrink-0" /><span>{outcome}</span></li>)}
                </ul>
              ) : <p className={styles.emptyText}>Mục tiêu học tập của khóa học đang được cập nhật.</p>}
              {detail.targetAudience && <div className={styles.audience}><h3>Khóa học dành cho ai?</h3><p>{detail.targetAudience}</p></div>}
            </section>

            <section id="curriculum" className={styles.section} aria-labelledby="curriculum-title">
              <div className={styles.sectionHeading}><span className={styles.sectionNumber}>02</span><h2 id="curriculum-title">Nội dung khóa học</h2></div>
              <div className={styles.curriculumToolbar}>
                <p><strong>{summary.chapterCount}</strong> chương <span>·</span> <strong>{summary.lessonCount}</strong> bài học{summary.durationSeconds > 0 && <> <span>·</span> {formatLessonDuration(summary.durationSeconds)}</>}</p>
                {chapters.length > 0 && <button type="button" onClick={() => setOpenChapters(allExpanded ? new Set() : new Set(chapters.map((chapter) => chapter.id)))}>{allExpanded ? "Thu gọn tất cả" : "Mở rộng tất cả"}</button>}
              </div>
              {chapters.length === 0 ? (
                <Card className={styles.emptyCurriculum}>
                  <span className={styles.emptyIcon}><BookOpen aria-hidden="true" className="size-6" /></span>
                  <h3>Nội dung học đang được chuẩn bị</h3>
                  <p>Chương và bài học sẽ xuất hiện tại đây khi được công bố. Bạn có thể xem thông tin khóa học và quay lại sau.</p>
                </Card>
              ) : (
                <div className={styles.chapters}>
                  {chapters.map((chapter, index) => (
                    <div key={chapter.id} className={styles.chapter}>
                      <h3>
                        <button type="button" aria-expanded={openChapters.has(chapter.id)} aria-controls={`chapter-${chapter.id}`} onClick={() => toggleChapter(chapter.id)} className={styles.chapterToggle}>
                          <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
                          <span>{index + 1}. {chapter.title}</span>
                          <small>{chapter.lessons.length} bài học</small>
                        </button>
                      </h3>
                      <div id={`chapter-${chapter.id}`} hidden={!openChapters.has(chapter.id)}>
                        {chapter.lessons.length === 0 ? <p className={styles.emptyChapter}>Bài học trong chương đang được cập nhật.</p> : (
                          <ol className={styles.lessons}>
                            {chapter.lessons.map((lesson, lessonIndex) => <li key={lesson.id}>
                              <FileText aria-hidden="true" className="size-4 shrink-0" />
                              <div><p>{index + 1}.{lessonIndex + 1} {lesson.title}</p>{lesson.description && <span>{lesson.description}</span>}</div>
                              {lesson.durationSeconds > 0 && <time>{formatLessonDuration(lesson.durationSeconds)}</time>}
                            </li>)}
                          </ol>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section id="requirements" className={styles.section} aria-labelledby="requirements-title">
              <div className={styles.sectionHeading}><span className={styles.sectionNumber}>03</span><h2 id="requirements-title">Yêu cầu trước khi học</h2></div>
              {detail.requirements.length > 0 ? <ul className={styles.requirements}>{detail.requirements.map((requirement, index) => <li key={index}>{requirement}</li>)}</ul> : <p className={styles.emptyText}>Thông tin về kiến thức và công cụ cần chuẩn bị đang được cập nhật.</p>}
            </section>
            <Link href="/courses" className={styles.backLink}><ArrowLeft aria-hidden="true" className="size-4" /> Khám phá các khóa học khác</Link>
          </div>
        </div>
      </div>
    </main>
  );
}
