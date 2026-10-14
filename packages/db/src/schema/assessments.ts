import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./courses";
import { courseLessons } from "./course-content";
import { studentEnrollments } from "./student-profile";

// UC-13 diagnostic, UC-18 quiz, UC-19 assignment, UC-29 grading, plus coding exercises (Flow L6b).
// The diagnostic is a course-level quiz (lesson_id NULL, is_diagnostic = true), one per course.

export const assessmentType = pgEnum("assessment_type", ["quiz", "assignment", "coding"]);
export const assessmentStatus = pgEnum("assessment_status", ["draft", "published", "disabled"]);
export const submissionFormat = pgEnum("submission_format", ["text", "file", "link", "file_or_link"]);
export const questionType = pgEnum("question_type", ["single_choice", "multiple_choice", "fill_in_blank", "predict_output"]);

export const assessments = pgTable.withRLS("assessments", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").references(() => courseLessons.id, { onDelete: "cascade" }),
  type: assessmentType("type").notNull(),
  isDiagnostic: boolean("is_diagnostic").default(false).notNull(),
  title: text("title").notNull(),
  instructions: text("instructions"),
  maxScore: numeric("max_score", { precision: 6, scale: 2, mode: "number" }).default(100).notNull(),
  // Percent needed to pass. Passing the latest quiz attempt gates lesson completion (decision D6).
  passingScore: integer("passing_score"),
  timeLimitMinutes: integer("time_limit_minutes"),
  dueDays: integer("due_days"),
  shuffleQuestions: boolean("shuffle_questions"),
  // assignment-only settings
  submissionFormat: submissionFormat("submission_format"),
  maxFileSizeMb: integer("max_file_size_mb"),
  rubric: text("rubric"),
  status: assessmentStatus("status").default("draft").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("assessments_course_idx").on(table.courseId),
  index("assessments_lesson_idx").on(table.lessonId),
  uniqueIndex("assessments_diagnostic_per_course_idx").on(table.courseId).where(sql`${table.isDiagnostic}`),
  check("assessments_max_score_check", sql`${table.maxScore} > 0`),
  check("assessments_passing_score_check", sql`${table.passingScore} IS NULL OR ${table.passingScore} BETWEEN 0 AND 100`),
  check("assessments_diagnostic_shape_check", sql`NOT ${table.isDiagnostic} OR (${table.type} = 'quiz' AND ${table.lessonId} IS NULL)`),
  check("assessments_assignment_format_check", sql`${table.type} <> 'assignment' OR ${table.submissionFormat} IS NOT NULL`),
  check("assessments_lesson_scoped_check", sql`${table.isDiagnostic} OR ${table.lessonId} IS NOT NULL`),
]);

export const quizQuestions = pgTable.withRLS("quiz_questions", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  assessmentId: bigint("assessment_id", { mode: "number" }).notNull().references(() => assessments.id, { onDelete: "cascade" }),
  // For the diagnostic: which lesson this question is evidence for (BKT reads the lesson's skills).
  lessonId: uuid("lesson_id").references(() => courseLessons.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  type: questionType("type").default("single_choice").notNull(),
  codeSnippet: text("code_snippet"),
  points: numeric("points", { precision: 6, scale: 2, mode: "number" }).default(1).notNull(),
  position: integer("position").notNull(),
  explanation: text("explanation"),
}, (table) => [
  uniqueIndex("quiz_questions_position_idx").on(table.assessmentId, table.position),
  index("quiz_questions_lesson_idx").on(table.lessonId),
  check("quiz_questions_points_check", sql`${table.points} > 0`),
]);

export const quizOptions = pgTable.withRLS("quiz_options", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  questionId: bigint("question_id", { mode: "number" }).notNull().references(() => quizQuestions.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  isCorrect: boolean("is_correct").default(false).notNull(),
  explanation: text("explanation"),
  position: integer("position").notNull(),
}, (table) => [uniqueIndex("quiz_options_position_idx").on(table.questionId, table.position)]);

// draft = saved, not submitted · pending = submitted, waiting (assignment: "Chờ chấm") · graded.
// Quizzes and coding submissions are auto-graded and go straight to graded.
export const submissionStatus = pgEnum("submission_status", ["draft", "pending", "graded"]);
// Coding only: "Chạy" (run, sample tests, never counts) vs "Nộp bài" (submit, every test, latest counts — D7).
export const submissionMode = pgEnum("submission_mode", ["run", "submit"]);

export const assessmentSubmissions = pgTable.withRLS("assessment_submissions", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  assessmentId: bigint("assessment_id", { mode: "number" }).notNull().references(() => assessments.id),
  // Bound to the enrollment: a submission only exists inside a course the learner owns.
  enrollmentId: bigint("enrollment_id", { mode: "number" }).notNull().references(() => studentEnrollments.id, { onDelete: "cascade" }),
  attempt: integer("attempt").notNull(),
  mode: submissionMode("mode"),
  // Text answer, or the submitted code for coding exercises.
  answerText: text("answer_text"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  linkUrl: text("link_url"),
  status: submissionStatus("status").default("draft").notNull(),
  score: numeric("score", { precision: 6, scale: 2, mode: "number" }),
  isPassed: boolean("is_passed"),
  isLate: boolean("is_late").default(false).notNull(),
  // UC-29: lecturer grade and feedback; editing a past grade keeps the same row.
  gradedBy: text("graded_by").references(() => user.id),
  gradedAt: timestamp("graded_at", { withTimezone: true }),
  feedback: text("feedback"),
  savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow().notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("submissions_attempt_idx").on(table.assessmentId, table.enrollmentId, table.attempt),
  index("submissions_enrollment_idx").on(table.enrollmentId),
  index("submissions_grading_queue_idx").on(table.status, table.submittedAt),
  check("submissions_attempt_check", sql`${table.attempt} > 0`),
  check("submissions_submitted_check", sql`${table.status} = 'draft' OR ${table.submittedAt} IS NOT NULL`),
  check("submissions_graded_check", sql`${table.status} <> 'graded' OR ${table.score} IS NOT NULL`),
]);

export const assessmentAnswers = pgTable.withRLS("assessment_answers", {
  submissionId: bigint("submission_id", { mode: "number" }).notNull().references(() => assessmentSubmissions.id, { onDelete: "cascade" }),
  questionId: bigint("question_id", { mode: "number" }).notNull().references(() => quizQuestions.id),
  selectedOptionId: bigint("selected_option_id", { mode: "number" }).references(() => quizOptions.id),
  answerText: text("answer_text"),
  // "Tôi chưa biết" in the diagnostic: no option, not correct, still evidence for BKT.
  isUnknown: boolean("is_unknown").default(false).notNull(),
  isCorrect: boolean("is_correct"),
  earnedPoints: numeric("earned_points", { precision: 6, scale: 2, mode: "number" }).default(0).notNull(),
}, (table) => [primaryKey({ columns: [table.submissionId, table.questionId] })]);

// Lecturer's saved feedback templates for grading ("Mẫu nhận xét").
export const feedbackSnippets = pgTable.withRLS("feedback_snippets", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  lecturerId: text("lecturer_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("feedback_snippets_lecturer_idx").on(table.lecturerId)]);
