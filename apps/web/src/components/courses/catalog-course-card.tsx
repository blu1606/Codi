"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, Check, Clock, Clock3, ShoppingCart, Star } from "lucide-react";
import type { CatalogCourse } from "@/lib/course-catalog";
import type { CourseOwnershipDetail } from "@/lib/course-ownership";
import styles from "./catalog-course-card.module.css";

const BRAND_MAP: Record<string, { logo: string; name: string }> = {
  "course-1": { logo: "/logos/react.svg", name: "React" },
  "frontend-react-nextjs": { logo: "/logos/react.svg", name: "React" },
  "course-2": { logo: "/logos/nodedotjs.svg", name: "Node.js" },
  "backend-nodejs-typescript": { logo: "/logos/nodedotjs.svg", name: "Node.js" },
  "course-3": { logo: "/logos/typescript.svg", name: "TypeScript" },
  "dsa-interview-prep": { logo: "/logos/typescript.svg", name: "TypeScript" },
  "course-4": { logo: "/logos/python.svg", name: "Python" },
  "ai-engineering": { logo: "/logos/python.svg", name: "Python" },
  "course-5": { logo: "/logos/react.svg", name: "React Native" },
  "react-native-expo": { logo: "/logos/react.svg", name: "React Native" },
  "course-react-001": { logo: "/logos/react.svg", name: "React" },
  "course-js-001": { logo: "/logos/javascript.svg", name: "JavaScript" },
  "course-node-001": { logo: "/logos/nodedotjs.svg", name: "Node.js" },
  "course-python-001": { logo: "/logos/python.svg", name: "Python" },
  "course-git-001": { logo: "/logos/git.svg", name: "Git" },
  "course-jest-001": { logo: "/logos/jest.svg", name: "Jest" },
  "kiem-thu-voi-jest": { logo: "/logos/jest.svg", name: "Jest" },
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
  return course.instructorName || "Codi";
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
  const isHidden = course.status === "hidden";
  const ownState = ownership?.ownership ?? (course.price === 0 ? "free" : "not-owned");
  const isPrivilegedRole = userRole === "lecturer" || userRole === "admin";
  const brand = BRAND_MAP[course.id] || BRAND_MAP[course.slug];

  return (
    <article className={styles.card} data-testid={`course-card-${course.id}`}>
      <Link
        href={href}
        className={styles.coverLink}
        aria-label={`Xem chi tiết: ${course.title}`}
      >
        {course.coverImageUrl ? (
          <Image
            src={course.coverImageUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 290px, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
            className={styles.coverImage}
            unoptimized
          />
        ) : brand?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logo}
            alt={brand.name}
            className={styles.thumbLogo}
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
          {isHidden && (
            <span className={`${styles.badge} ${styles.badgeWarning}`}>
              Tạm ngừng
            </span>
          )}
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
            {ownState === "owned" ? (
              <Link href={`/learn/${course.id}` as any} className={`${styles.ctaBtn} ${styles.ctaPrimary}`}>
                Tiếp tục học
              </Link>
            ) : isHidden ? (
              <Link href={href} className={`${styles.ctaBtn} ${styles.ctaSecondary}`}>
                Xem chi tiết
              </Link>
            ) : isPrivilegedRole ? (
              <Link href={href} className={`${styles.ctaBtn} ${styles.ctaSecondary}`}>
                Xem chi tiết
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
