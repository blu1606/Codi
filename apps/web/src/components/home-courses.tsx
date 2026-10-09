"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, BookOpen, BrainCircuit, Braces, Clock3,
  Code2, Database, GitBranch, Smartphone, Users,
} from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Card } from "@codi-1/ui/components/card";
import { cn } from "@codi-1/ui/lib/utils";
import { fetchCourses, type CatalogCourse } from "@/lib/course-catalog";
import HomeScrollReveal from "./home-scroll-reveal";
import styles from "./home-courses.module.css";

const covers: Record<string, { icon: typeof Code2; tone: string }> = {
  Frontend: { icon: Braces, tone: "frontend" },
  Backend: { icon: Database, tone: "backend" },
  Fullstack: { icon: Code2, tone: "frontend" },
  "Data & AI": { icon: BrainCircuit, tone: "ai" },
  Mobile: { icon: Smartphone, tone: "mobile" },
  "Computer Science": { icon: GitBranch, tone: "backend" },
};
const levels: Record<string, string> = {
  Beginner: "Cơ bản", Intermediate: "Trung cấp", Advanced: "Nâng cao",
};

export default function HomeCourses() {
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchCourses(controller.signal, "?sort=popular&limit=4")
      .then((data) => { if (!controller.signal.aborted) setCourses(data); })
      .catch(() => {
        if (!controller.signal.aborted) setError("Không thể tải khóa học. Vui lòng thử lại.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  return (
    <section aria-labelledby="home-courses-title" className={cn(styles.section, "w-full bg-background py-16 sm:py-20")}>
      <div className="mx-auto max-w-7xl px-6 lg:px-16">
        <HomeScrollReveal className="mb-9 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-block rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold leading-none text-primary uppercase">
              Khóa học
            </span>
            <h2 id="home-courses-title" className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Khóa học phổ biến nhất
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Khám phá các khóa học được nhiều học viên lựa chọn nhất.
            </p>
          </div>
          <Link href="/courses" className="inline-flex shrink-0 items-center gap-2 rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            Xem tất cả khóa học <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </HomeScrollReveal>

        {loading ? (
          <div role="status" aria-label="Đang tải khóa học">
            <span className="sr-only">Đang tải khóa học…</span>
            <div aria-hidden="true" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Card key={index} className="gap-0 overflow-hidden rounded-xl p-0 ring-0">
                  <div className="aspect-[1.9] animate-pulse bg-muted motion-reduce:animate-none" />
                  <div className="space-y-4 p-4">
                    <div className="h-4 w-16 rounded bg-muted" />
                    <div className="h-10 rounded bg-muted" />
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="h-8 rounded-lg bg-muted" />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ) : error ? (
          <Card className="items-center gap-4 rounded-xl border-dashed p-8 text-center ring-0">
            <p role="alert" className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)} className="rounded-lg">Thử lại</Button>
          </Card>
        ) : courses.length === 0 ? (
          <Card className="items-center gap-3 rounded-xl border-dashed p-8 text-center ring-0">
            <BookOpen aria-hidden="true" className="size-7 text-primary" />
            <p role="status" className="text-sm text-muted-foreground">Các khóa học sẽ sớm được cập nhật. Hãy quay lại sau nhé!</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {courses.map((course, index) => {
              const { icon: Icon, tone } = covers[course.category] ?? { icon: Code2, tone: "frontend" };
              return (
                <HomeScrollReveal key={course.id} delay={index * 0.08} className="h-full">
                  <Card className="group flex h-full flex-col gap-0 overflow-hidden rounded-xl border-border bg-card p-0 ring-0 transition-colors hover:border-primary/50">
                    <div aria-hidden="true" className={styles.cover} data-tone={tone}>
                      {course.coverImageUrl ? (
                        <Image
                          src={course.coverImageUrl}
                          alt=""
                          fill
                          sizes="(min-width: 1280px) 260px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className={styles.coverPanel}>
                          <span className={styles.coverLabel}>{course.category}</span>
                          <div className={styles.coverArt}>
                            <span className={styles.codeLines}><i /><i /><i /></span>
                            <Icon className={styles.coverIcon} strokeWidth={1.25} />
                            <span className={styles.codeLines}><i /><i /><i /></span>
                          </div>
                          <span className={styles.coverCaption}>CODI / LEARN BY BUILDING</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <span className={styles.level} data-level={course.level}>{levels[course.level] ?? course.level}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Số học viên đã đăng ký">
                          <Users aria-hidden="true" className="size-3.5" />
                          {course.enrollmentCount.toLocaleString("vi-VN")} học viên
                        </span>
                      </div>
                      <h3 className="mb-3 line-clamp-3 min-h-10 text-sm leading-5 font-bold text-foreground" title={course.title}>
                        {course.title}
                      </h3>
                      <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock3 aria-hidden="true" className="size-4 shrink-0" />
                        <span>{course.duration}</span>
                      </div>
                      <div className="mt-auto border-t border-border/50 pt-3">
                        <Button
                          variant="outline"
                          nativeButton={false}
                          render={<Link href={`/courses/${encodeURIComponent(course.slug)}`} />}
                          className="w-full rounded-lg border-primary/70 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary dark:bg-primary/10 dark:hover:bg-primary/20"
                          aria-label={`Bắt đầu học: ${course.title}`}
                        >
                          Bắt đầu học
                        </Button>
                      </div>
                    </div>
                  </Card>
                </HomeScrollReveal>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
