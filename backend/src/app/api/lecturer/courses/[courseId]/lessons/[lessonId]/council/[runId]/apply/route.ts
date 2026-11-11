import { NextResponse, type NextRequest } from "next/server";
import { applyCouncilRun } from "@/lib/lesson-council";
import { applyDraftRequest } from "@/lib/classroom-contract";
import { assertSameOrigin, lecturerClassroomFailure, readBody } from "@/lib/classroom-http";

type Ctx = { params: Promise<{ courseId: string; lessonId: string; runId: string }> };

/** Body: { checkpoints? } — the lecturer's reviewed copy of the draft; without it the run's draft is applied as is. */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    assertSameOrigin(request);
    const { courseId, lessonId, runId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(runId)) return NextResponse.json({ error: "Không tìm thấy phiên họp này." }, { status: 404 });
    const body = applyDraftRequest.parse((await readBody(request)) ?? {});
    return NextResponse.json(await applyCouncilRun(courseId, lessonId, runId, body.checkpoints));
  } catch (error) {
    return lecturerClassroomFailure(error);
  }
}
