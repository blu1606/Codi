import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, Clock, Clock3, Users } from "lucide-react";
import type { CatalogCourse } from "@/lib/course-catalog";
import type { CourseOwnershipDetail } from "@/lib/course-ownership";
import styles from "./catalog-course-card.module.css";

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

  return (
    <article className={styles.card} data-testid={`course-card-${course.id}`}>
      <Link href={href} className={styles.coverLink} aria-label={`Xem chi tiết: ${course.title}`}>
        {course.coverImageUrl ? (
          <Image
            src={course.coverImageUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 290px, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
            className={styles.coverImage}
            unoptimized
          />
        ) : (
          <div className={styles.coverPlaceholder} aria-hidden="true">
            <BookOpen size={48} strokeWidth={1.4} />
            <span>{course.category}</span>
          </div>
        )}
        <span className={styles.coverAction}>
          Khám phá khóa học <ArrowRight size={16} />
        </span>
      </Link>
      <div className={styles.content}>
        <div className={styles.tags}>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>{course.category}</span>
            <span>{course.level}</span>
          </div>
          {ownState === "owned" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-success-soft border border-border px-2 py-0.5 text-xs font-semibold text-success">
              <Check className="h-3 w-3" />
              Đã sở hữu
            </span>
          )}
          {ownState === "in-cart" && (
            <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
              Trong giỏ
            </span>
          )}
        </div>
        <h2 className={styles.title}>
          <Link href={href}>{course.title}</Link>
        </h2>
        <p className={styles.price}>
          {course.price === 0 ? "Miễn phí" : `${course.price.toLocaleString("vi-VN")} ₫`}
        </p>
        <p className={styles.description}>{course.description}</p>
        <div className={styles.metadata}>
          <span>
            <Users size={15} aria-hidden="true" />
            {course.enrollmentCount.toLocaleString("vi-VN")} học viên
          </span>
          <span>
            <Clock3 size={15} aria-hidden="true" />
            {course.duration}
          </span>
        </div>
        <div className={styles.actions}>
          <Link href={href} className={styles.detailsLink}>
            Xem chi tiết <ArrowRight size={14} aria-hidden="true" />
          </Link>

          {isPrivilegedRole ? (
            <Link href={href} className={styles.addButton}>
              Xem chi tiết
            </Link>
          ) : ownState === "owned" ? (
            <Link href={`/learn/${course.id}` as any} className={styles.addButton}>
              Tiếp tục học
            </Link>
          ) : ownState === "pending-payment" ? (
            <Link
              href={(ownership?.pendingOrderId ? `/checkout?order=${ownership.pendingOrderId}` : "/checkout") as any}
              className={`${styles.addButton} inline-flex items-center gap-1.5`}
            >
              <Clock className="h-3.5 w-3.5" />
              Chờ thanh toán
            </Link>
          ) : ownState === "in-cart" ? (
            <Link href={"/cart" as any} className={`${styles.addButton} inline-flex items-center gap-1.5`}>
              <Check className="h-3.5 w-3.5" />
              Đã trong giỏ · Xem giỏ
            </Link>
          ) : ownState === "free" ? (
            <button
              type="button"
              onClick={() => onEnrollFree(course)}
              disabled={enrolling}
              className={styles.addButton}
              aria-label={`Đăng ký miễn phí: ${course.title}`}
            >
              {enrolling ? "Đang xử lý…" : "Đăng ký miễn phí"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onAddToCart(course)}
              disabled={adding}
              className={styles.addButton}
              aria-label={`Thêm vào giỏ: ${course.title}`}
            >
              {adding ? "Đang thêm…" : "Thêm vào giỏ"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
