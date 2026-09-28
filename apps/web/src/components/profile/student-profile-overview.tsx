"use client";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@codi-1/ui/components/card";
type ProfileData = { activities: { occurredAt: string; type: string }[]; enrollments: { enrollment: { progress: number }; course: { id: string; title: string } }[]; transactions: { id: string; createdAt: string; courseId: string; amount: number; currency: string; status: string }[] };
export default function StudentProfileOverview() {
  const currentYear = new Date().getFullYear();
  const [tab, setTab] = useState("overview");
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<ProfileData | null>(null);
  const [activities, setActivities] = useState<ProfileData["activities"]>([]);
  const [loadedYear, setLoadedYear] = useState<number | null>(currentYear);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [yearLoading, setYearLoading] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);

  useEffect(() => {
    const c = new AbortController();
    setError(null);
    fetch(`/api/student/profile?year=${currentYear}`, { signal: c.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok)
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "Không thể tải dữ liệu hồ sơ."
          );
        return body as ProfileData;
      })
      .then((body) => {
        setData(body);
        setActivities(body.activities);
        setLoadedYear(currentYear);
      })
      .catch((e) => {
        if (e instanceof Error && e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [currentYear]);

  useEffect(() => {
    if (year === loadedYear) return;
    const c = new AbortController();
    setYearLoading(true);
    setYearError(null);
    fetch(`/api/student/profile?year=${year}&scope=activities`, {
      signal: c.signal,
    })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok)
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "Không thể tải dữ liệu heatmap."
          );
        return body as Pick<ProfileData, "activities">;
      })
      .then((body) => {
        setActivities(body.activities);
        setLoadedYear(year);
      })
      .catch((e) => {
        if (e instanceof Error && e.name !== "AbortError") {
          setYearError(e.message || "Lỗi tải dữ liệu heatmap.");
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setYearLoading(false);
      });
    return () => c.abort();
  }, [year, loadedYear]);

  const activeDays = useMemo(
    () =>
      new Set(
        activities.map((a) => {
          const d = new Date(a.occurredAt);
          return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        })
      ).size,
    [activities]
  );
  const heatmap = useMemo(() => {
    const counts = new Map<string, number>();
    activities.forEach((a) => {
      const d = new Date(a.occurredAt);
      if (d.getFullYear() === year) {
        const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    });
    const start = new Date(year, 0, 1),
      end = new Date(year, 11, 31),
      first = new Date(start);
    first.setDate(start.getDate() - start.getDay());
    const weeks = [];
    for (
      let cursor = new Date(first);
      cursor <= end || cursor.getDay() !== 0;
      cursor.setDate(cursor.getDate() + 7)
    ) {
      const days = [];
      for (let day = 0; day < 7; day++) {
        const d = new Date(cursor);
        d.setDate(cursor.getDate() + day);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const inYear = d.getFullYear() === year && d <= end;
        days.push({
          date: d,
          count: inYear ? (counts.get(key) ?? 0) : 0,
          inYear,
        });
      }
      weeks.push(days);
    }
    return weeks;
  }, [activities, year]);
  const monthLabels = useMemo<{ index: number; label: string }[]>(() => {
    const labels: { index: number; label: string }[] = [];
    let last = -1;
    heatmap.forEach((week, index) => {
      const date = week.find((d) => d.inYear)?.date;
      if (date && date.getMonth() !== last) {
        labels.push({
          index,
          label: date.toLocaleDateString("en-US", { month: "short" }),
        });
        last = date.getMonth();
      }
    });
    return labels;
  }, [heatmap]);
  const courses = (data?.enrollments ?? []).map(({ enrollment, course }) => ({
    ...course,
    progress: enrollment.progress,
    status:
      enrollment.progress >= 100 ? "Đã hoàn thành" : "Đang học",
  }));

  return (
    <div className="flex flex-col gap-5">
      <nav
        className="order-1 flex gap-1 border-b border-border"
        aria-label="Điều hướng hồ sơ"
      >
        {[
          ["overview", "Tổng quan"],
          ["courses", "Khóa học"],
          ["transactions", "Giao dịch"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`border-b-2 px-3 py-2 text-xs ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Đang tải dữ liệu hồ sơ…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!loading && !error && data && (
        <>
          {(tab === "overview" || tab === "courses") && (
            <Card className="order-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="size-4 text-primary" />
                  Khóa học của tôi
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {courses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Bạn chưa đăng ký khóa học nào.
                  </p>
                ) : (
                  courses.map((c) => (
                    <div key={c.id} className="border border-border p-4">
                      <div className="flex justify-between">
                        <h3 className="text-sm font-medium">{c.title}</h3>
                        <span className="text-xs text-muted-foreground">
                          {c.status}
                        </span>
                      </div>
                      <div className="my-3 h-1.5 bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${c.progress}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{c.progress}% hoàn thành</span>
                        <Button
                          variant="link"
                          size="xs"
                          className="h-auto p-0"
                          disabled
                        >
                          {c.progress === 100 ? "Xem lại" : "Tiếp tục học"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {tab === "overview" && (
            <Card className="order-0">
              <CardHeader>
                <CardTitle className="flex justify-between text-base">
                  {yearLoading ? (
                    <span className="text-sm font-normal text-muted-foreground">
                      Đang tải hoạt động {year}…
                    </span>
                  ) : yearError ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-normal text-destructive">
                        {yearError}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLoadedYear(null)}
                        className="text-xs text-primary underline hover:text-primary/80"
                      >
                        Thử lại
                      </button>
                    </div>
                  ) : loadedYear === year ? (
                    <span>
                      {activeDays} contributions in {year}
                    </span>
                  ) : (
                    <span className="text-sm font-normal text-muted-foreground">
                      Đang cập nhật…
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-6">
                  <div className="min-w-0 flex-1 rounded-md border border-border p-4">
                    <div
                      className="overflow-hidden"
                      aria-label={`Contribution heatmap for ${year}`}
                    >
                      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)]">
                        <div />
                        <div className="grid grid-cols-[repeat(53,minmax(0,1fr))] gap-1 pb-1 text-[10px] text-muted-foreground">
                          {heatmap.map((_, i) => (
                            <span key={i} className="min-w-0">
                              {monthLabels.find((m) => m.index === i)?.label}
                            </span>
                          ))}
                        </div>
                        <div className="grid grid-rows-7 gap-1 pr-2 text-[10px] text-muted-foreground">
                          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                            (day, i) => (
                              <span key={day} className="h-3 leading-3">
                                {i % 2 === 1 ? day : ""}
                              </span>
                            )
                          )}
                        </div>
                        <div className="grid grid-flow-col grid-cols-[repeat(53,minmax(0,1fr))] grid-rows-7 gap-1">
                          {heatmap.flatMap((week, wi) =>
                            week.map((cell, di) => {
                              const dateText = cell.date.toLocaleDateString(
                                "en-US",
                                {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                }
                              );
                              return (
                                <span
                                  key={`${wi}-${di}`}
                                  title={`${cell.count === 0 ? "No contributions" : `${cell.count} contribution${cell.count === 1 ? "" : "s"}`} on ${dateText}`}
                                  className={`aspect-square w-full max-w-3 rounded-[3px] ${cell.inYear ? ["bg-muted", "bg-[#9be9a8]", "bg-[#40c463]", "bg-[#30a14e]", "bg-[#216e39]"][Math.min(4, cell.count)] : "bg-transparent"}`}
                                />
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        Less{" "}
                        <i className="size-3 rounded-[3px] bg-muted" />
                        <i className="size-3 rounded-[3px] bg-[#9be9a8]" />
                        <i className="size-3 rounded-[3px] bg-[#40c463]" />
                        <i className="size-3 rounded-[3px] bg-[#30a14e]" />
                        <i className="size-3 rounded-[3px] bg-[#216e39]" /> More
                      </span>
                    </div>
                  </div>
                  <div
                    className="flex w-28 shrink-0 flex-col gap-1 pt-1"
                    aria-label="Select year"
                  >
                    {[currentYear, currentYear - 1, currentYear - 2].map(
                      (y) => (
                        <button
                          key={y}
                          type="button"
                          onClick={() => setYear(y)}
                          aria-pressed={year === y}
                          className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${year === y ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                        >
                          {y}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === "transactions" && (
            <Card className="order-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="size-4 text-primary" />
                  Lịch sử giao dịch
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Chưa có giao dịch nào.
                  </p>
                ) : (
                  data.transactions.map((t) => (
                    <div
                      key={t.id}
                      className="flex flex-wrap gap-3 border-b py-3 text-xs"
                    >
                      <span>Mã: {t.id}</span>
                      <span>
                        Ngày:{" "}
                        {new Date(t.createdAt).toLocaleDateString("vi-VN")}
                      </span>
                      <span>Khóa học: {t.courseId}</span>
                      <span>
                        {t.amount.toLocaleString("vi-VN")} {t.currency}
                      </span>
                      <span className="text-primary">
                        <CheckCircle2 className="inline size-3.5" /> {t.status}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
export function ProfileStats(){
 const [status,setStatus]=useState<"loading"|"error"|"success">("loading");
 const [stats,setStats]=useState({progress:"",activeDays:""});
 useEffect(()=>{fetch(`/api/student/profile?year=${new Date().getFullYear()}`).then(async r=>{const v=await r.json().catch(()=>null);if(!r.ok)throw new Error(typeof v?.error==="string"?v.error:"Không thể tải thống kê");return v as ProfileData}).then(v=>{const p=v.enrollments.length?`${Math.round(v.enrollments.reduce((s,r)=>s+r.enrollment.progress,0)/v.enrollments.length)}%`:"Chưa có dữ liệu";const d=new Set(v.activities.map(a=>new Date(a.occurredAt).toLocaleDateString("en-CA"))).size;setStats({progress:p,activeDays:d?`${d} ngày`:"Chưa có dữ liệu"});setStatus("success")}).catch(()=>setStatus("error"))},[]);
 if(status==="loading") return <div role="status" className="grid gap-3 sm:grid-cols-2"><Stat icon={<TrendingUp/>} label="Tiến độ trung bình" value="Đang tải…"/><Stat icon={<Clock3/>} label="Ngày hoạt động" value="Đang tải…"/></div>;
 if(status==="error") return <div role="alert" className="text-sm text-destructive">Không thể tải thống kê hồ sơ.</div>;
 return <div className="grid gap-3 sm:grid-cols-2"><Stat icon={<TrendingUp/>} label="Tiến độ trung bình" value={stats.progress}/><Stat icon={<Clock3/>} label="Ngày hoạt động" value={stats.activeDays}/></div>
}
function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <Card><CardContent className="flex items-center gap-3 p-4"><span className="text-primary">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div></CardContent></Card>}
