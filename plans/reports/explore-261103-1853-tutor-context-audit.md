# Tutor context audit (2026-11-03)

The in-lesson Tutor gets the lesson title, chapter, description, the reading body (cut at 6000 characters), the names
and types of attached materials, and what the client sends from the code workspace (task, code, failing test, error,
selection). Two tools are available: `search_course_material` and `get_my_progress`. Slide and video content never
reach the model, and the GitHub profile is not used anywhere for course guidance.

| Context source | Available | How | Evidence |
|---|---|---|---|
| Lesson title, chapter, description, reading body | Yes (body cut at 6000 chars) | Prefetched into the system prompt | `backend/src/lib/ai-tutor-service.ts:100-107`, `ai-tutor-contract.ts:206-208` |
| Material names and types | Names only | Prefetched | `ai-tutor-service.ts:87-94` |
| Slide/PDF text, current page | No | — | No PDF/PPTX parser; `recordPdfPage` stores page numbers only (`lesson-player-contract.ts:183-196`) |
| Video transcript, current time | No | — | `lesson_materials` has no text column (`packages/db/src/schema/course-content.ts:49-64`); no transcript job in `ai-jobs.ts:20` |
| Learner code, task, failing test, error | Yes, in code lessons | Client chip | `frontend/src/features/tutor/tutor-thread.jsx:82-111`, `coding/learner-code.jsx:489-503` |
| Selected text | Yes | Client chip | `tutor/tutor-selection.js:36` |
| Other lessons in the course | Yes | Tool `search_course_material` (title/description/body, not materials) | `ai-chat-service.ts:297-349` |
| Progress | Yes | Tool `get_my_progress` | `ai-chat-service.ts:350-392` |
| Intake (goal, level, hours) | General chat only | Prefetched | `app/api/ai/chat/route.ts:158` |
| GitHub competency profile | No | — | No reference in chat, tutor, advisor, learning path or onboarding services |
| Skill mastery (BKT) | No (learning path only) | — | `learning-path-service.ts:150-215` |
| Course catalog, compare, my learning | Yes, general chat | Tools `search_courses`, `compare_courses`, `get_my_learning` | `ai-chat-service.ts:426-534` |

## What it would take

| Gap | Change | Size |
|---|---|---|
| GitHub profile in `/ai` chat | Read the published `github_profiles.analysis` next to `intakeNote` in `route.ts:158` and add it to the prompt | Small |
| Course guidance from GitHub gaps | Give courses their skills (`lesson_skills` → lessons → chapters) in the advisor catalog, add a tool that matches the profile and mastery against course skills | Medium |
| Reading body over 6000 chars | Chunk and retrieve by question | Small to medium |
| Video transcript | Lecturer uploads VTT/SRT, store cues with timestamps, tool by time; send current time from the player | Medium (no ASR) |
| Slide/PDF text | Extraction job + `pages_text` column + migration + PDF/PPTX parser dependency; send current page | Large |

## Risks noted

- `search_course_material` checks only `isPublished`, not path unlock rules; excerpts of later lessons may leak.
- Sending the GitHub profile to the LLM provider may need a consent update (`public-github-v1`).
- Onboarding deliberately does not suggest a level from GitHub (`onboarding-page.jsx:6-7`), which is a product decision.
