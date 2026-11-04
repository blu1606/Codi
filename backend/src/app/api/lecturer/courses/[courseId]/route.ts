import { NextResponse } from "next/server";
import { authoringErrorResponse, deleteLecturerCourse, getLecturerCourseOutline } from "@/lib/lecturer-authoring";
import { clearPublicCourseCache } from "@/lib/public-course-cache";

type Ctx = { params: Promise<{ courseId: string }> };

/** Curriculum outline of an own course: lesson kinds, quiz sizes, code tests, rubrics and the enrolment count. */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { courseId } = await params;
    return NextResponse.json(await getLecturerCourseOutline(courseId));
  } catch (error) {
    return authoringErrorResponse(error);
  }
}

/** Deletes an own draft/rejected course without learners. */
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { courseId } = await params;
    const result = await deleteLecturerCourse(courseId);
    clearPublicCourseCache();
    return NextResponse.json(result);
  } catch (error) {
    return authoringErrorResponse(error);
  }
}
