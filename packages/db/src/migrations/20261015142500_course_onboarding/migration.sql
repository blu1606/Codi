CREATE TYPE "self_assessed_level" AS ENUM('new', 'basic', 'solid');--> statement-breakpoint
ALTER TYPE "learning_goal" ADD VALUE 'project';--> statement-breakpoint
ALTER TYPE "learning_goal" ADD VALUE 'finish';--> statement-breakpoint
ALTER TYPE "learning_goal" ADD VALUE 'interview';--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD COLUMN "self_assessed_level" "self_assessed_level";--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD COLUMN "goal_draft" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD COLUMN "goal_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD COLUMN "goal_editing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD COLUMN "diagnostic_question_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_goal_step_check" CHECK ("goal_step" BETWEEN 0 AND 2);--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_diagnostic_index_check" CHECK ("diagnostic_question_index" >= 0);
