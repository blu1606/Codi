"use server";
import { verifyLecturerSession } from "@/lib/lecturer-auth";
import { db } from "@/services";
import { getLecturerInsights } from "@/lib/revenue-analytics-service";
import type { LecturerInsightsDto } from "@/lib/lecturer-insights-service";

const PERIODS = ["7", "30", "90"];

/** Revenue of the signed-in lecturer's own courses. The lecturer id comes from the verified session, never from the caller. */
export async function getLecturerInsightsData(period = "30"): Promise<LecturerInsightsDto> {
  const lecturer = await verifyLecturerSession();
  if (!PERIODS.includes(period)) throw new Error("Invalid analytics period");
  return getLecturerInsights(db, lecturer.id, period);
}
