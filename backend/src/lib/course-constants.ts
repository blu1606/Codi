export const COURSE_CATEGORIES = [
  "Frontend",
  "Backend",
  "Fullstack",
  "Data & AI",
  "Mobile",
  "Computer Science",
] as const;

export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const COURSE_LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

export type CourseLevel = (typeof COURSE_LEVELS)[number];

export const COURSE_LEVEL_LABELS: Record<CourseLevel, string> = {
  Beginner: "Cơ bản",
  Intermediate: "Trung cấp",
  Advanced: "Nâng cao",
};

export const COURSE_STATUSES = [
  "draft",
  "pending",
  "rejected",
  "published",
  "hidden",
] as const;

export type CourseStatusType = (typeof COURSE_STATUSES)[number];
