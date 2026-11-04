CREATE TABLE "learning_path_completions" (
	"enrollment_id" bigint,
	"lesson_id" uuid,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_path_completions_pkey" PRIMARY KEY("enrollment_id","lesson_id")
);
--> statement-breakpoint
ALTER TABLE "learning_path_completions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "learning_path_evidence" (
	"submission_id" bigint,
	"observation_key" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_path_evidence_pkey" PRIMARY KEY("submission_id","observation_key")
);
--> statement-breakpoint
ALTER TABLE "learning_path_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "learning_path_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"enrollment_id" bigint NOT NULL,
	"trigger" "path_trigger" NOT NULL,
	"input_hash" text NOT NULL,
	"after_lesson_id" uuid,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "learning_path_jobs_lease_check" CHECK (("lease_token" IS NULL) = ("lease_expires_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "learning_path_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "personalized_learning_paths" ADD COLUMN "update_summary" jsonb;--> statement-breakpoint
ALTER TABLE "personalized_learning_paths" ADD COLUMN "highlights_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personalized_learning_paths" ADD COLUMN "update_dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD COLUMN "diagnostic_card_dismissed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "learning_path_jobs_pending_idx" ON "learning_path_jobs" ("enrollment_id") WHERE "finished_at" IS NULL;--> statement-breakpoint
ALTER TABLE "learning_path_completions" ADD CONSTRAINT "learning_path_completions_QwUQfcPreKxr_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "learning_path_completions" ADD CONSTRAINT "learning_path_completions_lesson_id_course_lessons_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "learning_path_evidence" ADD CONSTRAINT "learning_path_evidence_c2wsWMHHM52m_fkey" FOREIGN KEY ("submission_id") REFERENCES "assessment_submissions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "learning_path_jobs" ADD CONSTRAINT "learning_path_jobs_enrollment_id_student_enrollments_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "learning_path_jobs" ADD CONSTRAINT "learning_path_jobs_after_lesson_id_course_lessons_id_fkey" FOREIGN KEY ("after_lesson_id") REFERENCES "course_lessons"("id") ON DELETE SET NULL;
