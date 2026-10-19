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
