import { NextResponse, type NextRequest } from "next/server";
import { getCouncilRun } from "@/lib/lesson-council";
import { lecturerClassroomFailure } from "@/lib/classroom-http";

type Ctx = { params: Promise<{ courseId: string; lessonId: string; runId: string }> };

/** One council run with every recorded turn and its draft (to reload a run the browser lost). */
export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    const { courseId, lessonId, runId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: "Không tìm thấy phiên họp này." }, { status: 404 });
    return NextResponse.json(await getCouncilRun(courseId, lessonId, runId));
  } catch (error) {
    return lecturerClassroomFailure(error);
  }
}
