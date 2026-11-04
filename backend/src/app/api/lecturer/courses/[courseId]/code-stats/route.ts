import { NextResponse } from "next/server";
import { authoringErrorResponse, getCourseCodeStats } from "@/lib/lecturer-authoring";

type Ctx = { params: Promise<{ courseId: string }> };

/** Coding-lesson statistics for the lecturer's learner-progress page. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { courseId } = await params;
    return NextResponse.json(await getCourseCodeStats(courseId));
  } catch (error) {
    return authoringErrorResponse(error);
  }
}
