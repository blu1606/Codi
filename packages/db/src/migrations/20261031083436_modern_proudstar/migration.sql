CREATE TYPE "course_lesson_kind" AS ENUM('reading', 'video', 'pdf', 'coding', 'tutorial');--> statement-breakpoint
ALTER TABLE "course_lessons" ADD COLUMN "kind" "course_lesson_kind" DEFAULT 'reading'::"course_lesson_kind" NOT NULL;
--> statement-breakpoint
UPDATE "course_lessons" AS lesson
SET "kind" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "assessments" AS assessment
    JOIN "coding_exercises" AS exercise ON exercise."assessment_id" = assessment."id"
    WHERE assessment."lesson_id" = lesson."id"
      AND assessment."type" = 'coding'
      AND jsonb_array_length(exercise."tutorial_steps") > 0
  ) THEN 'tutorial'::"course_lesson_kind"
  WHEN EXISTS (
    SELECT 1 FROM "assessments" AS assessment
    WHERE assessment."lesson_id" = lesson."id" AND assessment."type" = 'coding'
  ) THEN 'coding'::"course_lesson_kind"
  WHEN EXISTS (
    SELECT 1 FROM "lesson_materials" AS material
    WHERE material."lesson_id" = lesson."id" AND material."type" = 'video'
  ) THEN 'video'::"course_lesson_kind"
  WHEN EXISTS (
    SELECT 1 FROM "lesson_materials" AS material
    WHERE material."lesson_id" = lesson."id" AND material."type" IN ('pdf', 'slide')
  ) THEN 'pdf'::"course_lesson_kind"
  ELSE 'reading'::"course_lesson_kind"
END;
