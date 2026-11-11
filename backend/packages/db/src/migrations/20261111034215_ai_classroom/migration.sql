CREATE TABLE "classroom_debate_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"lesson_id" uuid NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"messages" jsonb DEFAULT '[]' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classroom_debate_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"course_id" text NOT NULL,
	"lesson_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"timestamp_seconds" integer NOT NULL,
	"concept" text NOT NULL,
	"question" text NOT NULL,
	"options" jsonb,
	"correct_index" integer,
	"answer_key" text NOT NULL,
	"key_idea" text NOT NULL,
	"misconception" text NOT NULL,
	"misconception_explanation" text NOT NULL,
	"hint1" text NOT NULL,
	"hint2" text NOT NULL,
	"bo_claim" text NOT NULL,
	"analogy" text,
	"council_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_checkpoints_position_check" CHECK ("position" >= 0),
	CONSTRAINT "lesson_checkpoints_timestamp_check" CHECK ("timestamp_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "lesson_checkpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lesson_council_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"course_id" text NOT NULL,
	"lesson_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"events" jsonb DEFAULT '[]' NOT NULL,
	"draft" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	CONSTRAINT "lesson_council_runs_status_check" CHECK ("status" in ('running', 'completed', 'failed', 'applied'))
);
--> statement-breakpoint
ALTER TABLE "lesson_council_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "classroom_debate_sessions_user_lesson_idx" ON "classroom_debate_sessions" ("user_id","lesson_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_checkpoints_lesson_position_idx" ON "lesson_checkpoints" ("lesson_id","position");--> statement-breakpoint
CREATE INDEX "lesson_council_runs_lesson_idx" ON "lesson_council_runs" ("lesson_id","created_at");--> statement-breakpoint
ALTER TABLE "classroom_debate_sessions" ADD CONSTRAINT "classroom_debate_sessions_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "classroom_debate_sessions" ADD CONSTRAINT "classroom_debate_sessions_lesson_id_course_lessons_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "classroom_debate_sessions" ADD CONSTRAINT "classroom_debate_sessions_wfArHk7m94un_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "lesson_checkpoints"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_checkpoints" ADD CONSTRAINT "lesson_checkpoints_course_id_courses_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_checkpoints" ADD CONSTRAINT "lesson_checkpoints_lesson_id_course_lessons_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_checkpoints" ADD CONSTRAINT "lesson_checkpoints_council_run_id_lesson_council_runs_id_fkey" FOREIGN KEY ("council_run_id") REFERENCES "lesson_council_runs"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lesson_council_runs" ADD CONSTRAINT "lesson_council_runs_course_id_courses_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_council_runs" ADD CONSTRAINT "lesson_council_runs_lesson_id_course_lessons_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson_council_runs" ADD CONSTRAINT "lesson_council_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE;