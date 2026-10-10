import { integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const courses = pgTable("courses", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  level: text("level").notNull(),
  duration: text("duration").notNull(),
  description: text("description").notNull(),
  price: integer("price").default(0).notNull(),
  instructorId: text("instructor_id").references(() => user.id),
  rating: real("rating").default(0).notNull(),
  reviewCount: integer("review_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

