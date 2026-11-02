import { NextResponse } from "next/server";
import { authoringErrorResponse, getLessonTutorial, readJson, saveLessonTutorial } from "@/lib/lecturer-authoring";

type Ctx = { params: Promise<{ courseId: string; lessonId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { courseId, lessonId } = await params;
    return NextResponse.json({ tutorial: await getLessonTutorial(courseId, lessonId) });
  } catch (error) {
    return authoringErrorResponse(error);
  }
}

/** Body: {title, durationMinutes, fileName, steps[{title, body, starter, isSolution?, tests?[{name, input, expectedOutput}]}]}. */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { courseId, lessonId } = await params;
    const body = await readJson(request);
    if (body === undefined) return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 });
    return NextResponse.json(await saveLessonTutorial(courseId, lessonId, body));
  } catch (error) {
    return authoringErrorResponse(error);
  }
}
