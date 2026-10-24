ALTER TABLE "assessment_submissions" ADD COLUMN "assignment_draft" jsonb;
--> statement-breakpoint
ALTER TABLE "assessment_submissions" ADD COLUMN "quiz_percent" integer;
--> statement-breakpoint
ALTER TABLE "assessment_submissions" ADD CONSTRAINT "submissions_quiz_percent_check" CHECK ("quiz_percent" IS NULL OR "quiz_percent" BETWEEN 0 AND 100);
