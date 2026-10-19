import { z } from "zod";

export const INTAKE_QUESTIONS = [
  {
    key: "goal",
    text: "Mục tiêu của bạn là gì?",
    options: ["Làm được dự án", "Hoàn thành khoá học", "Chuẩn bị phỏng vấn"] as const,
  },
  {
    key: "level",
    text: "Trình độ hiện tại của bạn?",
    options: ["Mới bắt đầu", "Có kinh nghiệm cơ bản", "Trung cấp"] as const,
  },
  {
    key: "hours",
    text: "Bạn có thể dành bao nhiêu giờ/tuần để học?",
    options: ["< 5 giờ", "5-10 giờ", "> 10 giờ"] as const,
  },
] as const;

export type IntakeKey = (typeof INTAKE_QUESTIONS)[number]["key"];

export const intakeStateSchema = z.object({
  goal: z.string().nullable().optional(),
  level: z.string().nullable().optional(),
  hoursPerWeek: z.string().nullable().optional(),
  skipped: z.array(z.string()).optional().default([]),
});

export type IntakeState = z.infer<typeof intakeStateSchema>;

export const advisorCourseCardSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  level: z.string(),
  lessonCount: z.number().int().nonnegative(),
  price: z.number().int().nonnegative(),
  rating: z.number().nullable().optional(),
  learnersCount: z.number().int().nonnegative().optional(),
  coverImageUrl: z.string().nullable().optional(),
  reason: z.string().optional(),
  isBestMatch: z.boolean().optional(),
});

export type AdvisorCourseCard = z.infer<typeof advisorCourseCardSchema>;

export const advisorComparisonTableSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export type AdvisorComparisonTable = z.infer<typeof advisorComparisonTableSchema>;

export const advisorStructuredResponseSchema = z.object({
  text: z.string(),
  courses: z.array(advisorCourseCardSchema).optional().default([]),
  table: advisorComparisonTableSchema.optional().nullable(),
  order: z
    .array(
      z.object({
        id: z.string(),
        slug: z.string(),
        title: z.string(),
        reason: z.string(),
      })
    )
    .optional()
    .default([]),
  followups: z.array(z.string()).optional().default([]),
  noMatch: z.boolean().optional().default(false),
});

export type AdvisorStructuredResponse = z.infer<typeof advisorStructuredResponseSchema>;

export const DOWN_VOTE_REASONS = [
  "Sai trình độ",
  "Không hợp mục tiêu",
  "Thông tin khoá sai",
  "Chưa đúng",
  "Khó hiểu",
] as const;

export type DownVoteReason = (typeof DOWN_VOTE_REASONS)[number];

export const advisorFeedbackCommand = z.object({
  logId: z.number().int().positive().optional(),
  vote: z.enum(["up", "down"]).nullable(),
  reason: z.enum(DOWN_VOTE_REASONS).optional().nullable(),
  comment: z.string().max(1000).optional().nullable(),
});

export type AdvisorFeedbackCommand = z.infer<typeof advisorFeedbackCommand>;
