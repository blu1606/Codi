"use server";
import { verifyLecturerSession } from "@/lib/lecturer-auth";
import { FINANCE_UNAVAILABLE } from "@/lib/analytics-contract";
import type { LecturerInsightsDto } from "@/lib/lecturer-insights-service";

export async function getLecturerInsightsData(): Promise<LecturerInsightsDto> {
  await verifyLecturerSession();
  return { state: "unavailable", message: FINANCE_UNAVAILABLE };
}
