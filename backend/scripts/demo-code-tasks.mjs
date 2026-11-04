// Code tasks of the "JavaScript nền tảng" courses: the assignment briefs carry their sample data in a ```js block
// (the learner's editor opens with it). The demo copies also open with a working sample solution, so a tester can
// run and submit each code task at once. Re-runnable.
//   node --env-file=.env scripts/demo-code-tasks.mjs              (course-js-001 + both demo copies)
import pg from "pg";
import { pathToFileURL } from "node:url";

const ORDERS = `const orders = [
  { id: 'DH01', customer: 'An', amount: 590000 },
  { id: 'DH02', customer: 'Bình', amount: 1290000 },
  { id: 'DH03', customer: 'An', amount: 350000 },
  { id: 'DH04', customer: 'Chi', amount: 200000 },
];`;

const ASSIGNMENTS = [
  {
    title: "Bài tập: Hàm và phạm vi",
    brief: 'Viết hàm formatPrice(n) trả về chuỗi giá VND có dấu chấm phân cách (ví dụ 1290000 → "1.290.000 ₫"). Viết code trong trình soạn thảo và bấm Chạy để thử, hoặc nộp đường dẫn tới bài làm.',
    skeleton: "function formatPrice(n) {\n  // Viết code của bạn ở đây\n}",
    solution: "// Lời giải mẫu (khoá demo): chèn dấu chấm trước mỗi nhóm 3 chữ số tính từ phải sang\nfunction formatPrice(n) {\n  return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.') + ' ₫';\n}",
    run: 'console.log(formatPrice(1290000)); // "1.290.000 ₫"\nconsole.log(formatPrice(590000));  // "590.000 ₫"',
  },
  {
    title: "Bài tập: Đối tượng và destructuring",
    brief: "Cho mảng đơn hàng orders bên dưới, viết hàm tongTheoKhach(orders) trả về tổng tiền theo từng khách hàng, dùng reduce và destructuring. Viết code trong trình soạn thảo và bấm Chạy để thử, hoặc nộp tệp .js.",
    skeleton: `${ORDERS}\n\nfunction tongTheoKhach(orders) {\n  // Viết code của bạn ở đây: reduce + destructuring { customer, amount }\n}`,
    solution: `${ORDERS}\n\n// Lời giải mẫu (khoá demo)\nfunction tongTheoKhach(orders) {\n  return orders.reduce((acc, { customer, amount }) => {\n    acc[customer] = (acc[customer] || 0) + amount;\n    return acc;\n  }, {});\n}`,
    run: "console.log(tongTheoKhach(orders)); // { An: 940000, 'Bình': 1290000, Chi: 200000 }",
    accepted: "Định dạng tệp chấp nhận: .zip, .js, .pdf.",
  },
];
const CHALLENGE_RUN = "console.log(tongTien(orders));\nconsole.log(donLonNhat(orders));\nconsole.log(demTheoTrangThai(orders));";
const CHALLENGE_DATA = "// Đơn hàng mẫu để bạn thử với console.log\nconst orders = [\n  { id: 'DH01', price: 590000, status: 'paid' },\n  { id: 'DH02', price: 1290000, status: 'pending' },\n  { id: 'DH03', price: 350000, status: 'paid' },\n];";

/** Rewrites the code tasks of one course; `demo` opens them with the sample solution. `q` is a pg query function. */
export async function applyDemoCodeTasks(q, courseId, demo) {
  for (const a of ASSIGNMENTS) {
    const code = `${demo ? a.solution : a.skeleton}\n\n${a.run}`;
    const instructions = `${a.brief}\n\n\`\`\`js\n${code}\n\`\`\`${a.accepted ? `\n\n${a.accepted}` : ""}`;
    await q(`update assessments set instructions = $3 where course_id = $1 and type = 'assignment' and title = $2`, [courseId, a.title, instructions]);
  }
  if (!demo) return;
  // The order-statistics challenge: its verified solution, with the sample data and calls, is the starter code.
  await q(`update coding_exercises e set starter_code = $2 || E'\\n\\n// Lời giải mẫu (khoá demo)\\n' || e.solution_code || E'\\n\\n' || $3
    from assessments a where a.id = e.assessment_id and a.course_id = $1 and e.solution_code is not null and e.file_name = 'don-hang.js'`,
  [courseId, CHALLENGE_DATA, CHALLENGE_RUN]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const q = (sql, params) => db.query(sql, params);
  try {
    await q("begin");
    await applyDemoCodeTasks(q, "course-js-001", false);
    for (const id of ["course-demo-js-full", "course-demo-js-draft"]) await applyDemoCodeTasks(q, id, true);
    await q("commit");
    console.log("code tasks updated: course-js-001 (data + skeleton), demo copies (data + sample solution)");
  } catch (error) {
    await q("rollback");
    throw error;
  } finally {
    await db.end();
  }
}
