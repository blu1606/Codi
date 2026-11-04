ALTER TABLE "course_publication_requests" ADD COLUMN "reviewed_content" jsonb;--> statement-breakpoint
ALTER TABLE "publication_review_flags" ADD COLUMN "target_item_id" text;