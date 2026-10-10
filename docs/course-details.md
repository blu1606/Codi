# Course details and curriculum

## Verify a PR preview

PRs targeting `develop`, `main`, or `master` run the Vercel deployment workflow.
Validation and deployment use the PR head commit. The deployment run summary
records its source SHA and preview URL; verify that SHA matches the reviewed
head before using the URL as UI acceptance evidence. Fork PRs do not deploy
with repository credentials.

Use the matching preview to check desktop/mobile layout, light/dark themes,
course cover/video/captions, empty/error states, intro keyboard/pointer/skip/
reduced-motion behavior and home re-entry, and authenticated cart behavior.
Record the preview URL, source SHA, viewport, and observed result. A passing
unit suite or an older production site does not establish UI acceptance.
The preview database needs the course-content schema described below.

## Behavior

Each catalog card links to `/courses/{slug}`. The detail page fetches
`GET /api/courses/{slug}` and uses the existing `POST /api/student/cart` with
the database course ID for its enrollment action. Existing links with
`/courses?course={id}` redirect to the corresponding detail page.

The API returns the course, actual enrollment count, learning outcomes,
requirements, target audience, optional cover/intro video, published chapters,
published lesson metadata, and counts/duration calculated from those lessons.
Unknown slugs return 404; database failures return 500. No sample curriculum,
ratings, certificates, or learner counts are generated.

## Set up an existing database

From the repository root, with `apps/web/.env` configured:

```sh
pnpm db:setup-course-content
```

This runs the additive SQL in `packages/db/sql/course-content.sql` within a
transaction. It creates three tables and indexes, does not change existing
courses, and inserts no rows. It can be run again safely. The Drizzle schema
also declares these tables, so fresh databases can use the normal `db:push`
workflow. Server database credentials must have access to the new tables.
RLS is enabled without anonymous policies; public curriculum is served through
the Next.js API rather than direct Supabase client access.

## Add real content

The five existing courses have authored Vietnamese learning outcomes in
`packages/db/data/course-learning-outcomes.json`. To save them to the database:

```sh
pnpm db:seed-course-outcomes
```

This command matches the existing courses by slug and updates only
`course_details.learning_outcomes` in a verified transaction. It requires
exactly six non-empty outcomes for each of the five courses, rejecting an
invalid seed before opening a database connection. It preserves
other metadata and curriculum. Running it again replaces those outcomes with
the authored text in the file. The detail page continues to read from the API;
this file is not a UI fallback and does not create sample lessons.

The homepage and catalog use `coverImageUrl` returned by `GET /api/courses`; the detail
page uses the same database cover. Five original SVG covers are stored in
`apps/web/public/images/courses/`. Run `pnpm db:seed-course-covers` to set
their URLs on the existing courses. This replaces only `cover_image_url`,
preserving learning outcomes and other metadata. Courses without a cover
show a neutral category placeholder.

- `course_details`: one optional row per existing `courses.id`. Store
  `learning_outcomes` and `requirements` as PostgreSQL `text[]`, and
  `target_audience` as text. `cover_image_url` is an image URL;
  `intro_video_url` is a browser-playable video URL (for example MP4 or WebM).
  Supply `intro_video_captions_url` with a Vietnamese WebVTT caption URL for
  that video. The player includes a default captions track and appears only
  when both URLs are present; otherwise the course cover remains visible.
  Video and caption files must be browser-accessible, with appropriate CORS headers
  if hosted on a different origin. Re-run `db:setup-course-content` before
  deploying this change to an existing database to add the optional column.
- `course_chapters`: link `course_id` to the course, supply `title`, set
  zero-based `position`, and set `is_published = true` when ready.
- `course_lessons`: link `chapter_id` to its chapter, supply `title`, optional
  `description`, zero-based `position`, and nonnegative `duration_seconds`.
  Set `is_published = true` when ready.

Chapter and lesson IDs are generated UUIDs. A published chapter can have no
published lessons yet; the UI reports that state. Draft chapters and lessons
are excluded from the public API. The API exposes curriculum metadata, not
protected lesson media. A lesson player and lesson access/progress endpoints
can be added when actual teaching content is available.

Missing details or content rows are represented by empty arrays/null fields
and honest “đang cập nhật” states. The catalog's planned `duration` is shown
separately from the total runtime of published lessons.
