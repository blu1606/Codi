// npm run seed: rebuilds database `codi` from scratch with the prototype data.
//  1. backs up the current database (pg_dump in the Docker container) when it already holds data
//  2. drops and recreates the public and drizzle schemas, then applies Codi's migrations
//  3. builds scripts/data/mockup-seed.json from the rebuild's seed (export-rebuild-seed.mjs)
//  4. runs Codi's seed-mockup.ts unchanged (password: SEED_ACCOUNT_PASSWORD, default Codi@12345)
//  5. applies the rebuild-only fields seed-mockup does not map (avatars, email verification, course covers)
//  6. converts the seed's markdown assignment rubrics into the JSON criteria Codi's grading needs
// Pass --no-backup to skip step 1.
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { createDb } from "@codi-1/db";
import { user } from "@codi-1/db/schema/auth";
import { courseDetails } from "@codi-1/db/schema/course-content";
import { ENV } from "../src/env";
import { runMigrations } from "./migrate";
import { exportRebuildSeed } from "./export-rebuild-seed.mjs";
import { normalizeAssignmentRubrics } from "./normalize-assignment-rubrics";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupDir = path.resolve(backendDir, "../../.codi-gc-preserved/db-backups");
const CONTAINER = process.env.PG_CONTAINER || "codi-rebuild-postgres";

type SeedUser = { id: string; image?: string | null; emailVerified?: boolean };
type SeedCourse = { id: string; coverImageUrl?: string | null };

function databaseName(url: string) {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

function stamp() {
  const p = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  return `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function run(command: string, args: string[], options: { stdoutFile?: string; env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: backendDir,
      env: options.env ?? process.env,
      stdio: ["ignore", options.stdoutFile ? "pipe" : "inherit", "inherit"],
      shell: process.platform === "win32" && command === "npx",
    });
    if (options.stdoutFile && child.stdout) child.stdout.pipe(createWriteStream(options.stdoutFile));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args[0] ?? ""} exited with code ${code}`))));
  });
}

async function hasData(db: ReturnType<typeof createDb>) {
  const result = await db.execute<{ present: string | null }>(sql`select to_regclass('public."user"') as present`);
  if (!result.rows[0]?.present) return false;
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(user);
  return (row?.n ?? 0) > 0;
}

async function backup(name: string) {
  mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `${name}-${stamp()}.dump`);
  try {
    await run("docker", ["exec", CONTAINER, "pg_dump", "-U", "codi", "-Fc", name], { stdoutFile: file });
  } catch (error) {
    rmSync(file, { force: true });
    throw new Error(`Backup failed, nothing was reset: ${error instanceof Error ? error.message : error}`);
  }
  if (statSync(file).size === 0) throw new Error("Backup produced an empty file, nothing was reset.");
  console.log(`→ Backup: ${file}`);
}

async function main() {
  if (ENV.NODE_ENV === "production") throw new Error("Không chạy seed dữ liệu mẫu trên môi trường production.");
  const name = databaseName(ENV.DATABASE_URL);
  const db = createDb({ DATABASE_URL: ENV.DATABASE_URL });
  try {
    if (!process.argv.includes("--no-backup") && (await hasData(db))) await backup(name);
    console.log(`→ Reset database ${name}...`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`create schema public`);
  } finally {
    await db.$client.end();
  }

  console.log("→ Migrations...");
  await runMigrations(ENV.DATABASE_URL);

  console.log("→ Seed input from backend/scripts/seed-source...");
  const data = exportRebuildSeed() as { users: SeedUser[]; courses: SeedCourse[] };

  await run("npx", ["tsx", "scripts/seed-mockup.ts"], { env: { ...process.env, DATABASE_URL: ENV.DATABASE_URL, SEED_ACCOUNT_PASSWORD: ENV.SEED_ACCOUNT_PASSWORD } });

  console.log("→ Avatars, email verification and course covers from the rebuild seed...");
  const after = createDb({ DATABASE_URL: ENV.DATABASE_URL });
  try {
    await after.transaction(async (tx) => {
      for (const u of data.users) {
        const patch: Partial<typeof user.$inferInsert> = {};
        if (u.image) patch.image = u.image;
        if (u.emailVerified === false) patch.emailVerified = false;
        if (Object.keys(patch).length) await tx.update(user).set(patch).where(eq(user.id, u.id));
      }
      for (const c of data.courses) {
        if (c.coverImageUrl) await tx.update(courseDetails).set({ coverImageUrl: c.coverImageUrl }).where(eq(courseDetails.courseId, c.id));
      }
    });
  } finally {
    await after.$client.end();
  }

  const rubrics = await normalizeAssignmentRubrics(ENV.DATABASE_URL);
  console.log(`→ Assignment rubrics: ${rubrics.changed}/${rubrics.checked} converted to JSON criteria`);
  console.log(`Xong. Đăng nhập bằng email mẫu và mật khẩu ${ENV.SEED_ACCOUNT_PASSWORD === "Codi@12345" ? "Codi@12345" : "SEED_ACCOUNT_PASSWORD"}.`);
}

main().catch((error) => {
  console.error("Seed thất bại:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
