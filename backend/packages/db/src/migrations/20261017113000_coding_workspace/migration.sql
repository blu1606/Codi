CREATE TABLE "coding_workspaces" (
	"exercise_id" bigint,
	"enrollment_id" bigint,
	"draft" text NOT NULL,
	"solution_viewed" boolean DEFAULT false NOT NULL,
	"last_run_id" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coding_workspaces_pkey" PRIMARY KEY("exercise_id","enrollment_id")
);

--> statement-breakpoint
ALTER TABLE "coding_workspaces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "assessment_submissions" ADD COLUMN "coding_run" jsonb;
--> statement-breakpoint
ALTER TABLE "coding_exercises" ADD COLUMN "hints" jsonb DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "coding_workspaces" ADD CONSTRAINT "coding_workspaces_exercise_id_coding_exercises_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "coding_exercises"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "coding_workspaces" ADD CONSTRAINT "coding_workspaces_enrollment_id_student_enrollments_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "coding_workspaces" ADD CONSTRAINT "coding_workspaces_last_run_id_assessment_submissions_id_fkey" FOREIGN KEY ("last_run_id") REFERENCES "assessment_submissions"("id") ON DELETE SET NULL;
