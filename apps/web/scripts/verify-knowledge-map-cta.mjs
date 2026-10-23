// Development-only browser verification. Creates isolated accounts/course data,
// never sends email, and removes only records owned by this run in finally.
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(web, "../..");
if (!process.argv.includes("--allow-dev-db"))
  throw new Error(
    "Pass --allow-dev-db for the disposable development fixture.",
  );
process.loadEnvFile(path.join(web, ".env"));
if (process.env.NODE_ENV === "production")
  throw new Error("Run this fixture only from a development environment.");
const requireDb = createRequire(path.join(root, "packages/db/package.json"));
const requireAuth = createRequire(
  path.join(root, "packages/auth/package.json"),
);
const { Client } = requireDb("pg");
const { hashPassword } = await import(
  pathToFileURL(requireAuth.resolve("better-auth/crypto"))
);
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
const run = randomUUID();
const password = randomBytes(32).toString("base64url");
const users = ["student", "gv"].map((suffix) => ({
  id: randomUUID(),
  email: `pr160-${run}+${suffix}@example.invalid`,
}));
const courses = [];
const edgeStates = process.argv.includes("--edge-states");
let connected = false;
let committed = false;
let exitCode = 1;

async function course(label, confirmed = true) {
  const id = `qa-pr160-${run}-${label}`;
  courses.push(id);
  await client.query(
    "insert into courses (id,slug,title,category,level,duration,description,instructor_id,status,knowledge_map_status) values ($1,$1,$2,'QA','beginner','30 phút','Disposable PR160 browser fixture',$3,$4,$5)",
    [
      id,
      `QA bản đồ ${label}`,
      users[1].id,
      "published",
      confirmed ? "confirmed" : "ready",
    ],
  );
  const chapter = randomUUID();
  await client.query(
    "insert into course_chapters (id,course_id,title,is_published) values ($1,$2,'Chương QA',true)",
    [chapter, id],
  );
  const skills = [];
  const lessons = [];
  for (const [i, name] of [
    "Biến QA",
    "Hàm QA",
    "Vòng lặp QA",
    "Đã bỏ QA",
  ].entries()) {
    const { rows } = await client.query(
      "insert into skills (course_id,name,review,source) values ($1,$2,$3,'lecturer') returning id",
      [id, name, i === 3 ? "declined" : "accepted"],
    );
    skills.push(Number(rows[0].id));
    if (i === 3) continue;
    const lesson = randomUUID();
    lessons.push(lesson);
    await client.query(
      "insert into course_lessons (id,chapter_id,title,position,is_published,body) values ($1,$2,$3,$4,true,'Nội dung QA để xác minh điều hướng thật.')",
      [lesson, chapter, `Bài ${name}`, i],
    );
    await client.query(
      "insert into lesson_skills (lesson_id,skill_id) values ($1,$2)",
      [lesson, skills[i]],
    );
  }
  for (const [from, to] of [
    [0, 1],
    [1, 2],
    [2, 3],
  ]) {
    await client.query(
      "insert into skill_prerequisites (prerequisite_skill_id,skill_id,source,review) values ($1,$2,'lecturer','accepted')",
      [skills[from], skills[to]],
    );
  }
  {
    const {
      rows: [enrollment],
    } = await client.query(
      "insert into student_enrollments (user_id,course_id,learning_goal,goal_set_at,self_assessed_level,weekly_goal_minutes,diagnostic_status,path_status,path_source) values ($1,$2,'project',now(),'basic',300,'skipped','ready','default') returning id",
      [users[0].id, id],
    );
    await client.query(
      "insert into enrollment_skill_mastery (enrollment_id,skill_id,p_mastery,evidence_count,correct_count) values ($1,$2,0.9,5,5)",
      [enrollment.id, skills[0]],
    );
    await client.query(
      "insert into lesson_progress (enrollment_id,lesson_id,status,completed_at,studied_at) values ($1,$2,'completed',now(),now())",
      [enrollment.id, lessons[0]],
    );
    const {
      rows: [p],
    } = await client.query(
      "insert into personalized_learning_paths (enrollment_id,trigger,generated_by) values ($1,'default_order','system') returning id",
      [enrollment.id],
    );
    for (const [i, lesson] of lessons.entries())
      await client.query(
        "insert into path_items (path_id,lesson_id,position) values ($1,$2,$3)",
        [p.id, lesson, i + 1],
      );
  }
  if (edgeStates && confirmed)
    await client.query(
      "insert into skills (course_id,name,review,source) values ($1,'Khái niệm chưa có bài QA','accepted','lecturer')",
      [id],
    );
  return { id, skills, lessons };
}

try {
  await client.connect();
  connected = true;
  await client.query("begin");
  for (const [i, user] of users.entries()) {
    await client.query(
      'insert into "user" (id,name,email,email_verified) values ($1,$2,$3,true)',
      [user.id, i ? "QA Giảng viên" : "QA Học viên", user.email],
    );
    await client.query(
      "insert into account (id,account_id,provider_id,user_id,password,updated_at) values ($1,$2,'credential',$2,$3,now())",
      [randomUUID(), user.id, await hashPassword(password)],
    );
    await client.query(
      "insert into user_roles (user_id,role_id) values ($1,$2)",
      [user.id, i ? "LECTURER" : "LEARNER"],
    );
  }
  const learner = await course("learner");
  const unconfirmed = edgeStates ? await course("unconfirmed", false) : null;
  await client.query("commit");
  committed = true;
  console.log(
    `Created isolated QA accounts and ${courses.length} courses; no email sent.`,
  );
  exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(web, "node_modules/@playwright/test/cli.js"),
        "test",
        edgeStates
          ? "knowledge-map-edge-states.spec.ts"
          : "knowledge-map-cta.spec.ts",
        "--project=chromium-desktop",
        "--no-deps",
        "--retries=0",
        ...process.argv.slice(
          process.argv.indexOf("--") < 0
            ? process.argv.length
            : process.argv.indexOf("--") + 1,
        ),
      ],
      {
        cwd: web,
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          E2E_BASE_URL: process.env.E2E_BASE_URL || "http://localhost:3160",
          SEED_ACCOUNT_TARGETS: `pr160-${run}@example.invalid:QA`,
          SEED_ACCOUNT_PASSWORD: password,
          E2E_KMAP_CTA_FIXTURE: JSON.stringify({
            ...learner,
            unconfirmedCourseId: unconfirmed?.id,
          }),
        },
      },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} catch (error) {
  console.error(
    "QA verification failed:",
    error.code ?? error.name,
    "See browser assertions; connection values are not logged.",
  );
} finally {
  if (connected) {
    await client.query("rollback");
    if (committed) {
      await client.query("begin");
      const deleted = await client.query(
        "delete from courses where id = any($1::text[]) and instructor_id = $2 returning id",
        [courses, users[1].id],
      );
      if (deleted.rowCount !== courses.length)
        throw new Error("Owned course cleanup incomplete");
      for (const user of users) {
        const removed = await client.query(
          'delete from "user" where id=$1 and email=$2 returning id',
          [user.id, user.email],
        );
        if (removed.rowCount !== 1)
          throw new Error("Owned identity cleanup incomplete");
      }
      const {
        rows: [remaining],
      } = await client.query(
        "select (select count(*) from session where user_id=any($1::text[]))::int as sessions,(select count(*) from account where user_id=any($1::text[]))::int as credentials,(select count(*) from student_enrollments where user_id=any($1::text[]))::int as enrollments,(select count(*) from skills where course_id=any($2::text[]))::int as skills",
        [users.map((u) => u.id), courses],
      );
      if (Object.values(remaining).some((n) => n !== 0))
        throw new Error("Owned dependent data remains");
      await client.query("commit");
      console.log(
        "Removed owned QA courses/accounts; zero remaining sessions, credentials, enrollments and skills.",
      );
    }
    await client.end();
  }
}
process.exitCode = exitCode;
