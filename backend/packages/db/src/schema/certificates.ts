import { bigint, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./courses";
import { studentEnrollments } from "./student-profile";

// Course completion certificates: one per enrollment, issued when every required lesson of the learner's path is done.
// The printed facts (course title, lecturer, lesson count, length) are a snapshot taken at issue, so later course edits
// never change a certificate that was already handed out. Verification is public by code (CODI-XXXX-XXXX).
export const courseCertificates = pgTable.withRLS("course_certificates", {
  id: bigint("id", { mode: "number" }).generatedByDefaultAsIdentity().primaryKey(),
  code: text("code").notNull(),
  enrollmentId: bigint("enrollment_id", { mode: "number" }).references(() => studentEnrollments.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  courseId: text("course_id").references(() => courses.id, { onDelete: "set null" }),
  recipientName: text("recipient_name").notNull(),
  courseTitle: text("course_title").notNull(),
  lecturerName: text("lecturer_name"),
  lessonCount: integer("lesson_count").notNull(),
  totalSeconds: integer("total_seconds").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
  // The holder may correct the printed name once.
  nameEditedAt: timestamp("name_edited_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedReason: text("revoked_reason"),
  revokedBy: text("revoked_by").references(() => user.id, { onDelete: "set null" }),
  // Set when the "you earned a certificate" email went out, so it is sent once, after the issuing transaction commits.
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("course_certificates_code_idx").on(table.code),
  uniqueIndex("course_certificates_enrollment_idx").on(table.enrollmentId),
  index("course_certificates_user_idx").on(table.userId),
]);
