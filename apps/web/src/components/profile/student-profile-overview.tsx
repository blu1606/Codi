"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@codi-1/ui/components/card";

type Activity = { occurredAt: string; type: string };
type ProfileData = {
  activities: Activity[];
  enrollments: { enrollment: { progress: number }; course: { id: string; title: string } }[];
  transactions: { id: string; createdAt: string; courseId: string; amount: number; currency: string; status: string }[];
};

export default function StudentProfileOverview() {
  const currentYear = new Date().getFullYear();
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileRetryKey, setProfileRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/student/profile?year=${currentYear}&scope=summary`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Không thể tải dữ liệu hồ sơ.");
        return body as ProfileData;
      })
      .then(setData)
      .catch((requestError) => {
        if (requestError instanceof Error && requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [currentYear, profileRetryKey]);

  const courses = (data?.enrollments ?? []).map(({ enrollment, course }) => ({
    ...course,
    progress: enrollment.progress,
    status: enrollment.progress >= 100 ? "Đã hoàn thành" : "Đang học",
  }));

  return (
    <div className="flex flex-col gap-5">
      <nav className="order-1 flex gap-1 border-b border-border" aria-label="Điều hướng hồ sơ">
        {[["overview", "Tổng quan"], ["courses", "Khóa học"], ["transactions", "Giao dịch"]].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`border-b-2 px-3 py-2 text-xs ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>{label}</button>
        ))}
      </nav>

      {loading && <p role="status" className="text-sm text-muted-foreground">Đang tải dữ liệu hồ sơ…</p>}
      {error && <div role="alert" className="flex items-center gap-3 text-sm text-destructive"><span>{error}</span><Button type="button" variant="outline" size="xs" onClick={() => setProfileRetryKey((value) => value + 1)}>Thử lại</Button></div>}

      {!loading && !error && data && (
        <>
          {(tab === "overview" || tab === "courses") && <Card className="order-2"><CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="size-4 text-primary" />Khóa học của tôi</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{courses.length === 0 ? <p className="text-sm text-muted-foreground">Bạn chưa đăng ký khóa học nào.</p> : courses.map((course) => <div key={course.id} className="border border-border p-4"><div className="flex justify-between"><h3 className="text-sm font-medium">{course.title}</h3><span className="text-xs text-muted-foreground">{course.status}</span></div><div className="my-3 h-1.5 bg-muted"><div className="h-full bg-primary" style={{ width: `${course.progress}%` }} /></div><div className="flex justify-between text-xs text-muted-foreground"><span>{course.progress}% hoàn thành</span><Button variant="link" size="xs" className="h-auto p-0" disabled>{course.progress === 100 ? "Xem lại" : "Tiếp tục học"}</Button></div></div>)}</CardContent></Card>}

          <ContributionHeatmap currentYear={currentYear} />

          {tab === "transactions" && <Card className="order-2"><CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-4 text-primary" />Lịch sử giao dịch</CardTitle></CardHeader><CardContent>{data.transactions.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có giao dịch nào.</p> : data.transactions.map((transaction) => <div key={transaction.id} className="flex flex-wrap gap-3 border-b py-3 text-xs"><span>Mã: {transaction.id}</span><span>Ngày: {new Date(transaction.createdAt).toLocaleDateString("vi-VN")}</span><span>Khóa học: {transaction.courseId}</span><span>{transaction.amount.toLocaleString("vi-VN")} {transaction.currency}</span><span className="text-primary"><CheckCircle2 className="inline size-3.5" /> {transaction.status}</span></div>)}</CardContent></Card>}
        </>
      )}
    </div>
  );
}

const ContributionHeatmap = memo(function ContributionHeatmap({ currentYear }: { currentYear: number }) {
  const [year, setYear] = useState(currentYear);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadedYear, setLoadedYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setActivities([]);
    setLoadedYear(null);

    fetch(`/api/student/profile?year=${year}&scope=activities`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Không thể tải dữ liệu heatmap.");
        return body as { activities: Activity[] };
      })
      .then((body) => {
        setActivities(body.activities);
        setLoadedYear(year);
      })
      .catch((requestError) => {
        if (requestError instanceof Error && requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [year, retryKey]);

  const activeDays = useMemo(() => {
    if (loadedYear !== year) return null;
    return new Set(activities.map((activity) => {
      const date = new Date(activity.occurredAt);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    })).size;
  }, [activities, loadedYear, year]);

  const heatmap = useMemo(() => {
    const counts = new Map<string, number>();
    activities.forEach((activity) => {
      const date = new Date(activity.occurredAt);
      if (date.getFullYear() === year) {
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    });

    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const first = new Date(start);
    first.setDate(start.getDate() - start.getDay());
    const weeks: { date: Date; count: number; inYear: boolean }[][] = [];

    for (let cursor = new Date(first); cursor <= end || cursor.getDay() !== 0; cursor.setDate(cursor.getDate() + 7)) {
      const days = [];
      for (let day = 0; day < 7; day += 1) {
        const date = new Date(cursor);
        date.setDate(cursor.getDate() + day);
        const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        const inYear = date.getFullYear() === year && date <= end;
        days.push({ date, count: inYear ? counts.get(key) ?? 0 : 0, inYear });
      }
      weeks.push(days);
    }
    return weeks;
  }, [activities, year]);

  const monthLabels = useMemo<{ index: number; label: string }[]>(() => {
    const labels: { index: number; label: string }[] = [];
    let lastMonth = -1;
    heatmap.forEach((week, index) => {
      const date = week.find((cell) => cell.inYear)?.date;
      if (date && date.getMonth() !== lastMonth) {
        labels.push({ index, label: date.toLocaleDateString("en-US", { month: "short" }) });
        lastMonth = date.getMonth();
      }
    });
    return labels;
  }, [heatmap]);

  return (
    <Card className="order-0">
      <CardHeader><CardTitle className="flex justify-between text-base"><span>{loading ? `Đang tải đóng góp của ${year}…` : error ? `Không thể tải đóng góp của ${year}` : `${activeDays} contributions in ${year}`}</span></CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-start gap-6">
          {loading ? <p role="status" className="min-h-32 flex-1 text-sm text-muted-foreground">Đang tải heatmap…</p> : error ? <div role="alert" className="min-h-32 flex-1 space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" size="xs" onClick={() => setRetryKey((value) => value + 1)}>Thử lại</Button></div> : <div className="min-w-0 flex-1 rounded-md border border-border p-4"><div className="overflow-hidden" aria-label={`Contribution heatmap for ${year}`}><div className="grid grid-cols-[2.5rem_minmax(0,1fr)]"><div /><div className="grid grid-cols-[repeat(53,minmax(0,1fr))] gap-1 pb-1 text-[10px] text-muted-foreground">{heatmap.map((_, index) => <span key={index} className="min-w-0">{monthLabels.find((month) => month.index === index)?.label}</span>)}</div><div className="grid grid-rows-7 gap-1 pr-2 text-[10px] text-muted-foreground">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <span key={day} className="h-3 leading-3">{index % 2 === 1 ? day : ""}</span>)}</div><div className="grid grid-flow-col grid-cols-[repeat(53,minmax(0,1fr))] grid-rows-7 gap-1">{heatmap.flatMap((week, weekIndex) => week.map((cell, dayIndex) => { const dateText = cell.date.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); return <span key={`${weekIndex}-${dayIndex}`} title={`${cell.count === 0 ? "No contributions" : `${cell.count} contribution${cell.count === 1 ? "" : "s"}`} on ${dateText}`} className={`aspect-square w-full max-w-3 rounded-[3px] ${cell.inYear ? ["bg-muted", "bg-[#9be9a8]", "bg-[#40c463]", "bg-[#30a14e]", "bg-[#216e39]"][Math.min(4, cell.count)] : "bg-transparent"}`} />; }))}</div></div></div><div className="mt-3 flex justify-end text-xs text-muted-foreground"><span className="flex items-center gap-1">Less <i className="size-3 rounded-[3px] bg-muted" /><i className="size-3 rounded-[3px] bg-[#9be9a8]" /><i className="size-3 rounded-[3px] bg-[#40c463]" /><i className="size-3 rounded-[3px] bg-[#30a14e]" /><i className="size-3 rounded-[3px] bg-[#216e39]" /> More</span></div></div>}
          <div className="flex w-28 shrink-0 flex-col gap-1 pt-1" aria-label="Select year">{[currentYear, currentYear - 1, currentYear - 2].map((optionYear) => <button key={optionYear} type="button" onClick={() => setYear(optionYear)} aria-pressed={year === optionYear} className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${year === optionYear ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{optionYear}</button>)}</div>
        </div>
      </CardContent>
    </Card>
  );
});

export function ProfileStats() {
  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [stats, setStats] = useState({ progress: "", activeDays: "" });

  useEffect(() => {
    fetch(`/api/student/profile?year=${new Date().getFullYear()}`)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Không thể tải thống kê");
        return body as ProfileData;
      })
      .then((profile) => {
        const progress = profile.enrollments.length ? `${Math.round(profile.enrollments.reduce((sum, row) => sum + row.enrollment.progress, 0) / profile.enrollments.length)}%` : "Chưa có dữ liệu";
        const activeDays = new Set(profile.activities.map((activity) => new Date(activity.occurredAt).toLocaleDateString("en-CA"))).size;
        setStats({ progress, activeDays: activeDays ? `${activeDays} ngày` : "Chưa có dữ liệu" });
        setStatus("success");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") return <div role="status" className="grid gap-3 sm:grid-cols-2"><Stat icon={<TrendingUp />} label="Tiến độ trung bình" value="Đang tải…" /><Stat icon={<Clock3 />} label="Ngày hoạt động" value="Đang tải…" /></div>;
  if (status === "error") return <div role="alert" className="text-sm text-destructive">Không thể tải thống kê hồ sơ.</div>;
  return <div className="grid gap-3 sm:grid-cols-2"><Stat icon={<TrendingUp />} label="Tiến độ trung bình" value={stats.progress} /><Stat icon={<Clock3 />} label="Ngày hoạt động" value={stats.activeDays} /></div>;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><span className="text-primary">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div></CardContent></Card>;
}
