import { getLecturerInsightsData } from "./actions";
import { InsightsClient } from "./insights-client";
export default async function LecturerInsightsPage() {
  return <InsightsClient data={await getLecturerInsightsData()} />;
}
