"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, Check, Clock, Clock3, ShoppingCart, Star } from "lucide-react";
import type { CatalogCourse } from "@/lib/course-catalog";
import type { CourseOwnershipDetail } from "@/lib/course-ownership";
import styles from "./catalog-course-card.module.css";

const BRAND_MAP: Record<string, { logo: string; bg: string; name: string }> = {
  "course-react-001": { logo: "/logos/react.svg", bg: "#20232a", name: "React" },
  "react-tu-co-ban-den-du-an-thuc-te": { logo: "/logos/react.svg", bg: "#20232a", name: "React" },
  "course-js-001": { logo: "/logos/javascript.svg", bg: "#f7df1e", name: "JavaScript" },
  "javascript-nen-tang": { logo: "/logos/javascript.svg", bg: "#f7df1e", name: "JavaScript" },
  "course-node-001": { logo: "/logos/nodedotjs.svg", bg: "#233056", name: "Node.js" },
  "nodejs-express-rest-api": { logo: "/logos/nodedotjs.svg", bg: "#233056", name: "Node.js" },
  "course-python-001": { logo: "/logos/python.svg", bg: "#306998", name: "Python" },
  "python-phan-tich-du-lieu": { logo: "/logos/python.svg", bg: "#306998", name: "Python" },
  "course-git-001": { logo: "/logos/git.svg", bg: "#f05032", name: "Git" },
  "git-github-cho-nguoi-moi": { logo: "/logos/git.svg", bg: "#f05032", name: "Git" },
  "course-ts-001": { logo: "/logos/typescript.svg", bg: "#3178c6", name: "TypeScript" },
  "typescript-chuyen-sau": { logo: "/logos/typescript.svg", bg: "#3178c6", name: "TypeScript" },
  "course-next-001": { logo: "/logos/nextdotjs.svg", bg: "#000000", name: "Next.js" },
  "nextjs-app-router-thuc-chien": { logo: "/logos/nextdotjs.svg", bg: "#000000", name: "Next.js" },
  "course-jest-001": { logo: "/logos/jest.svg", bg: "#99425b", name: "Jest" },
  "kiem-thu-voi-jest": { logo: "/logos/jest.svg", bg: "#99425b", name: "Jest" },
};

const LEVEL_LABELS: Record<string, string> = {
  Beginner: "Cơ bản",
  Intermediate: "Trung cấp",
  Advanced: "Nâng cao",
  "Cơ bản": "Cơ bản",
  "Trung cấp": "Trung cấp",
  "Nâng cao": "Nâng cao",
};

function getLecturerName(course: CatalogCourse): string {
  if (course.instructorName) return course.instructorName;
  if (
    course.instructorId === "usr-lecturer-001" ||
    course.slug?.includes("react") ||
    course.slug?.includes("javascript")
  ) {
    return "Trần Quốc Huy";
  }
  if (
    course.instructorId === "usr-lecturer-002" ||
    course.slug?.includes("node") ||
    course.slug?.includes("python") ||
    course.slug?.includes("git")
  ) {
    return "Lê Thu Hà";
  }
  return "Codi";
}

interface Props {
  course: CatalogCourse;
  ownership?: CourseOwnershipDetail;
  userRole?: string | null;
  adding?: boolean;
  enrolling?: boolean;
  onAddToCart: (course: CatalogCourse) => void;
  onEnrollFree: (course: CatalogCourse) => void;
}

export function CatalogCourseCard({
  course,
  ownership,
  userRole,
  adding = false,
  enrolling = false,
  onAddToCart,
  onEnrollFree,
}: Props) {
  const href = `/courses/${encodeURIComponent(course.slug)}` as const;
  const ownState = ownership?.ownership ?? (course.price === 0 ? "free" : "not-owned");
  const isPrivilegedRole = userRole === "lecturer" || userRole === "admin";
  const brand = BRAND_MAP[course.id] || BRAND_MAP[course.slug];

  return (
    <article className={styles.card} data-testid={`course-card-${course.id}`}>
      <Link href={href} className={styles.coverLink} aria-label={`Xem chi tiết: ${course.title}`} style={{ backgroundColor: brand?.bg ?? "#1e293b" }}>
        {brand?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logo}
            alt={brand.name}
            className={styles.thumbLogo}
          />
        ) : course.coverImageUrl ? (
          <Image
            src={course.coverImageUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 290px, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
            className={styles.coverImage}
            unoptimized
          />
        ) : (
          <BookOpen className="h-10 w-10 text-muted-foreground" />
        )}
      </Link>

      <div className={styles.content}>
        {/* Badges row */}
        <div className={styles.tags}>
          <span className={`${styles.badge} ${styles.badgeNeutral}`}>
            {LEVEL_LABELS[course.level] ?? course.level}
          </span>
          {ownState === "owned" && (
            <span className={`${styles.badge} ${styles.badgeSuccess}`}>
              <Check className="h-3 w-3" />
              Đã sở hữu
            </span>
          )}
          {ownState === "in-cart" && (
            <span className={`${styles.badge} ${styles.badgeAccent}`}>
              Trong giỏ
            </span>
          )}
        </div>

        {/* Course title */}
        <h3 className={styles.title}>
          <Link href={href}>{course.title}</Link>
        </h3>

        {/* Lecturer */}
        <p className={styles.author}>{getLecturerName(course)}</p>

        {/* Duration & Rating */}
        <div className={styles.metadata}>
          <span className={styles.metaItem}>
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
            {course.duration}
          </span>
          {course.rating > 0 ? (
            <span className={styles.metaItem}>
              <Star className={styles.starIcon} />
              <span className={styles.ratingText}>{course.rating.toFixed(1)}</span>
              <span>({course.reviewCount})</span>
            </span>
          ) : (
            <span>Chưa có đánh giá</span>
          )}
        </div>

        {/* Footer: Price & CTA button */}
        <div className={styles.foot}>
          <span className={styles.price}>
            {course.price === 0 ? "Miễn phí" : `${course.price.toLocaleString("vi-VN")} ₫`}
          </span>

          <div>
            {isPrivilegedRole ? (
              <Link href={href} className={`${styles.ctaBtn} ${styles.ctaSecondary}`}>
                Xem chi tiết
              </Link>
            ) : ownState === "owned" ? (
              <Link href={`/learn/${course.id}` as any} className={`${styles.ctaBtn} ${styles.ctaPrimary}`}>
                Tiếp tục học
              </Link>
            ) : ownState === "pending-payment" ? (
              <Link
                href={(ownership?.pendingOrderId ? `/checkout?order=${ownership.pendingOrderId}` : "/checkout") as any}
                className={`${styles.ctaBtn} ${styles.ctaSecondary}`}
              >
                <Clock className="h-3.5 w-3.5" />
                Chờ thanh toán
              </Link>
            ) : ownState === "in-cart" ? (
              <Link href={"/cart" as any} className={`${styles.ctaBtn} ${styles.ctaSecondary}`}>
                <Check className="h-3.5 w-3.5" />
                Đã trong giỏ hàng · Xem giỏ
              </Link>
            ) : ownState === "free" ? (
              <button
                type="button"
                onClick={() => onEnrollFree(course)}
                disabled={enrolling}
                className={`${styles.ctaBtn} ${styles.ctaPrimary}`}
                aria-label={`Đăng ký miễn phí: ${course.title}`}
              >
                {enrolling ? "Đang xử lý…" : "Đăng ký miễn phí"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onAddToCart(course)}
                disabled={adding}
                className={`${styles.ctaBtn} ${styles.ctaPrimary}`}
                aria-label={`Thêm vào giỏ: ${course.title}`}
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                {adding ? "Đang thêm…" : "Thêm vào giỏ"}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
