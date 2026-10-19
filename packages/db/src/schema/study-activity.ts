import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./courses";
import { courseLessons } from "./course-content";

// Operational study-time accounting, not completion or mastery evidence.
export const studentStudyDays = pgTable.withRLS(
  "student_study_days",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    seconds: integer("seconds").default(0).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.date] }),
    check("study_days_seconds_check", sql`${t.seconds} between 0 and 86400`),
  ],
);

// One clock per learner serializes overlapping tabs; no browser-supplied duration.
export const studentStudyClocks = pgTable.withRLS("student_study_clocks", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => courseLessons.id, { onDelete: "cascade" }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});
