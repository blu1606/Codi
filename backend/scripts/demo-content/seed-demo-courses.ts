// Completes the two "JavaScript nền tảng" demo courses for a live demo (course-demo-js-full: published, learners buy
// it; course-demo-js-draft: draft, the lecturer submits it for review). The same enrichment is applied to both,
// matching lessons by chapter position + lesson position (never by database ids, which differ between databases):
//   quizzes      every lesson gets a quiz with at least 5 questions; existing questions are kept and new ones are
//                appended as a new quiz revision (attempts stay pinned to the revision they started on)
//   assignments  clear instructions and a JSON rubric for each assignment (created when the lesson has none)
//   coding       hidden edge-case tests; the reference solution is run against every test in the coding sandbox and
//                marked verified only when all pass
//   slides       one PDF deck per chapter (chapters 2–5), rendered with Playwright and uploaded to R2 like a lecturer
//                upload (lesson-media/<courseId>/<uuid>.pdf), attached as a `slide` material to the chapter's first lesson
//   transcripts  Whisper transcript (cues in seconds) for every YouTube video material that has none yet
// Then it prints the publication readiness of each course. Course status is never changed. Re-runnable: every step
// skips what is already in place, so a second run changes nothing.
//
// Usage (from backend/; DATABASE_URL, OPENAI_API_KEY and R2_* from the environment):
//   npx tsx --env-file-if-exists=.env scripts/demo-content/seed-demo-courses.ts [flags]
//     --course <id>           only this course (repeatable; default: both demo courses)
//     --dry-run               run every step in a transaction that is rolled back; no R2 upload, no Whisper call
//                             (transcripts come from the cache only)
//     --skip-transcripts      leave video transcripts alone
//     --skip-slides           leave chapter slides alone
//     --overwrite-transcripts replace transcripts that are already stored (default: only fill empty ones)
//     --cache-dir <path>      audio/transcript/slide cache (default: ../.codi-gc-preserved/demo-content-cache next
//                             to the repository, or DEMO_CONTENT_CACHE)
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { runJavaScript } from "@codi-1/coding-runner";
import { courses } from "@codi-1/db/schema/courses";
import { courseChapters, courseLessons, lessonMaterials } from "@codi-1/db/schema/course-content";
import { assessments, quizOptions, quizQuestions } from "@codi-1/db/schema/assessments";
import { codingExercises, codingTestCases } from "@codi-1/db/schema/coding-exercises";
import { db } from "@/services";
import { canonical, gradeCoding } from "@/lib/coding-contract";
import { mediaUrl } from "@/lib/lesson-media";
import { getR2Client, R2_BUCKET } from "@/lib/storage";
import { checkReadiness, rulePrecheck } from "@/lib/publication-service";
import { fetchCourseDataForReview } from "@/lib/publication-course-data";
import { seedQuizRevision } from "../seed-quiz-revision";
import { LESSONS, QUIZ_INSTRUCTIONS, QUIZ_MIN, QUIZ_TARGET, type LessonSpec } from "./lesson-content";
import { DECKS, renderDecks } from "./chapter-slides";
import { createTranscriber, type Cue } from "./transcripts";

const DEMO_COURSES = ["course-demo-js-full", "course-demo-js-draft"];
const here = path.dirname(fileURLToPath(import.meta.url));

const { values: flags } = parseArgs({
  options: {
    course: { type: "string", multiple: true },
    "dry-run": { type: "boolean", default: false },
    "skip-transcripts": { type: "boolean", default: false },
    "skip-slides": { type: "boolean", default: false },
    "overwrite-transcripts": { type: "boolean", default: false },
    "cache-dir": { type: "string" },
  },
  strict: true,
});
const dryRun = flags["dry-run"];
const courseIds = flags.course?.length ? flags.course : DEMO_COURSES;
const cacheDir = path.resolve(flags["cache-dir"] ?? process.env.DEMO_CONTENT_CACHE ?? path.join(here, "../../../../.codi-gc-preserved/demo-content-cache"));
const log = (line: string) => console.log(line);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Lesson = typeof courseLessons.$inferSelect;
class DryRunRollback extends Error {}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const slideTitle = (deck: (typeof DECKS)[number]) => `Slide chương ${deck.chapter + 1}: ${deck.title}`;

function describeTarget(url: string | undefined) {
  try {
    const u = new URL(url ?? "postgresql://codi:codi@localhost:5544/codi");
    return `${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function transcriptColumnExists() {
  const { rows } = await db.$client.query(
    `select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'lesson_materials' and column_name = 'transcript'`);
  return rows.length > 0;
}

/** Lessons of the course keyed "chapter:lesson" (positions), after checking each spec'd title matches. */
async function lessonMap(courseId: string): Promise<Map<string, Lesson>> {
  const rows = await db.select({ lesson: courseLessons, chapterPos: courseChapters.position })
    .from(courseLessons).innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
    .where(eq(courseChapters.courseId, courseId)).orderBy(asc(courseChapters.position), asc(courseLessons.position));
  const map = new Map(rows.map((r) => [`${r.chapterPos}:${r.lesson.position}`, r.lesson]));
  const mismatched = LESSONS.filter((s) => norm(map.get(`${s.chapter}:${s.lesson}`)?.title ?? "") !== norm(s.title));
  if (mismatched.length)
    throw new Error(`${courseId}: lesson layout differs from the demo course (${mismatched.map((s) => `${s.chapter}:${s.lesson} "${s.title}"`).join(", ")}).`);
  return map;
}

// ───────────────────────── quizzes ─────────────────────────
async function applyQuiz(tx: Tx, courseId: string, lesson: Lesson, spec: LessonSpec) {
  let [quiz] = await tx.select().from(assessments)
    .where(and(eq(assessments.courseId, courseId), eq(assessments.lessonId, lesson.id), eq(assessments.type, "quiz")))
    .orderBy(asc(assessments.id)).limit(1);
  let created = false;
  if (!quiz) {
    [quiz] = await tx.insert(assessments).values({
      courseId, lessonId: lesson.id, type: "quiz", title: `Quiz: ${lesson.title}`, instructions: QUIZ_INSTRUCTIONS,
      maxScore: 100, passingScore: 70, status: "published",
    }).returning();
    created = true;
  }
  if (!quiz) throw new Error(`quiz of "${lesson.title}" could not be created`);
  const current = await tx.select().from(quizQuestions)
    .where(and(eq(quizQuestions.assessmentId, quiz.id), eq(quizQuestions.quizRevision, quiz.currentQuizRevision)))
    .orderBy(asc(quizQuestions.position));
  const options = current.length
    ? await tx.select().from(quizOptions).where(inArray(quizOptions.questionId, current.map((x) => x.id))).orderBy(asc(quizOptions.position))
    : [];
  const present = new Set(current.map((x) => norm(x.text)));
  const toAdd = spec.quiz.filter((x) => !present.has(norm(x.text))).slice(0, Math.max(0, QUIZ_TARGET - current.length));
  if (!toAdd.length) return `quiz ${current.length} câu${created ? " (mới)" : ""}, giữ nguyên`;
  const desired = [
    ...current.map((x) => ({
      text: x.text, lessonId: x.lessonId, type: x.type, codeSnippet: x.codeSnippet, points: x.points, explanation: x.explanation,
      options: options.filter((o) => o.questionId === x.id).map((o) => ({ text: o.text, isCorrect: o.isCorrect, explanation: o.explanation })),
    })),
    ...toAdd.map((x) => ({
      text: x.text, lessonId: lesson.id, type: "single_choice" as const, points: 1, explanation: x.explanation,
      options: x.options.map((text, i) => ({ text, isCorrect: i === x.correct })),
    })),
  ];
  if (desired.length < QUIZ_MIN) throw new Error(`quiz of "${lesson.title}" would have only ${desired.length} questions`);
  const { quizRevision } = await seedQuizRevision(tx, quiz.id, desired);
  return `quiz ${current.length} → ${desired.length} câu${created ? " (quiz mới)" : ""}, revision ${quiz.currentQuizRevision} → ${quizRevision}`;
}

// ───────────────────────── assignments ─────────────────────────
async function applyAssignment(tx: Tx, courseId: string, lesson: Lesson, spec: NonNullable<LessonSpec["assignment"]>) {
  const rubric = JSON.stringify(spec.rubric);
  const [existing] = await tx.select().from(assessments)
    .where(and(eq(assessments.courseId, courseId), eq(assessments.lessonId, lesson.id), eq(assessments.type, "assignment")))
    .orderBy(asc(assessments.id)).limit(1);
  if (!existing) {
    await tx.insert(assessments).values({
      courseId, lessonId: lesson.id, type: "assignment", title: spec.title, instructions: spec.instructions, rubric,
      submissionFormat: spec.submissionFormat, maxScore: spec.rubric.reduce((s, r) => s + r.points, 0), passingScore: 50, dueDays: 7, status: "published",
    });
    return "bài tập mới có yêu cầu và thang chấm";
  }
  if (existing.instructions === spec.instructions && existing.rubric === rubric) return "bài tập giữ nguyên";
  await tx.update(assessments).set({ instructions: spec.instructions, rubric, updatedAt: new Date() }).where(eq(assessments.id, existing.id));
  return "bài tập cập nhật yêu cầu + thang chấm";
}

// ───────────────────────── coding ─────────────────────────
async function applyCoding(tx: Tx, courseId: string, lesson: Lesson, spec: LessonSpec) {
  const [row] = await tx.select({ exercise: codingExercises }).from(codingExercises)
    .innerJoin(assessments, eq(assessments.id, codingExercises.assessmentId))
    .where(and(eq(assessments.courseId, courseId), eq(assessments.lessonId, lesson.id), eq(assessments.type, "coding"))).limit(1);
  if (!row) return null;
  const ex = row.exercise;
  let tests = await tx.select().from(codingTestCases).where(eq(codingTestCases.exerciseId, ex.id)).orderBy(asc(codingTestCases.position));
  const names = new Set(tests.map((t) => t.name));
  const missing = (spec.hiddenTests ?? []).filter((t) => !names.has(t.name));
  let position = tests.reduce((m, t) => Math.max(m, t.position), -1);
  for (const t of missing) {
    await tx.insert(codingTestCases).values({ exerciseId: ex.id, name: t.name, input: t.input, expectedOutput: canonical(JSON.parse(t.expectedOutput)), isSample: false, position: ++position });
  }
  if (missing.length) tests = await tx.select().from(codingTestCases).where(eq(codingTestCases.exerciseId, ex.id)).orderBy(asc(codingTestCases.position));
  if (!ex.solutionCode?.trim()) throw new Error(`code exercise of "${lesson.title}" has no reference solution`);
  const result = await runJavaScript({
    code: ex.solutionCode, language: ex.language === "typescript" ? "typescript" : "javascript",
    tests: tests.map((t) => ({ id: t.id, input: t.input, isSample: t.isSample })),
  });
  const graded = gradeCoding(tests.map((t) => ({ id: t.id, name: t.name, input: t.input, expectedOutput: t.expectedOutput, isSample: t.isSample })), result, 100);
  if (!graded.isPassed) {
    const failed = graded.outcomes.filter((o) => !o.isPassed).map((o) => `${tests.find((t) => t.id === o.testCaseId)?.name}: ${o.actualOutput ?? o.errorMessage ?? o.phase}`);
    throw new Error(`reference solution of "${lesson.title}" fails: ${failed.join("; ")}`);
  }
  const hidden = tests.filter((t) => !t.isSample).length;
  if (!ex.solutionVerifiedAt) await tx.update(codingExercises).set({ solutionVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(codingExercises.id, ex.id));
  return `code: +${missing.length} test ẩn (${tests.length} test, ${hidden} ẩn), lời giải đạt ${tests.length}/${tests.length}${ex.solutionVerifiedAt ? "" : ", đánh dấu đã kiểm chứng"}`;
}

// ───────────────────────── slides ─────────────────────────
async function applySlide(tx: Tx, courseId: string, lesson: Lesson, deck: (typeof DECKS)[number], pdf: Buffer) {
  const title = slideTitle(deck);
  const mats = await tx.select().from(lessonMaterials).where(eq(lessonMaterials.lessonId, lesson.id)).orderBy(asc(lessonMaterials.position));
  if (mats.some((m) => m.type === "slide" && m.title === title)) return "slide giữ nguyên";
  const position = mats.reduce((m, x) => Math.max(m, x.position), -1) + 1;
  const key = `lesson-media/${courseId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "course"}/${randomUUID()}.pdf`;
  if (dryRun) return `slide sẽ thêm (${pdf.length >> 10} KB, vị trí ${position})`;
  const client = getR2Client();
  if (!client) throw new Error("R2_* is not configured: chapter slides need R2 (or pass --skip-slides).");
  await client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: pdf, ContentLength: pdf.length, ContentType: "application/pdf" }));
  await tx.insert(lessonMaterials).values({ lessonId: lesson.id, type: "slide", title, url: mediaUrl(key), fileSizeKb: Math.max(1, Math.round(pdf.length / 1024)), position });
  return `slide thêm "${title}" (${Math.round(pdf.length / 1024)} KB)`;
}

// ───────────────────────── transcripts ─────────────────────────
async function applyTranscripts(tx: Tx, lessonIds: string[], cues: Map<string, Cue[]>) {
  const videos = await tx.select({ id: lessonMaterials.id, lessonId: lessonMaterials.lessonId, url: lessonMaterials.url, hasTranscript: sql<boolean>`${lessonMaterials.transcript} is not null` })
    .from(lessonMaterials).where(and(inArray(lessonMaterials.lessonId, lessonIds), eq(lessonMaterials.type, "video")));
  const perLesson = new Map<string, { written: number; kept: number; missing: number }>();
  for (const v of videos) {
    const tally = perLesson.get(v.lessonId) ?? { written: 0, kept: 0, missing: 0 };
    perLesson.set(v.lessonId, tally);
    const value = cues.get(v.url);
    if (v.hasTranscript && !flags["overwrite-transcripts"]) tally.kept++;
    else if (!value) tally.missing++;
    else {
      await tx.update(lessonMaterials).set({ transcript: value }).where(eq(lessonMaterials.id, v.id));
      tally.written++;
    }
  }
  return perLesson;
}

async function main() {
  log(`Target database: ${describeTarget(process.env.DATABASE_URL)}${dryRun ? " (dry run, rolled back)" : ""}`);
  log(`Courses: ${courseIds.join(", ")} · cache: ${cacheDir}`);
  const known = await db.select({ id: courses.id, status: courses.status }).from(courses).where(inArray(courses.id, courseIds));
  const missingCourses = courseIds.filter((id) => !known.some((c) => c.id === id));
  if (missingCourses.length) throw new Error(`course not found: ${missingCourses.join(", ")}`);
  const layouts = new Map<string, Map<string, Lesson>>();
  for (const id of courseIds) layouts.set(id, await lessonMap(id));

  // Slow, external work first and outside any transaction: slide PDFs and video transcripts.
  let pdfs: Buffer[] = [];
  if (!flags["skip-slides"]) {
    const started = Date.now();
    pdfs = await renderDecks(DECKS);
    await mkdir(path.join(cacheDir, "slides"), { recursive: true });
    for (const [i, deck] of DECKS.entries()) await writeFile(path.join(cacheDir, "slides", `chapter-${deck.chapter + 1}.pdf`), pdfs[i]!);
    log(`Rendered ${pdfs.length} chapter decks in ${Math.round((Date.now() - started) / 1000)} s (copies in ${path.join(cacheDir, "slides")})`);
  }
  const transcriptsOn = !flags["skip-transcripts"] && (await transcriptColumnExists());
  if (!flags["skip-transcripts"] && !transcriptsOn) log("WARNING: lesson_materials.transcript does not exist in this database; transcripts skipped (run the migration first).");
  const transcriber = createTranscriber(cacheDir, log);
  const cues = new Map<string, Cue[]>();
  if (transcriptsOn) {
    const allLessonIds = [...layouts.values()].flatMap((m) => [...m.values()].map((l) => l.id));
    const videos = await db.selectDistinct({ url: lessonMaterials.url }).from(lessonMaterials)
      .where(and(inArray(lessonMaterials.lessonId, allLessonIds), eq(lessonMaterials.type, "video"),
        flags["overwrite-transcripts"] ? sql`true` : sql`${lessonMaterials.transcript} is null`));
    const started = Date.now();
    log(`Transcripts: ${videos.length} video(s) need one${dryRun ? " (dry run: cache only)" : ""}`);
    const queue = videos.map((v) => v.url);
    const failures: string[] = [];
    const worker = async () => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        try {
          const value = await transcriber.transcriptOf(url, { cacheOnly: dryRun });
          if (value) cues.set(url, value);
        } catch (error) {
          failures.push(`${url}: ${(error as Error).message}`);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const s = transcriber.stats;
    log(`Transcripts ready: ${cues.size} (${s.cached} from cache, ${s.transcribed} new: ${Math.round(s.audioSeconds / 60)} min audio, ≈ $${s.estimatedUsd.toFixed(2)} Whisper) in ${Math.round((Date.now() - started) / 1000)} s`);
    for (const f of failures) log(`  FAILED ${f}`);
  }

  for (const courseId of courseIds) {
    const lessons = layouts.get(courseId)!;
    log(`\n== ${courseId} (${known.find((c) => c.id === courseId)?.status}) ==`);
    try {
      await db.transaction(async (tx) => {
        const lines = new Map<string, string[]>();
        const note = (key: string, line: string | null) => { if (line) lines.set(key, [...(lines.get(key) ?? []), line]); };
        for (const spec of LESSONS) {
          const key = `${spec.chapter}:${spec.lesson}`;
          const lesson = lessons.get(key)!;
          note(key, await applyQuiz(tx, courseId, lesson, spec));
          if (spec.assignment) note(key, await applyAssignment(tx, courseId, lesson, spec.assignment));
          note(key, await applyCoding(tx, courseId, lesson, spec));
        }
        for (const [i, deck] of DECKS.entries()) {
          if (!pdfs[i]) continue;
          const key = `${deck.chapter}:0`;
          note(key, await applySlide(tx, courseId, lessons.get(key)!, deck, pdfs[i]!));
        }
        if (transcriptsOn) {
          const tallies = await applyTranscripts(tx, [...lessons.values()].map((l) => l.id), cues);
          for (const [key, lesson] of lessons) {
            const t = tallies.get(lesson.id);
            if (t) note(key, `transcript: ${t.written} ghi mới, ${t.kept} giữ nguyên${t.missing ? `, ${t.missing} CHƯA CÓ` : ""}`);
          }
        }
        for (const [key, lesson] of lessons) log(`  [${key}] ${lesson.title}\n      ${(lines.get(key) ?? ["—"]).join("\n      ")}`);
        if (dryRun) throw new DryRunRollback();
      });
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
      log("  (dry run: rolled back)");
    }
  }

  log("\n== Publication readiness ==");
  let allReady = true;
  for (const courseId of courseIds) {
    const { courseData } = await fetchCourseDataForReview(courseId, db);
    const readiness = checkReadiness(courseData);
    const must = rulePrecheck(courseData).filter((f) => f.severity === "must");
    allReady &&= readiness.allOk;
    log(`${courseId}: ${readiness.allOk ? "ALL OK" : "NOT READY"}`);
    for (const item of readiness.items) log(`  ${item.ok ? "ok " : "NO "} ${item.label}${item.ok ? "" : ` — ${item.hint}`}`);
    for (const f of must) log(`  must-fix: ${f.comment}`);
  }
  if (!allReady) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  // Drizzle wraps driver errors: the cause carries the real reason (connection refused, missing column…).
  const cause = (error as Error & { cause?: Error }).cause;
  console.error(`\nFAILED: ${(error as Error).message}${cause ? `\n  cause: ${cause.message}` : ""}`);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
