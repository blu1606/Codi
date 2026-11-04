// Two demo copies of "JavaScript nền tảng" (course-js-001) for a lecturer account:
//   course-demo-js-full   published, confirmed knowledge map, learners enrolled — the learner flow and the map
//   course-demo-js-draft  draft, no knowledge map — the lecturer runs the map analysis, then submits for review
// Both get every lesson kind of the source (YouTube video, reading, quiz, code challenge, guided tutorial,
// assignment, entry test) plus a slide/PDF lesson (the PDF is uploaded to R2 under the course) and a reading-only lesson.
// Re-running replaces both copies. Usage (DATABASE_URL and R2_* from the environment):
//   node --env-file=.env scripts/seed-demo-courses.mjs <slides.pdf> [lecturerEmail] [learnerEmail,...]
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const SRC = "course-js-001";
const [pdfPath, lecturerEmail = "dongthanhquandtq+gv@gmail.com", learners = "dongthanhquandtq+student@gmail.com,minhanh@codi.vn"] = process.argv.slice(2);
if (!pdfPath) throw new Error("usage: seed-demo-courses.mjs <slides.pdf> [lecturerEmail] [learnerEmails]");
const COPIES = [
  { id: "course-demo-js-full", slug: "javascript-nen-tang-demo", title: "JavaScript nền tảng (Demo đầy đủ)", published: true },
  { id: "course-demo-js-draft", slug: "javascript-nen-tang-ban-nhap", title: "JavaScript nền tảng (Bản nháp để duyệt)", published: false },
];

const READING = `## Quy ước đặt tên và phong cách code JavaScript

**Mục tiêu:** viết code JavaScript dễ đọc, nhất quán để người khác (và chính bạn sau này) hiểu nhanh.

### Đặt tên
- Biến và hàm dùng **camelCase**: \`tongTien\`, \`layDanhSachKhoaHoc()\`.
- Hằng số cấu hình dùng **UPPER_SNAKE_CASE**: \`const SO_LAN_THU_TOI_DA = 3;\`
- Class và component dùng **PascalCase**: \`class GioHang {}\`.
- Tên hàm bắt đầu bằng động từ: \`tinhTong\`, \`kiemTraEmail\`, \`hienThiLoi\`.
- Biến boolean bắt đầu bằng \`la\`, \`co\`, \`da\` (hoặc \`is\`, \`has\`): \`daDangNhap\`, \`coQuyenSua\`.

### Phong cách
- Ưu tiên \`const\`; chỉ dùng \`let\` khi cần gán lại; không dùng \`var\`.
- Luôn so sánh bằng \`===\`.
- Mỗi hàm làm một việc; hàm dài hơn ~30 dòng thường nên tách.
- Trả về sớm (early return) thay cho if lồng nhau:

\`\`\`javascript
function tinhGiamGia(donHang) {
  if (!donHang) return 0;
  if (donHang.tong < 500000) return 0;
  return donHang.tong * 0.1;
}
\`\`\`

### Lỗi thường gặp
- Tên quá ngắn (\`a\`, \`x1\`) ngoài vòng lặp ngắn.
- Trộn tiếng Anh và tiếng Việt không dấu trong cùng một tên: \`getDanhSach\` — chọn một kiểu và giữ nhất quán.

### Tự kiểm tra
- Đổi tên các biến trong bài "Thống kê đơn hàng" theo quy ước trên.
- Viết lại một hàm có 3 tầng if lồng nhau bằng early return.`;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q = (sql, params) => db.query(sql, params);
const one = async (sql, params) => (await q(sql, params)).rows[0];

function r2() {
  const { R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: key, R2_SECRET_ACCESS_KEY: secret, R2_BUCKET: bucket } = process.env;
  if (!account || !key || !secret || !bucket) throw new Error("R2_* is not configured");
  const client = new S3Client({ region: "auto", endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: key, secretAccessKey: secret },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  return { client, bucket };
}
const mediaUrl = (key) => {
  const pub = process.env.R2_PUBLIC_URL;
  return pub && !pub.includes(".r2.cloudflarestorage.com") ? `${pub.replace(/\/$/, "")}/${key}` : `/api/lesson-media?key=${encodeURIComponent(key)}`;
};

const lecturer = await one(`select id from "user" where email = $1`, [lecturerEmail]);
if (!lecturer) throw new Error(`lecturer ${lecturerEmail} not found`);
const pdf = await readFile(pdfPath);
const storage = r2();

await q("begin");
try {
  for (const copy of COPIES) {
    await q(`delete from student_enrollments where course_id = $1`, [copy.id]);
    await q(`delete from courses where id = $1`, [copy.id]);
    const src = await one(`select * from courses where id = $1`, [SRC]);
    if (!src) throw new Error(`${SRC} not found`);
    await q(`insert into courses (id, slug, title, category, level, duration, description, price, proposed_price, instructor_id, rating, review_count,
        status, published_at, knowledge_map_status, knowledge_map_model, knowledge_map_generated_at, knowledge_map_content_generation)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,$11,$12,$13,$14,$15,0)`,
      [copy.id, copy.slug, copy.title, src.category, src.level, src.duration, src.description,
        copy.published ? src.price : 0, src.price, lecturer.id, copy.published ? "published" : "draft", copy.published ? new Date() : null,
        copy.published ? "confirmed" : "empty", copy.published ? src.knowledge_map_model : null, copy.published ? new Date() : null]);
    await q(`insert into course_details (course_id, learning_outcomes, requirements, target_audience, cover_image_url, intro_video_url, intro_video_captions_url)
      select $1, learning_outcomes, requirements, target_audience, cover_image_url, intro_video_url, intro_video_captions_url from course_details where course_id = $2`, [copy.id, SRC]);

    const chapters = new Map(); const lessons = new Map(); const assessments = new Map(); const questions = new Map(); const exercises = new Map(); const skills = new Map();
    for (const ch of (await q(`select * from course_chapters where course_id = $1 order by position`, [SRC])).rows) {
      const id = randomUUID(); chapters.set(ch.id, id);
      await q(`insert into course_chapters (id, course_id, title, position, is_published) values ($1,$2,$3,$4,$5)`, [id, copy.id, ch.title, ch.position, ch.is_published]);
    }
    const srcLessons = (await q(`select l.* from course_lessons l join course_chapters c on c.id = l.chapter_id where c.course_id = $1`, [SRC])).rows;
    for (const l of srcLessons) {
      const id = randomUUID(); lessons.set(l.id, id);
      await q(`insert into course_lessons (id, chapter_id, title, description, duration_seconds, position, is_published, body, is_free_preview, is_remedial)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id, chapters.get(l.chapter_id), l.title, l.description, l.duration_seconds, l.position, l.is_published, l.body, l.is_free_preview, l.is_remedial]);
    }
    for (const m of (await q(`select * from lesson_materials where lesson_id = any($1::uuid[])`, [[...lessons.keys()]])).rows) {
      await q(`insert into lesson_materials (lesson_id, type, title, url, file_size_kb, duration_seconds, position) values ($1,$2,$3,$4,$5,$6,$7)`,
        [lessons.get(m.lesson_id), m.type, m.title, m.url, m.file_size_kb, m.duration_seconds, m.position]);
    }
    for (const a of (await q(`select * from assessments where course_id = $1 order by id`, [SRC])).rows) {
      const row = await one(`insert into assessments (course_id, lesson_id, type, is_diagnostic, title, instructions, max_score, passing_score, time_limit_minutes, due_days,
          shuffle_questions, submission_format, max_file_size_mb, rubric, status, current_quiz_revision)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
        [copy.id, a.lesson_id ? lessons.get(a.lesson_id) : null, a.type, a.is_diagnostic, a.title, a.instructions, a.max_score, a.passing_score, a.time_limit_minutes, a.due_days,
          a.shuffle_questions, a.submission_format, a.max_file_size_mb, a.rubric, a.status, a.current_quiz_revision]);
      assessments.set(String(a.id), row.id);
    }
    for (const x of (await q(`select qq.* from quiz_questions qq join assessments a on a.id = qq.assessment_id where a.course_id = $1 order by qq.id`, [SRC])).rows) {
      const row = await one(`insert into quiz_questions (assessment_id, lesson_id, text, type, code_snippet, points, position, explanation, quiz_revision)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [assessments.get(String(x.assessment_id)), x.lesson_id ? lessons.get(x.lesson_id) : null, x.text, x.type, x.code_snippet, x.points, x.position, x.explanation, x.quiz_revision]);
      questions.set(String(x.id), row.id);
    }
    for (const o of (await q(`select o.* from quiz_options o where o.question_id = any($1::bigint[]) order by o.id`, [[...questions.keys()]])).rows) {
      await q(`insert into quiz_options (question_id, text, is_correct, explanation, position) values ($1,$2,$3,$4,$5)`,
        [questions.get(String(o.question_id)), o.text, o.is_correct, o.explanation, o.position]);
    }
    for (const e of (await q(`select e.* from coding_exercises e join assessments a on a.id = e.assessment_id where a.course_id = $1`, [SRC])).rows) {
      const row = await one(`insert into coding_exercises (assessment_id, language, starter_code, solution_code, solution_verified_at, hints, file_name, tutorial_steps)
        values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [assessments.get(String(e.assessment_id)), e.language, e.starter_code, e.solution_code, e.solution_verified_at, JSON.stringify(e.hints), e.file_name, e.tutorial_steps == null ? null : JSON.stringify(e.tutorial_steps)]);
      exercises.set(String(e.id), row.id);
    }
    for (const t of (await q(`select * from coding_test_cases where exercise_id = any($1::bigint[]) order by id`, [[...exercises.keys()]])).rows) {
      await q(`insert into coding_test_cases (exercise_id, name, input, expected_output, is_sample, position, points) values ($1,$2,$3,$4,$5,$6,$7)`,
        [exercises.get(String(t.exercise_id)), t.name, t.input, t.expected_output, t.is_sample, t.position, t.points]);
    }

    // Extra lessons at the end of chapter 1: a slide deck (PDF on R2) and a reading-only lesson.
    const firstChapter = (await one(`select id from course_chapters where course_id = $1 order by position limit 1`, [copy.id])).id;
    const nextPos = (await one(`select coalesce(max(position), -1) + 1 as p from course_lessons where chapter_id = $1`, [firstChapter])).p;
    const slideLesson = randomUUID(); const readingLesson = randomUUID();
    await q(`insert into course_lessons (id, chapter_id, title, description, duration_seconds, position, is_published, body) values
      ($1,$3,'Slide tổng hợp: cú pháp JavaScript cốt lõi','8 slide ôn nhanh biến, kiểu dữ liệu, so sánh, hàm, mảng và bất đồng bộ.',600,$4,true,$5),
      ($2,$3,'Bài đọc: Quy ước đặt tên và phong cách code','Đặt tên, early return và các lỗi phong cách hay gặp.',480,$4 + 1,true,$6)`,
      [slideLesson, readingLesson, firstChapter, nextPos,
        "## Slide tổng hợp\n\nXem 8 slide bên trên rồi trả lời các câu ở slide cuối. Slide tóm tắt lại nội dung của chương 1 và 2 để bạn ôn trước khi sang phần luyện tập.", READING]);
    const key = `lesson-media/${copy.id}/${randomUUID()}.pdf`;
    await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: pdf, ContentType: "application/pdf" }));
    await q(`insert into lesson_materials (lesson_id, type, title, url, file_size_kb, position) values ($1,'slide','Slide JavaScript nền tảng',$2,$3,0)`,
      [slideLesson, mediaUrl(key), Math.max(1, Math.round(pdf.length / 1024))]);

    if (copy.published) {
      for (const s of (await q(`select * from skills where course_id = $1 order by id`, [SRC])).rows) {
        const row = await one(`insert into skills (course_id, name, description, level, source, review, bkt_p_init, bkt_p_learn, bkt_p_guess, bkt_p_slip)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`, [copy.id, s.name, s.description, s.level, s.source, s.review, s.bkt_p_init, s.bkt_p_learn, s.bkt_p_guess, s.bkt_p_slip]);
        skills.set(String(s.id), Number(row.id));
      }
      for (const p of (await q(`select * from skill_prerequisites where skill_id = any($1::bigint[])`, [[...skills.keys()]])).rows) {
        await q(`insert into skill_prerequisites (skill_id, prerequisite_skill_id, source, review) values ($1,$2,$3,$4)`,
          [skills.get(String(p.skill_id)), skills.get(String(p.prerequisite_skill_id)), p.source, p.review]);
      }
      for (const ls of (await q(`select * from lesson_skills where lesson_id = any($1::uuid[])`, [[...lessons.keys()]])).rows) {
        await q(`insert into lesson_skills (lesson_id, skill_id) values ($1,$2)`, [lessons.get(ls.lesson_id), skills.get(String(ls.skill_id))]);
      }
      const map = src.confirmed_knowledge_map;
      const basics = skills.get(String(map.skills[0].id));
      const links = map.links.map((l) => ({ lessonId: lessons.get(l.lessonId), skillId: skills.get(String(l.skillId)) }))
        .concat([{ lessonId: slideLesson, skillId: basics }, { lessonId: readingLesson, skillId: basics }]);
      await q(`insert into lesson_skills (lesson_id, skill_id) values ($1,$3), ($2,$3)`, [slideLesson, readingLesson, basics]);
      const confirmed = { ...map, publicationId: randomUUID(), publishedAt: new Date().toISOString(), contentGeneration: 0,
        skills: map.skills.map((s) => ({ ...s, id: skills.get(String(s.id)) })),
        edges: map.edges.map((e) => ({ from: skills.get(String(e.from)), to: skills.get(String(e.to)) })), links };
      await q(`update courses set confirmed_knowledge_map = $2 where id = $1`, [copy.id, JSON.stringify(confirmed)]);
      for (const email of learners.split(",").map((s) => s.trim()).filter(Boolean)) {
        const u = await one(`select id from "user" where email = $1`, [email]);
        if (!u) { console.log(`  learner ${email} not found, skipped`); continue; }
        await q(`insert into student_enrollments (user_id, course_id, status, progress) values ($1,$2,'active',0) on conflict do nothing`, [u.id, copy.id]);
        console.log(`  enrolled ${email}`);
      }
    }
    const counts = await one(`select (select count(*) from course_lessons l join course_chapters c on c.id = l.chapter_id where c.course_id = $1) lessons,
      (select count(*) from assessments where course_id = $1) assessments, (select count(*) from skills where course_id = $1) skills`, [copy.id]);
    console.log(`${copy.id}: ${copy.published ? "published" : "draft"} · ${counts.lessons} lessons · ${counts.assessments} assessments · ${counts.skills} skills`);
  }
  await q("commit");
} catch (error) {
  await q("rollback");
  throw error;
} finally {
  await db.end();
}
