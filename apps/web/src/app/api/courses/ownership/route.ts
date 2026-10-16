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

    const courseList = (body as { courses: Array<{ id?: unknown; price?: unknown }> }).courses
      .filter((c) => typeof c?.id === "string" && typeof c?.price === "number")
      .map((c) => ({ id: c.id as string, price: c.price as number }));

    const ownerships = await getCourseOwnershipMap(userId, courseList);
    return NextResponse.json({ ownerships, ownership: ownerships });
  } catch (error) {
    console.error("Failed to resolve course ownerships", error);
    return NextResponse.json({ error: "Không thể xác định trạng thái sở hữu." }, { status: 500 });
  }
}
