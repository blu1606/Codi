import { z } from "zod";
import { COURSE_CATEGORIES, COURSE_LEVELS } from "./course-constants";

export const createCourseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Tên khoá học cần ít nhất 5 ký tự.")
    .max(120, "Tên khoá học tối đa 120 ký tự."),
  summary: z
    .string()
    .trim()
    .min(20, "Mô tả cần ít nhất 20 ký tự.")
    .max(500, "Mô tả tối đa 500 ký tự."),
  category: z.enum(COURSE_CATEGORIES, { message: "Chọn một danh mục hợp lệ." }),
  level: z.enum(COURSE_LEVELS, { message: "Chọn trình độ hợp lệ." }),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
