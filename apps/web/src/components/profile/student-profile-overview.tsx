"use client";

import { useMemo, useState } from "react";
import { BookOpen, CalendarDays, CheckCircle2, Clock3, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@codi-1/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@codi-1/ui/components/card";

const courses = [
  { title: "Next.js thực chiến", teacher: "Nguyễn Minh", progress: 72, status: "Đang học" },
  { title: "TypeScript nền tảng", teacher: "Trần An", progress: 100, status: "Đã hoàn thành" },
];
const transactions = [
  { id: "CODI-2025-001", date: "12/09/2025", course: "Next.js thực chiến", amount: "799.000đ" },
  { id: "CODI-2025-002", date: "03/08/2025", course: "TypeScript nền tảng", amount: "399.000đ" },
];

export default function StudentProfileOverview() {
  const [tab, setTab] = useState("overview");
  const [year, setYear] = useState(new Date().getFullYear());
  // 53 tuần x 7 ngày, nhưng chỉ rải một số ngày có hoạt động để heatmap dễ đọc.
  const activity = useMemo(() => {
    const values = Array(371).fill(0) as number[];
    const activeDays = [18, 19, 47, 48, 49, 96, 142, 143, 188, 231, 232, 274, 275, 316, 317, 318, 344, 345, 367, 368];
    activeDays.forEach((day, index) => { values[day] = index % 4 === 0 ? 4 : index % 3 === 0 ? 3 : 2; });
    return values;
  }, [year]);
  return <div className="space-y-5">
    <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Điều hướng hồ sơ">
      {[['overview','Tổng quan'],['courses','Khóa học'],['transactions','Giao dịch']].map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`border-b-2 px-3 py-2 text-xs font-medium ${tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{label}</button>)}
    </nav>
    {(tab === "overview" || tab === "courses") && <Card><CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="size-4 text-primary" />Khóa học của tôi</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{courses.map((course) => <div key={course.title} className="border border-border p-4"><div className="mb-3 flex justify-between gap-3"><div><h3 className="text-sm font-medium">{course.title}</h3><p className="text-xs text-muted-foreground">{course.teacher}</p></div><span className="text-[11px] text-muted-foreground">{course.status}</span></div><div className="mb-2 h-1.5 bg-muted"><div className="h-full bg-primary" style={{ width: `${course.progress}%` }} /></div><div className="flex justify-between text-xs text-muted-foreground"><span>{course.progress}% hoàn thành</span><Button variant="link" size="xs" className="h-auto p-0">{course.progress === 100 ? "Xem lại" : "Tiếp tục học"}</Button></div></div>)}</CardContent></Card>}
    {tab === "overview" && <Card className="border-border/80 bg-background"><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-base"><span>20 ngày hoạt động trong năm qua</span><button type="button" className="text-xs font-normal text-muted-foreground hover:text-foreground">Tùy chọn hiển thị⌄</button></CardTitle></CardHeader><CardContent><div className="rounded-md border border-border bg-muted/10 p-4"><div className="mb-2 ml-8 grid grid-cols-12 text-xs text-muted-foreground"><span>Oct</span><span>Nov</span><span>Dec</span><span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span></div><div className="flex gap-2"><div className="grid grid-rows-7 text-xs text-muted-foreground"><span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span></div><div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto" aria-label={`Heatmap thời gian hoạt động năm ${year}`}>{activity.map((level, i) => <span key={i} title={`${level} hoạt động`} className={`size-3 shrink-0 rounded-[3px] ${['bg-muted','bg-[#9be9a8]','bg-[#40c463]','bg-[#30a14e]','bg-[#216e39]'][level]}`} />)}</div></div><div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>Hoạt động học tập theo ngày</span><span>Ít hơn <i className="mx-1 inline-block size-3 rounded-sm bg-muted" /><i className="mx-0.5 inline-block size-3 rounded-sm bg-[#9be9a8]" /><i className="mx-0.5 inline-block size-3 rounded-sm bg-[#40c463]" /><i className="mx-0.5 inline-block size-3 rounded-sm bg-[#30a14e]" /><i className="ml-0.5 inline-block size-3 rounded-sm bg-[#216e39]" /> Nhiều hơn</span></div></div><div className="mt-2 flex justify-end"><label className="text-xs text-muted-foreground">Năm <select aria-label="Chọn năm" value={year} onChange={(e) => setYear(Number(e.target.value))} className="ml-2 border border-border bg-background px-2 py-1"><option>{year}</option><option>{year - 1}</option><option>{year - 2}</option></select></label></div></CardContent></Card>}
    {tab === "transactions" && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-4 text-primary" />Lịch sử giao dịch</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-border text-muted-foreground"><tr>{['Mã giao dịch','Ngày mua','Khóa học','Số tiền','Trạng thái'].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead><tbody>{transactions.map((tx) => <tr key={tx.id} className="border-b border-border/60"><td className="px-2 py-3 font-medium">{tx.id}</td><td className="px-2 py-3">{tx.date}</td><td className="px-2 py-3">{tx.course}</td><td className="px-2 py-3">{tx.amount}</td><td className="px-2 py-3 text-primary"><CheckCircle2 className="mr-1 inline size-3.5" />Đã thanh toán</td></tr>)}</tbody></table></div></CardContent></Card>}
  </div>;
}

export function ProfileStats() { return <div className="grid gap-3 sm:grid-cols-2"><Stat icon={<TrendingUp />} label="Tiến độ trung bình" value="86%" /><Stat icon={<Clock3 />} label="Giờ học tháng này" value="12,5 giờ" /></div>; }
function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <Card><CardContent className="flex items-center gap-3 p-4"><span className="text-primary">{icon}</span><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-base font-semibold">{value}</p></div></CardContent></Card>; }
