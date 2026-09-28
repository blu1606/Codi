import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/services";
import { courses } from "@codi-1/db";

export async function GET() {
  const data = await db.select().from(courses).orderBy(asc(courses.title));
  return NextResponse.json({ courses: data });
}
