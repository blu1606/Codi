import { NextResponse } from "next/server";
import { authoringErrorResponse, getLessonAssignment, readJson, saveLessonAssignment } from "@/lib/lecturer-authoring";

type Ctx = { params: Promise<{ courseId: string; lessonId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { courseId, lessonId } = await params;
    return NextResponse.json({ assignment: await getLessonAssignment(courseId, lessonId) });
  } catch (error) {
    return authoringErrorResponse(error);
  }
}

/** Body: {instructions, submissionFormat, maxScore, passingScore, dueDays, rubric[]} to save, or null to remove. */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { courseId, lessonId } = await params;
    const body = await readJson(request);
    if (body === undefined) return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 });
    return NextResponse.json(await saveLessonAssignment(courseId, lessonId, body));
  } catch (error) {
    return authoringErrorResponse(error);
  }
}
