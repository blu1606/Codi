ALTER TABLE "courses" ADD COLUMN "confirmed_knowledge_map" jsonb;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "knowledge_map_content_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "knowledge_map_analysis_generation" integer;