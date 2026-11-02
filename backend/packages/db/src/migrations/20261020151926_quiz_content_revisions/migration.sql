ALTER TABLE "assessment_submissions" ADD COLUMN "quiz_revision" integer;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "current_quiz_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "quiz_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "assessment_submissions" AS s
SET "quiz_revision" = 1
FROM "assessments" AS a
WHERE s."assessment_id" = a."id" AND a."type" = 'quiz';--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_questions_revision_position_idx" ON "quiz_questions" ("assessment_id","quiz_revision","position");--> statement-breakpoint
DROP INDEX "quiz_questions_position_idx";--> statement-breakpoint
ALTER TABLE "assessment_submissions" ADD CONSTRAINT "submissions_quiz_revision_check" CHECK ("quiz_revision" IS NULL OR "quiz_revision" > 0);--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_quiz_revision_check" CHECK ("current_quiz_revision" > 0);--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_revision_check" CHECK ("quiz_revision" > 0);
