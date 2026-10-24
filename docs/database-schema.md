# Codi — Database schema (v7 on PostgreSQL)

Source design: `schema-v7.sql` (SQL Server, 2026-10-13). Ported to Drizzle ORM in `packages/db/src/schema/`
and applied to the shared Supabase dev database on 2026-10-14 (migration `20261014132641_schema_v7`).

State enums follow `docs/mockup/STATE-MACHINES.md`, not v7, wherever the two disagree (the mockup is the
source of truth for business states).

## How the port differs from v7

| v7 | PostgreSQL / Drizzle | Why |
|---|---|---|
| `users`, `roles` | Better Auth `user` + existing `roles` / `user_roles` | Auth is Better Auth. Deactivation = `user.banned` + `ban_reason`; inactive users cannot sign in and their sessions are revoked (D12). |
| `courses` (BIGINT id) | existing `courses` (text id) + lifecycle, pricing-audit and knowledge-map columns | Keep live catalogue rows and URLs. Status values `draft · pending · rejected · published · hidden`. |
| `chapters`, `lessons` | existing `course_chapters`, `course_lessons` (uuid) + `body`, `is_free_preview`, `is_remedial` | Already used by the course detail page. |
| `cart_items` | existing `student_cart` | Same shape, already used by the cart API. |
| `enrollments` | existing `student_enrollments` + goal, status, diagnostic and path columns | Every learning record hangs off `student_enrollments.id`. |
| `orders`, `order_items`, `payments` | new tables (`orders.status` reuses `student_order_status`) + `order_events` | Expiry = `failed` + `fail_reason='expired'`; `received_amount`, `needs_reconciliation`, `is_buy_now` encode D2/D3/D4. |
| — | `student_transactions` kept | Legacy per-course payment rows used by the current SePay routes. Retire after checkout moves to `orders`. |
| `course_publication_requests` | same, one row per review **round** + `publication_review_criteria`, `publication_review_flags` | Round status `in_review · changes_requested · rejected · approved` (§17). |
| `skills`, `skill_prerequisites` | same + `review` (`suggested · accepted · edited · declined`) | Lecturer review of AI suggestions (§18). |
| `assessments` … `coding_test_results` | same; submissions get `mode` (`run · submit`) and status `draft · pending · graded` | Latest coding submission counts (D7). |
| `course_discussions` | same, root rows carry `status` (`unanswered · answered`) | Public lesson Q&A (§14.1). |
| — | `course_conversations`, `conversation_messages` | Private learner ↔ lecturer threads; lecturer/admin resolve (D9). |
| — | `notifications`, `feedback_snippets`, `ai_content_drafts` | In-app bell (D15), "Mẫu nhận xét", AI drafts (§19). |
| DECIMAL money | `integer` VND | VND has no minor unit; matches existing `price`. |

All new tables are created with RLS enabled and no policies: the app reaches Postgres as the owner through
`DATABASE_URL`, while Supabase's anon/public API can read nothing.

## Table ownership

Each workstream owns the backend logic (server actions / route handlers, guards, tests) for its tables. Shared
tables are read by everyone; schema changes to a table go through its owner.

| Workstream | Epic | Tables |
|---|---|---|
| Foundation + Learner learning | #94 (@SteveJoy-ux) | `notifications`, `student_enrollments` (goal / diagnostic / path columns), `lesson_progress`, `assessment_submissions` + `assessment_answers` + `coding_test_results` (learner side), `enrollment_skill_mastery`, `personalized_learning_paths`, `path_items`, `course_discussions`, `course_conversations` + `conversation_messages` (learner side), `course_reviews`, `ai_interaction_logs` (tutor) |
| Commerce, AI advisor, Admin ops | #103 (@GnadiahHna) | `student_cart`, `vouchers`, `orders`, `order_items`, `order_events`, `payments`, `student_transactions` (retire), `courses.price*` / `hidden_reason`, `user.banned` / `user_roles` (admin), `ai_interaction_logs` (advisor) |
| Lecturer workspace + Publication | #112 (@taidz0987-dot) | `courses` (lifecycle), `course_details`, `course_chapters`, `course_lessons`, `lesson_materials`, `skills`, `skill_prerequisites`, `lesson_skills`, `assessments`, `quiz_questions`, `quiz_options`, `coding_exercises`, `coding_test_cases`, `course_publication_requests`, `publication_review_criteria`, `publication_review_flags`, `feedback_snippets`, `ai_content_drafts`, grading writes on `assessment_submissions`, lecturer side of conversations / reviews |

## Confirmed knowledge-map boundary

`courses.confirmed_knowledge_map` holds one current typed publication, separate
from mutable lecturer review rows. Its canonical skill IDs, names, BKT parameters,
edges and lesson links are replaced only by explicit confirmation. Draft edits,
reanalysis and content invalidation retain the publication; learner readers
intersect its links with currently published, accessible course lessons. Existing
skill identities, mastery, paths and progress are not rebuilt by reconfirmation.

Legacy NULL publications require lecturer reconfirmation, even if the old map
status says confirmed. A diagnostic without a trusted publication still saves
score, answers and completion, but does not update mastery and is not replayed
after later confirmation. Ordinary quiz/coding observations with no trusted live
skill mapping remain unconsumed for later reconciliation.

See the [typed payload](../packages/db/src/schema/confirmed-knowledge-map.ts) and
[reader/locking helper](../apps/web/src/lib/confirmed-knowledge-map.ts). Content
generation invalidates confirmation eligibility; publication identity also fences
background path results. Authors acquire the per-course exclusive transaction
advisory lock before course/child rows; learner mutations acquire enrollment then
the matching shared advisory lock. No provider call holds these locks. Migrate
before deploying the new code and fence old graph/content writers during rollout:
an old binary does not participate in this protocol. No automatic backfill or
history/recovery framework is provided.

## Changing the schema

1. Edit the Drizzle files in `packages/db/src/schema/` (keep enums in sync with `STATE-MACHINES.md`).
2. `pnpm db:generate` → commit the new folder under `packages/db/src/migrations/`.
3. `pnpm db:migrate` against the dev database. Migrations are **additive**: the dev database is shared with
   Vercel previews, so never drop or rename a column that deployed code still reads — add, migrate code, then
   remove in a later migration.
4. Never use `db:push` on the shared database — it bypasses the migration history.

Windows: if `drizzle-kit` crashes with `UV_HANDLE_CLOSING` (varlock, issue #85), run it with a config copy that
drops `import "varlock/auto-load"` and pass `DATABASE_URL` yourself.

A fresh local database (docker `local-db` profile) gets everything by running all migrations from the start;
`20261014132200_baseline` creates the tables that existed before v7.
