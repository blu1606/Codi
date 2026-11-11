// Puts the catalogue into the state the Playwright system tests (e2e/system) and the System Test sheet expect:
//   - "Git & GitHub cho người mới" (course-git-001) costs 199.000 ₫ (the course bought in the checkout cases);
//   - a published free course "react-native-expo" exists (TC_PAY_008 enrols in it without payment).
// The base seed ships the Git course as free and has no React Native course. Re-running is safe.
//
//   npm run seed:system-test -w backend
//
// Local databases only (see assertTestDatabase).

import { sql } from "drizzle-orm";

import { createDb } from "@codi-1/db";

import { assertTestDatabase } from "./local-test-database";

const GIT_ID = "course-git-001";
const GIT_PRICE = 199_000;
const FREE = {
  id: "course-rn-expo-001",
  slug: "react-native-expo",
  title: "Lập trình ứng dụng di động đa nền tảng với React Native & Expo",
  description: "Xây dựng ứng dụng iOS và Android từ một mã nguồn với React Native và Expo.",
};

async function main() {
  const db = createDb({ DATABASE_URL: assertTestDatabase() });
  await db.transaction(async (tx) => {
    const git = await tx.execute(sql`UPDATE courses SET price = ${GIT_PRICE}, updated_at = now() WHERE id = ${GIT_ID}`);
    if (git.rowCount !== 1) throw new Error(`${GIT_ID} not found: run npm run seed first`);

    const existing = await tx.execute(sql`SELECT 1 FROM courses WHERE slug = ${FREE.slug}`);
    if (existing.rows.length) return;
    // The free course borrows the Git course's category, level, lecturer and first lesson so its pages render fully.
    await tx.execute(sql`
      INSERT INTO courses (id, slug, title, category, level, duration, description, price, instructor_id, status, published_at)
      SELECT ${FREE.id}, ${FREE.slug}, ${FREE.title}, category, level, duration, ${FREE.description}, 0, instructor_id, 'published', now()
      FROM courses WHERE id = ${GIT_ID}`);
    await tx.execute(sql`
      INSERT INTO course_details (course_id, learning_outcomes, requirements)
      VALUES (${FREE.id}, ARRAY['Dựng ứng dụng với Expo', 'Điều hướng giữa các màn hình'], ARRAY['JavaScript cơ bản'])`);
    await tx.execute(sql`
      WITH chapter AS (
        INSERT INTO course_chapters (course_id, title, position, is_published)
        VALUES (${FREE.id}, 'Làm quen với React Native', 0, true) RETURNING id
      )
      INSERT INTO course_lessons (chapter_id, title, description, duration_seconds, position, is_published, body)
      SELECT chapter.id, 'Cài đặt Expo và chạy ứng dụng đầu tiên', 'Tạo dự án Expo và mở trên điện thoại.', 600, 0, true,
             'Cài Expo CLI, tạo dự án mới và quét mã QR bằng ứng dụng Expo Go.'
      FROM chapter`);
  });
  console.log(`System test fixtures ready: ${GIT_ID} costs ${GIT_PRICE}, free course "${FREE.slug}" published.`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
