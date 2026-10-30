// Creates learner accounts for k6 load tests and writes their credentials to a CSV.
//
//   npx varlock run -- tsx packages/db/src/seed-loadtest-accounts.ts [--count 200] [--out <csv>] [--course <slug>]
//   npx varlock run -- tsx packages/db/src/seed-loadtest-accounts.ts --cleanup
//
// Accounts are loadtest+NNN@codi.test. Re-running is safe: existing accounts are updated, the
// enrolment is added only when missing, and the CSV is rewritten with fresh passwords.
// --cleanup deletes exactly the accounts matching that pattern and the rows that reference them.
//
// Never run this against a database that serves real users. Use a dedicated test database.

import "varlock/auto-load";

import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { hashPassword } from "better-auth/crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { createDb } from "./index";
import { account, user } from "./schema/auth";
import { courses, studentEnrollments } from "./schema/index";
import { roles, userRoles } from "./schema/roles";

const EMAIL_DOMAIN = "codi.test";
const EMAIL_PATTERN = /^loadtest\+\d{3,}@codi\.test$/;
const DEFAULT_COUNT = 200;
const DEFAULT_OUT = path.join(os.homedir(), ".codi-loadtest", "accounts.csv");

type Options = { cleanup: boolean; count: number; out: string; course?: string };

function parseArgs(argv: string[]): Options {
  const options: Options = { cleanup: false, count: DEFAULT_COUNT, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} needs a value`);
      return value;
    };
    if (arg === "--cleanup") options.cleanup = true;
    else if (arg === "--count") options.count = Number.parseInt(next(), 10);
    else if (arg === "--out") options.out = path.resolve(next());
    else if (arg === "--course") options.course = next();
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 1000) {
    throw new Error("--count must be an integer between 1 and 1000");
  }
  return options;
}

function emailFor(index: number) {
  return `loadtest+${String(index).padStart(3, "0")}@${EMAIL_DOMAIN}`;
}

function isOutsideRepo(file: string) {
  const relative = path.relative(process.cwd(), file);
  return relative.startsWith("..") || path.isAbsolute(relative);
}

async function seed(options: Options) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const db = createDb({ DATABASE_URL: databaseUrl });

  // Resolve the course before creating anything.
  const [course] = options.course
    ? await db.select().from(courses).where(eq(courses.slug, options.course)).limit(1)
    : await db.select().from(courses).where(eq(courses.status, "published")).orderBy(asc(courses.createdAt)).limit(1);
  if (!course || course.status !== "published") {
    throw new Error(`no published course found${options.course ? ` for slug "${options.course}"` : ""}`);
  }

  await db
    .insert(roles)
    .values([{ roleId: "LEARNER", roleName: "Learner" }])
    .onConflictDoNothing();

  const rows: string[] = ["email,password"];
  for (let index = 1; index <= options.count; index++) {
    const email = emailFor(index);
    const password = randomBytes(18).toString("base64url");
    const hashed = await hashPassword(password);

    const [found] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    let userId = found?.id;
    if (!userId) {
      userId = randomUUID().replace(/-/g, "").slice(0, 32);
      await db.insert(user).values({
        id: userId,
        name: `Load test ${String(index).padStart(3, "0")}`,
        email,
        emailVerified: true,
      });
    }

    const [credential] = await db
      .select()
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
    if (credential) {
      await db.update(account).set({ password: hashed, updatedAt: new Date() }).where(eq(account.id, credential.id));
    } else {
      await db.insert(account).values({
        id: randomUUID().replace(/-/g, "").slice(0, 32),
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashed,
      });
    }

    const [activeLearner] = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, "LEARNER"), isNull(userRoles.revokedAt)));
    if (!activeLearner) {
      await db.insert(userRoles).values({ userId, roleId: "LEARNER", grantedAt: new Date() });
    }

    const [enrolled] = await db
      .select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .where(and(eq(studentEnrollments.userId, userId), eq(studentEnrollments.courseId, course.id)));
    if (!enrolled) {
      await db.insert(studentEnrollments).values({ userId, courseId: course.id });
    }

    rows.push(`${email},${password}`);
  }

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${rows.join("\n")}\n`, { mode: 0o600 });
  console.log(`Seeded ${options.count} accounts enrolled in "${course.slug}".`);
  console.log(`Credentials written to ${options.out}${isOutsideRepo(options.out) ? "" : " (INSIDE the repository: do not commit it)"}`);
  console.log(`Set ACCOUNTS_CSV to that path. COURSE_SLUG=${course.slug}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}

async function cleanup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const db = createDb({ DATABASE_URL: databaseUrl });

  const candidates = await db.select({ id: user.id, email: user.email }).from(user).where(sql`${user.email} LIKE 'loadtest+%@codi.test'`);
  const ids = candidates.filter((row) => EMAIL_PATTERN.test(row.email)).map((row) => row.id);
  if (ids.length === 0) {
    console.log("No load-test accounts found.");
  } else {
    // Every table with a foreign key to "user" that does not cascade is cleared explicitly first.
    const references = await db.execute<{ tbl: string; col: string }>(sql`
      SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = '"user"'::regclass AND c.confdeltype <> 'c'`);
    await db.transaction(async (tx) => {
      for (const ref of references.rows) {
        await tx.execute(sql`DELETE FROM ${sql.raw(ref.tbl)} WHERE ${sql.raw(`"${ref.col}"`)} = ANY(${ids})`);
      }
      await tx.execute(sql`DELETE FROM "user" WHERE id = ANY(${ids})`);
    });
    console.log(`Deleted ${ids.length} load-test accounts and their rows.`);
  }
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.cleanup) await cleanup();
  else await seed(options);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
