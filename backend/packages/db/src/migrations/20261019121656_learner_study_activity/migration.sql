CREATE TABLE "student_study_clocks" (
	"user_id" text PRIMARY KEY,
	"course_id" text NOT NULL,
	"lesson_id" uuid NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "student_study_clocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_study_days" (
	"user_id" text,
	"date" date,
	"seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "student_study_days_pkey" PRIMARY KEY("user_id","date"),
	CONSTRAINT "study_days_seconds_check" CHECK ("seconds" between 0 and 86400)
);
--> statement-breakpoint
ALTER TABLE "student_study_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_study_clocks" ADD CONSTRAINT "student_study_clocks_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_study_clocks" ADD CONSTRAINT "student_study_clocks_course_id_courses_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_study_clocks" ADD CONSTRAINT "student_study_clocks_lesson_id_course_lessons_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_study_days" ADD CONSTRAINT "student_study_days_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;