import { describe, expect, it } from "vitest";
import {
  generateSlug,
  generateUniqueCourseSlug,
  isSlugUniqueConstraintError,
} from "./course-slug";

describe("generateSlug", () => {
  it.each([
    ["Lập trình Web Frontend cơ bản", "lap-trinh-web-frontend-co-ban"],
    ["Node.js & Express.js Nâng Cao", "node-js-express-js-nang-cao"],
    ["Đại số tuyến tính cho AI / ML", "dai-so-tuyen-tinh-cho-ai-ml"],
    ["  Khóa học React 19   ", "khoa-hoc-react-19"],
    ["!!!!!", "khoa-hoc"],
    ["???", "khoa-hoc"],
    ["🔥🚀💻", "khoa-hoc"],
    ["", "khoa-hoc"],
    ["123 456", "123-456"],
  ])("generates valid slug for %s -> %s", (input, expected) => {
    expect(generateSlug(input)).toBe(expected);
  });
});

describe("generateUniqueCourseSlug", () => {
  it("appends custom suffix", () => {
    expect(generateUniqueCourseSlug("React Cơ Bản", "a1b2")).toBe("react-co-ban-a1b2");
  });

  it("appends random 6-character hex suffix when not provided", () => {
    const slug1 = generateUniqueCourseSlug("React Cơ Bản");
    const slug2 = generateUniqueCourseSlug("React Cơ Bản");
    expect(slug1).toMatch(/^react-co-ban-[a-f0-9]{6}$/);
    expect(slug2).toMatch(/^react-co-ban-[a-f0-9]{6}$/);
    expect(slug1).not.toBe(slug2);
  });

  it("handles non-latin title properly", () => {
    const slug = generateUniqueCourseSlug("🎉🎉🎉", "test");
    expect(slug).toBe("khoa-hoc-test");
  });
});

describe("isSlugUniqueConstraintError (P2 Defect Fix for PR #129)", () => {
  it("detects 23505 wrapped in err.cause by Drizzle ORM (node-postgres)", () => {
    const causeErr: any = new Error(
      'duplicate key value violates unique constraint "courses_slug_unique"'
    );
    causeErr.code = "23505";
    causeErr.constraint = "courses_slug_unique";
    causeErr.detail = "Key (slug)=(typescript-advanced-a1b2c3) already exists.";

    const drizzleErr: any = new Error(
      'Failed query: insert into "courses" ("id", "slug", ...) values ($1, $2, ...)'
    );
    drizzleErr.cause = causeErr;

    expect(isSlugUniqueConstraintError(drizzleErr)).toBe(true);
  });

  it("detects direct PostgreSQL 23505 unique error with constraint", () => {
    const err: any = new Error("unique constraint violation");
    err.code = "23505";
    err.constraint = "courses_slug_unique";
    expect(isSlugUniqueConstraintError(err)).toBe(true);
  });

  it("detects direct PostgreSQL 23505 unique error with slug detail", () => {
    const err: any = new Error("unique constraint violation");
    err.code = "23505";
    err.detail = "Key (slug)=(test-slug) already exists.";
    expect(isSlugUniqueConstraintError(err)).toBe(true);
  });

  it("detects generic 23505 code when constraint details are omitted", () => {
    const err: any = { code: "23505" };
    expect(isSlugUniqueConstraintError(err)).toBe(true);
  });

  it("rejects 23505 on non-slug constraint", () => {
    const err: any = {
      code: "23505",
      constraint: "users_email_unique",
      detail: "Key (email)=(test@example.com) already exists.",
    };
    expect(isSlugUniqueConstraintError(err)).toBe(false);
  });

  it("rejects other PostgreSQL error codes (e.g. 23503 foreign key)", () => {
    const causeErr: any = new Error("foreign key constraint violation");
    causeErr.code = "23503";
    const drizzleErr: any = new Error("Failed query");
    drizzleErr.cause = causeErr;
    expect(isSlugUniqueConstraintError(drizzleErr)).toBe(false);
  });

  it("rejects standard non-database errors", () => {
    expect(isSlugUniqueConstraintError(new Error("Connection timeout"))).toBe(false);
    expect(isSlugUniqueConstraintError(null)).toBe(false);
    expect(isSlugUniqueConstraintError(undefined)).toBe(false);
    expect(isSlugUniqueConstraintError({})).toBe(false);
  });
});
