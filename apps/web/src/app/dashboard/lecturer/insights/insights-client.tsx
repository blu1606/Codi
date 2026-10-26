import type { LecturerInsightsDto } from "@/lib/lecturer-insights-service";
export function InsightsClient({ data }: { data: LecturerInsightsDto }) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Doanh thu khóa học của tôi</h1>
      <p role="status">{data.message}</p>
    </section>
  );
}
