import { getLecturerInsightsData } from "./actions";
import { InsightsClient } from "./insights-client";

interface PageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function LecturerInsightsPage({ searchParams }: PageProps) {
  const { period } = await searchParams;
  const data = await getLecturerInsightsData(period);

  return <InsightsClient data={data} />;
}
