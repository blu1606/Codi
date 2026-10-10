import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock3, Users } from "lucide-react";
import type { CatalogCourse } from "@/lib/course-catalog";
import styles from "./catalog-course-card.module.css";

interface Props {
  course: CatalogCourse;
  adding: boolean;
  onAdd: (course: CatalogCourse) => void;
}

export function CatalogCourseCard({ course, adding, onAdd }: Props) {
  const href = `/courses/${encodeURIComponent(course.slug)}` as const;
  return (
    <article className={styles.card}>
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
        <span className={styles.coverAction}>Khám phá khóa học <ArrowRight size={16} /></span>
      </Link>
      <div className={styles.content}>
        <div className={styles.tags}>
          <span>{course.category}</span>
          <span>{course.level}</span>
        </div>
        <h2 className={styles.title}><Link href={href}>{course.title}</Link></h2>
        <p className={styles.price}>
          {course.price === 0 ? "Miễn phí" : `${course.price.toLocaleString("vi-VN")} ₫`}
        </p>
        <p className={styles.description}>{course.description}</p>
        <div className={styles.metadata}>
          <span><Users size={15} aria-hidden="true" />{course.enrollmentCount.toLocaleString("vi-VN")} học viên</span>
          <span><Clock3 size={15} aria-hidden="true" />{course.duration}</span>
        </div>
        <div className={styles.actions}>
          <Link href={href} className={styles.detailsLink}>Xem chi tiết <ArrowRight size={14} aria-hidden="true" /></Link>
          <button type="button" onClick={() => onAdd(course)} disabled={adding} className={styles.addButton} aria-label={`Thêm vào giỏ: ${course.title}`}>
            {adding ? "Đang thêm…" : "Thêm vào giỏ"}
          </button>
        </div>
      </div>
    </article>
  );
}
