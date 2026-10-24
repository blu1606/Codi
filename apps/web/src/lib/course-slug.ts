import { randomBytes } from "node:crypto";

/**
 * Hàm chuẩn hoá tiêu đề thành slug SEO không dấu tiếng Việt.
 * Fallback về "khoa-hoc" nếu tiêu đề không chứa ký tự chữ/số nào.
 */
export function generateSlug(title: string): string {
  if (!title || typeof title !== "string") {
    return "khoa-hoc";
  }

  const cleaned = title
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned.length > 0 ? cleaned : "khoa-hoc";
}

/**
 * Sinh slug ngẫu nhiên duy nhất cho khoá học kèm hậu tố.
 */
export function generateUniqueCourseSlug(title: string, customSuffix?: string): string {
  const base = generateSlug(title);
  const suffix = customSuffix || randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

/**
 * Nhận diện lỗi trùng UNIQUE slug từ PostgreSQL (mã 23505),
 * kể cả khi Drizzle ORM (node-postgres) bọc trong DrizzleQueryError với err.cause.
 */
export function isSlugUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;

  const current = err as Record<string, any>;
  const cause =
    current.cause && typeof current.cause === "object"
      ? (current.cause as Record<string, any>)
      : null;

  const code = current.code ?? cause?.code;
  const constraint = current.constraint ?? cause?.constraint;
  const detail = current.detail ?? cause?.detail;

  if (code === "23505") {
    if (typeof constraint === "string" && constraint.length > 0) {
      return constraint.includes("slug");
    }
    if (typeof detail === "string" && detail.length > 0) {
      return detail.includes("slug");
    }
    return true;
  }

  if (typeof constraint === "string" && constraint.includes("slug")) {
    return true;
  }
  if (typeof detail === "string" && detail.includes("Key (slug)=")) {
    return true;
  }

  return false;
}
