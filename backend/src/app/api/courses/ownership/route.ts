import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/services";
import { getCourseOwnershipMap } from "@/lib/course-ownership-server";

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id ?? null;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 });
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("courses" in body) ||
      !Array.isArray((body as { courses: unknown }).courses)
    ) {
      return NextResponse.json({ error: "courses must be an array" }, { status: 400 });
    }

    const rawCourses = (body as { courses: unknown[] }).courses;
    if (rawCourses.length > 200) {
      return NextResponse.json(
        { error: "Danh sách khoá học vượt quá giới hạn tối đa (200)." },
        { status: 400 }
      );
    }

    // Extract unique course IDs, supporting both [{ id: string }] and [string]
    const idSet = new Set<string>();
    for (const item of rawCourses) {
      if (typeof item === "string" && item.trim()) {
        idSet.add(item.trim());
      } else if (typeof item === "object" && item !== null && "id" in item) {
        const id = (item as { id: unknown }).id;
        if (typeof id === "string" && id.trim()) {
          idSet.add(id.trim());
        }
      }
    }

    const courseIds = Array.from(idSet);
    const ownerships = await getCourseOwnershipMap(userId, courseIds);
    return NextResponse.json({ ownerships, ownership: ownerships });
  } catch (error) {
    console.error("Failed to resolve course ownerships", error);
    return NextResponse.json({ error: "Không thể xác định trạng thái sở hữu." }, { status: 500 });
  }
}

