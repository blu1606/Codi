import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { LearningPathError } from "./learning-path-contract";
import { LearnerOverviewError } from "./learner-overview-contract";
import { privateHeaders } from "./learning-path-http";
export function overviewFailure(error: unknown) {
  const known =
    error instanceof LearnerOverviewError || error instanceof LearningPathError;
  const status = known ? error.status : error instanceof ZodError ? 400 : 500;
  return NextResponse.json(
    {
      error: known
        ? error.message
        : status === 400
          ? "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại."
          : "Không thể tải dữ liệu học tập. Vui lòng thử lại.",
    },
    { status, headers: privateHeaders },
  );
}
