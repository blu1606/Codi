import { getLecturerInsightsData } from "./actions";
import { InsightsClient } from "./insights-client";

export default async function LecturerInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;
  const safePeriod = period === "7" || period === "90" ? period : "30";
  return <InsightsClient data={await getLecturerInsightsData(safePeriod)} period={safePeriod} />;
}
