CREATE TYPE "ai_chat_kind" AS ENUM('lesson', 'general');--> statement-breakpoint
CREATE TYPE "ai_chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TABLE "ai_chat_messages" (
	"id" text PRIMARY KEY,
	"chat_id" uuid NOT NULL,
	"role" "ai_chat_role" NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"vote" "ai_tutor_vote",
	"vote_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_chat_messages_vote_reason_check" CHECK ("vote_reason" IS NULL OR "vote" = 'down')
);
--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" text NOT NULL,
	"kind" "ai_chat_kind" NOT NULL,
	"course_id" text,
	"lesson_id" uuid,
	"title" text NOT NULL,
	"context_label" text NOT NULL,
	"context_href" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "ai_chat_messages_chat_idx" ON "ai_chat_messages" ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_chats_user_updated_idx" ON "ai_chats" ("user_id","updated_at");--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_chat_id_ai_chats_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_course_id_courses_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_lesson_id_course_lessons_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Keep the in-lesson history: each existing per-lesson thread becomes one lesson chat with its question/answer turns.
WITH "threads" AS (
	SELECT "user_id", "course_id", "lesson_id", min("created_at") AS "created_at", max("created_at") AS "updated_at"
	FROM "ai_tutor_messages" WHERE "role" IN ('user', 'ai')
	GROUP BY "user_id", "course_id", "lesson_id"
), "firsts" AS (
	SELECT DISTINCT ON ("user_id", "lesson_id") "user_id", "lesson_id", "body"
	FROM "ai_tutor_messages" WHERE "role" = 'user'
	ORDER BY "user_id", "lesson_id", "id"
), "chats" AS (
	INSERT INTO "ai_chats" ("user_id", "kind", "course_id", "lesson_id", "title", "context_label", "context_href", "created_at", "updated_at")
	SELECT t."user_id", 'lesson', t."course_id", t."lesson_id",
		left(regexp_replace(f."body", '\s+', ' ', 'g'), 80), 'Bài: ' || l."title",
		'/learn/' || t."course_id" || '/' || t."lesson_id", t."created_at", t."updated_at"
	FROM "threads" t
	JOIN "firsts" f ON f."user_id" = t."user_id" AND f."lesson_id" = t."lesson_id"
	JOIN "course_lessons" l ON l."id" = t."lesson_id"
	RETURNING "id", "user_id", "lesson_id"
)
-- A suggested change becomes the same tool part the chat stores today (output { ok, diff }), keyed by its legacy row;
-- its applied/skipped state goes to metadata.diffs. A stopped answer keeps metadata.stopped.
INSERT INTO "ai_chat_messages" ("id", "chat_id", "role", "parts", "metadata", "vote", "vote_reason", "created_at")
SELECT 'legacy-' || m."id", c."id",
	CASE m."role" WHEN 'user' THEN 'user'::"ai_chat_role" ELSE 'assistant'::"ai_chat_role" END,
	CASE WHEN m."diff" IS NULL
		THEN jsonb_build_array(jsonb_build_object('type', 'text', 'text', m."body"))
		ELSE jsonb_build_array(
			jsonb_build_object('type', 'text', 'text', m."body"),
			jsonb_build_object(
				'type', 'tool-suggest_code_change',
				'toolCallId', 'legacy-' || m."id",
				'state', 'output-available',
				'input', jsonb_build_object('at', m."diff"->'at', 'add', m."diff"->'add'),
				'output', jsonb_build_object('ok', true, 'diff', m."diff")
			)
		)
	END,
	jsonb_strip_nulls(jsonb_build_object(
		'stopped', CASE WHEN m."stopped" THEN true END,
		'diffs', CASE WHEN m."diff"->>'state' IS NOT NULL
			THEN jsonb_build_object('legacy-' || m."id", m."diff"->>'state') END
	)),
	m."vote", m."vote_reason", m."created_at"
FROM "ai_tutor_messages" m
JOIN "chats" c ON c."user_id" = m."user_id" AND c."lesson_id" = m."lesson_id"
WHERE m."role" IN ('user', 'ai');
