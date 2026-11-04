import { NextResponse } from "next/server";
import { authoringErrorResponse, getLessonTutorial, readJson, saveLessonTutorial } from "@/lib/lecturer-authoring";
import { clearPublicCourseCache } from "@/lib/public-course-cache";

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
    const result = await saveLessonTutorial(courseId, lessonId, body);
    clearPublicCourseCache(); // the lesson title and duration appear on the public course page
    return NextResponse.json(result);
  } catch (error) {
    return authoringErrorResponse(error);
  }
}
