import { NextResponse, type NextRequest } from "next/server";
import { learningFailure, learningViewer, privateHeaders } from "@/lib/learning-path-http";
import { learningPathService } from "@/lib/learning-path-runtime";

export async function GET(request: NextRequest) {
  try {
    const userId = await learningViewer(request);
    return NextResponse.json(await learningPathService.getKnowledgeMap(userId, request.nextUrl.searchParams.get("course") ?? undefined), { headers: privateHeaders });
  } catch (error) { return learningFailure(error); }
}
