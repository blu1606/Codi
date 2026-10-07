-- Additive setup for databases created with db:push. Does not insert course content.
CREATE TABLE IF NOT EXISTS public.course_details (
  course_id text PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  learning_outcomes text[] NOT NULL DEFAULT '{}'::text[],
  requirements text[] NOT NULL DEFAULT '{}'::text[],
  target_audience text,
  cover_image_url text,
  intro_video_url text
);

CREATE TABLE IF NOT EXISTS public.course_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id text NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  CONSTRAINT course_chapters_position_check CHECK (position >= 0)
);
CREATE INDEX IF NOT EXISTS course_chapters_course_position_idx ON public.course_chapters(course_id, position);

CREATE TABLE IF NOT EXISTS public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.course_chapters(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  duration_seconds integer NOT NULL DEFAULT 0,
  position integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  CONSTRAINT course_lessons_position_check CHECK (position >= 0),
  CONSTRAINT course_lessons_duration_check CHECK (duration_seconds >= 0)
);
CREATE INDEX IF NOT EXISTS course_lessons_chapter_position_idx ON public.course_lessons(chapter_id, position);

-- Next.js uses the server-side database connection; these tables are not exposed
-- through Supabase's anonymous REST API.
ALTER TABLE public.course_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;
