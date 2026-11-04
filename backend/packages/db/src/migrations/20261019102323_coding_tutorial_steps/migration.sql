ALTER TABLE "coding_exercises" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "coding_exercises" ADD COLUMN "tutorial_steps" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "coding_workspaces" ADD COLUMN "tutorial_progress" jsonb;