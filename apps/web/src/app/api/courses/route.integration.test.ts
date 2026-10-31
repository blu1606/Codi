import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { createDb } from "@codi-1/db";

// This suite is deliberately restricted to a named, disposable localhost database.
const connection = process.env.CODI_CATALOG_TEST_DATABASE_URL;
const parsed = connection ? new URL(connection) : null;
const safe = !!parsed && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) && parsed.pathname === "/codi_catalog_test";
const { schema } = vi.hoisted(() => ({ schema: `catalog_route_test_${Math.random().toString(16).slice(2)}` }));
const url = new URL(connection || "postgresql://127.0.0.1/codi_catalog_test");
url.searchParams.set("options", `-c search_path=${schema}`);
const db = createDb({ DATABASE_URL: url.toString() });
const admin = createDb({ DATABASE_URL: connection || "postgresql://127.0.0.1/codi_catalog_test" });
vi.mock("@/services", async () => {
  const { createDb } = await import("@codi-1/db");
  const url = new URL(process.env.CODI_CATALOG_TEST_DATABASE_URL || "postgresql://127.0.0.1/codi_catalog_test");
  url.searchParams.set("options", `-c search_path=${schema}`);
  return { db: createDb({ DATABASE_URL: url.toString() }) };
});
import { db as routeDb } from "@/services";
import { GET } from "./route";
const suite = safe ? describe : describe.skip;
const snapshot = (name: string) => ({ version: 1, publicationId: "confirmed-1", publishedAt: "2026-10-31T00:00:00Z", contentGeneration: 1, skills: [{ id: 1, name, bktPInit: 0.1, bktPLearn: 0.2, bktPGuess: 0.2, bktPSlip: 0.1 }], edges: [], links: [{ lessonId: "lesson-1", skillId: 1 }] });
const get = async (query = "") => {
  const response = await GET(new NextRequest(`http://localhost/api/courses${query}`));
  expect(response.status).toBe(200);
  return (await response.json()).courses as { id: string; topics: string[]; enrollmentCount: number; status: string }[];
};

suite("public catalog against disposable PostgreSQL", () => {
  beforeAll(async () => {
    await admin.execute(sql.raw(`create schema ${schema}`));
    await db.execute(sql.raw(`create table "user" (id text primary key, name text);
      create table courses (id text primary key, slug text, title text, category text, level text, duration text,
      description text, price integer, instructor_id text, rating real, review_count integer, created_at timestamptz,
      status text, knowledge_map_status text, knowledge_map_content_generation integer, confirmed_knowledge_map jsonb);
      create table course_details (course_id text, cover_image_url text);
      create table student_enrollments (id bigint, course_id text);
      create table skills (id bigint, course_id text, name text, review text);`));
    for (const [id, lifecycle, state, map] of [
      ["a", "published", "analysing", snapshot("Old topic")],
      ["b", "published", "failed", snapshot("Old topic")],
      ["c", "published", "ready", snapshot("Old topic")],
      ["empty", "published", "confirmed", null],
      ["invalid", "published", "confirmed", { ...snapshot("Valid"), skills: [{ id: 1, name: "Valid" }, { id: 2, name: null }] }],
      ["bad-edge", "published", "confirmed", { ...snapshot("Valid"), edges: [{ from: 1, to: 999 }] }],
      ["bad-version", "published", "confirmed", { ...snapshot("Valid"), version: 2 }],
      ["bad-array", "published", "confirmed", { ...snapshot("Valid"), skills: { arbitrary: "unexpected" } }],
      ["bad-bkt", "published", "confirmed", { ...snapshot("Valid"), skills: [{ ...snapshot("Valid").skills[0], bktPGuess: 0.8, bktPSlip: 0.4 }] }],
      ["duplicate-id", "published", "confirmed", { ...snapshot("Valid"), skills: [...snapshot("Valid").skills, { ...snapshot("Valid").skills[0], name: "Duplicate id" }] }],
      ["long-name", "published", "ready", snapshot("A".repeat(140))],
      ["hidden", "hidden", "confirmed", snapshot("Hidden topic")],
    ] as const) {
      await db.execute(sql`insert into courses (id, slug, title, category, level, duration, description, price, rating, review_count, created_at, status, knowledge_map_status, knowledge_map_content_generation, confirmed_knowledge_map)
        values (${id}, ${id}, ${id}, 'cat', 'level', 'duration', 'desc', 0, 0, 0, now(), ${lifecycle}, ${state}, 2, ${JSON.stringify(map)}::jsonb)`);
    }
    await db.execute(sql.raw("insert into student_enrollments values (1,'a'), (2,'a'), (3,'b'), (4,'b'), (5,'b')"));
    await db.execute(sql.raw("insert into skills values (1,'a','Unconfirmed live edit','edited'), (2,'a','Unconfirmed accepted','accepted')"));
  });
  afterAll(async () => {
    await routeDb.$client.end();
    await db.$client.end();
    await admin.execute(sql.raw(`drop schema if exists ${schema} cascade`));
    await admin.$client.end();
  });
  it("keeps old snapshot topics while analysis runs, fails or awaits review, even after content changes", async () => {
    const rows = await get("?sort=popular");
    expect(rows.slice(0, 2).map((row) => [row.id, row.enrollmentCount, row.topics])).toEqual([
      ["b", 3, ["Old topic"]], ["a", 2, ["Old topic"]],
    ]);
    expect(rows.find((row) => row.id === "c")?.topics).toEqual(["Old topic"]);
    expect(rows.find((row) => row.id === "empty")?.topics).toEqual([]);
    expect(rows.find((row) => row.id === "invalid")?.topics).toEqual([]);
    for (const id of ["bad-edge", "bad-version", "bad-array", "bad-bkt", "duplicate-id"]) expect(rows.find((row) => row.id === id)?.topics).toEqual([]);
    expect(rows.find((row) => row.id === "long-name")?.topics).toEqual(["A".repeat(140)]);
    expect(rows.find((row) => row.id === "a")?.topics).not.toContain("Unconfirmed live edit");
    expect(rows.some((row) => row.id === "hidden")).toBe(false);
    const withHidden = await get("?include_hidden=true");
    expect(withHidden.find((row) => row.id === "hidden")?.topics).toEqual([]);
  });
  it("switches public topics only when a new snapshot is published", async () => {
    await db.execute(sql`update courses set confirmed_knowledge_map = ${JSON.stringify(snapshot("New confirmed"))}::jsonb where id = 'a'`);
    expect((await get()).find((row) => row.id === "a")?.topics).toEqual(["New confirmed"]);
  });
});
