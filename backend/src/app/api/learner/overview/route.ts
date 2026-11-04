import { type NextRequest, NextResponse } from "next/server";
import { learningViewer, privateHeaders } from "@/lib/learning-path-http";
import { LearnerOverviewError } from "@/lib/learner-overview-contract";
import { overviewFailure } from "@/lib/learner-overview-http";
import { learnerOverviewService } from "@/lib/learner-overview-runtime";
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(
      await learnerOverviewService.get(await learningViewer(request)),
      { headers: privateHeaders },
    );
  } catch (error) {
    return overviewFailure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin)
      throw new LearnerOverviewError("Yêu cầu không hợp lệ.", 403);
    const userId = await learningViewer(request);
    return NextResponse.json(
      await learnerOverviewService.execute(
        userId,
        await request.json().catch(() => null),
      ),
      { headers: privateHeaders },
    );
  } catch (error) {
    return overviewFailure(error);
  }
}
