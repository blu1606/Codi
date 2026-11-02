import { NextResponse } from "next/server";
import { authoringErrorResponse, simulateKnowledgeMapAnalysis } from "@/lib/lecturer-authoring";

type Ctx = { params: Promise<{ courseId: string }> };

/** Runs the simulated knowledge-map analysis for an own, editable course. */
export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { courseId } = await params;
    return NextResponse.json(await simulateKnowledgeMapAnalysis(courseId));
  } catch (error) {
    return authoringErrorResponse(error);
  }
}
