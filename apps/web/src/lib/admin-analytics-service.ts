// Admin Analytics Service for S36 (Quan sát hệ thống A1..A9) and S37 (Tài chính B1..B9)
// Source of truth: docs/mockup/js/admin-analytics.js

import {
  ANALYTICS_AS_OF,
  SEED_ANALYTICS_DAILY,
  SEED_COURSES,
  SEED_ORDERS,
  SEED_QUESTIONS,
  SEED_REVIEWS,
  SEED_SUBMISSIONS,
  SEED_VOUCHERS,
  type AnalyticsDailyRecord,
} from "./analytics-seed-data";

export interface AnalyticsWindow {
  days: number;
  cur: AnalyticsDailyRecord[];
  prev: AnalyticsDailyRecord[] | null;
  compare: boolean;
  asOf: string;
}

const DAY_MS = 86400000;

export function getAnalyticsWindow(periodStr: string = "30", compare: boolean = true): AnalyticsWindow {
  const days = periodStr === "7" ? 7 : periodStr === "90" ? 90 : 30;
  const all = SEED_ANALYTICS_DAILY;
  const cur = all.slice(-days);
  const prevAll = all.slice(-2 * days, -days);
  return {
    days,
    cur,
    prev: prevAll.length === days ? prevAll : null,
    compare,
    asOf: ANALYTICS_AS_OF,
  };
}

export const sum = <T>(arr: T[], k: keyof T | ((d: T) => number)): number =>
  arr.reduce((s, d) => s + (typeof k === "function" ? k(d) : Number(d[k]) || 0), 0);

export const avg = <T>(arr: T[], k: keyof T | ((d: T) => number)): number =>
  arr && arr.length ? sum(arr, k) / arr.length : 0;

export const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
export const dmy = (s: string) => `${dm(s)}/${s.slice(0, 4)}`;

export function median(xs: number[]): number | null {
  const a = xs.slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

export function hashString(s: string | number): number {
  let h = 7;
  for (const ch of String(s)) {
    h = (h * 31 + ch.charCodeAt(0)) % 100003;
  }
  return h;
}

export interface WeekGroup {
  start: string;
  days: AnalyticsDailyRecord[];
}

export function groupWeeks(days: AnalyticsDailyRecord[]): WeekGroup[] {
  const out: WeekGroup[] = [];
  days.forEach((d) => {
    const dt = new Date(d.date + "T00:00:00Z");
    const dow = (dt.getUTCDay() + 6) % 7;
    const start = new Date(dt.getTime() - dow * DAY_MS).toISOString().slice(0, 10);
    let w = out[out.length - 1];
    if (!w || w.start !== start) {
      w = { start, days: [] };
      out.push(w);
    }
    w.days.push(d);
  });
  return out;
}

export function makeSeries(
  days: AnalyticsDailyRecord[],
  key: keyof AnalyticsDailyRecord | ((d: AnalyticsDailyRecord) => number),
  agg: "sum" | "avg" = "sum",
  totalDays: number = 30,
) {
  if (totalDays <= 30) {
    return days.map((d) => ({
      x: d.date,
      y: typeof key === "function" ? key(d) : Number(d[key]),
      label: dm(d.date),
      date: d.date,
    }));
  }
  return groupWeeks(days).map((wk) => ({
    x: wk.start,
    y: (agg === "avg" ? avg : sum)(wk.days, key),
    label: "Tuần " + dm(wk.start),
    date: wk.start,
  }));
}

export function formatRangeText(w: AnalyticsWindow): string {
  if (!w.cur.length) return "";
  const curStart = dmy(w.cur[0]!.date);
  const curEnd = dmy(w.cur[w.cur.length - 1]!.date);
  if (!w.compare) return `${curStart} – ${curEnd}`;
  if (!w.prev) return `${curStart} – ${curEnd} · chưa có kỳ trước để so sánh`;
  const prevStart = dmy(w.prev[0]!.date);
  const prevEnd = dmy(w.prev[w.prev.length - 1]!.date);
  return `${curStart} – ${curEnd} · so với ${prevStart} – ${prevEnd}`;
}

// ───────────────────────── S36: A1..A9 Data Builders ─────────────────────────

export function getInsightsA1(w: AnalyticsWindow) {
  const pv = (k: keyof AnalyticsDailyRecord) => (w.compare && w.prev ? sum(w.prev, k) : null);
  const lastWau = w.cur[w.cur.length - 1]?.wau ?? 0;
  const prevWau = w.prev ? (w.prev[w.prev.length - 1]?.wau ?? null) : null;
  const publishedCount = SEED_COURSES.filter((c) => c.status === "published").length;
  const spark = (k: keyof AnalyticsDailyRecord) => w.cur.slice(-12).map((d) => Number(d[k]));

  const tiles = [
    { label: "Người dùng hoạt động tuần (WAU)", value: lastWau, prev: w.compare ? prevWau : null, spark: spark("wau") },
    { label: "Đăng ký mới", value: sum(w.cur, "signups"), prev: pv("signups"), spark: spark("signups") },
    { label: "Ghi danh mới", value: sum(w.cur, "newEnrolments"), prev: pv("newEnrolments"), spark: spark("newEnrolments") },
    { label: "Bài học hoàn thành", value: sum(w.cur, "lessonsCompleted"), prev: pv("lessonsCompleted"), spark: spark("lessonsCompleted") },
    { label: "Khóa đang bán", value: publishedCount, compare: false, note: "Tại thời điểm hiện tại" },
  ];

  return {
    code: "A1",
    title: "Chỉ số chính",
    question: "Nền tảng đang lớn lên hay chững lại?",
    tiles,
    table: {
      headers: ["Chỉ số", "Kỳ này", "Kỳ trước"],
      rows: tiles.map((t) => [t.label, t.value, t.prev != null ? t.prev : "—"]),
    },
  };
}

export function getInsightsA2(w: AnalyticsWindow) {
  const cur = makeSeries(w.cur, "dau", "avg", w.days);
  const prev = w.compare && w.prev ? makeSeries(w.prev, "dau", "avg", w.days) : null;
  const sticky = (days: AnalyticsDailyRecord[]) => (avg(days, "dau") / (avg(days, "wau") || 1)) * 100;

  const curAvgDau = Math.round(avg(w.cur, "dau"));
  const curSticky = sticky(w.cur);
  const prevSticky = w.prev ? sticky(w.prev) : null;

  return {
    code: "A2",
    title: "Người dùng hoạt động mỗi ngày",
    question: "DAU kỳ này so với kỳ trước",
    cur,
    prev,
    curAvgDau,
    curSticky,
    prevSticky,
    table: {
      headers: ["Mốc", "DAU kỳ này", "DAU kỳ trước"],
      rows: cur.map((p, i) => [p.label, Math.round(p.y), prev && prev[i] ? Math.round(prev[i]!.y) : "—"]),
    },
  };
}

export function getInsightsA3(w: AnalyticsWindow) {
  const steps = [
    { label: "Đăng ký", value: sum(w.cur, "signups") },
    { label: "Xác thực email", value: sum(w.cur, "verified") },
    { label: "Mua lần đầu", value: sum(w.cur, "firstPurchase") },
    { label: "Hoàn thành bài đầu tiên", value: sum(w.cur, "firstLesson") },
  ];

  const firstVal = steps[0]?.value || 1;

  return {
    code: "A3",
    title: "Phễu kích hoạt",
    question: "Người mới rơi rụng ở bước nào?",
    steps,
    table: {
      headers: ["Bước", "Số lượng", "% so với bước 1"],
      rows: steps.map((s) => [s.label, s.value, ((s.value / firstVal) * 100).toFixed(1) + "%"]),
    },
  };
}

export function getInsightsA7() {
  const cs = SEED_COURSES;
  const n = (st: string) => cs.filter((c) => c.status === st).length;
  const segs = [
    { label: "Bản nháp", value: n("draft"), tone: "neutral" as const },
    { label: "Chờ duyệt", value: n("pending"), tone: "warning" as const },
    { label: "Đã xuất bản", value: n("published"), tone: "accent" as const },
    { label: "Đã ẩn", value: n("hidden"), tone: "slot-3" as const },
    { label: "Bị từ chối", value: n("rejected"), tone: "critical" as const },
  ];

  const nowMs = new Date(ANALYTICS_AS_OF + "T23:59:59Z").getTime();
  const waits = cs
    .filter((c) => c.status === "pending" && c.submittedAt)
    .map((c) => (nowMs - new Date(c.submittedAt!).getTime()) / DAY_MS);

  const longestWait = waits.length ? Math.round(Math.max(...waits)) : null;
  const medianWait = waits.length ? Math.round(median(waits) || 0) : null;
  const pendingCount = n("pending");

  return {
    code: "A7",
    title: "Khóa học theo trạng thái",
    question: "Có khóa nào đang tắc ở khâu duyệt?",
    segs,
    longestWait,
    medianWait,
    pendingCount,
    table: {
      headers: ["Trạng thái", "Số khóa"],
      rows: segs.map((s) => [s.label, s.value]),
    },
  };
}

export function getInsightsA8() {
  const nowMs = new Date(ANALYTICS_AS_OF + "T23:59:59Z").getTime();
  const inWin = (iso: string | null | undefined, d: number) => {
    if (!iso) return false;
    const diff = nowMs - new Date(iso).getTime();
    return diff <= d * DAY_MS && new Date(iso).getTime() <= nowMs;
  };

  const subs = SEED_SUBMISSIONS;
  const qs = SEED_QUESTIONS;
  const rv = SEED_REVIEWS;

  const gradeHours = (d: number) =>
    median(
      subs
        .filter((s) => s.status === "graded" && inWin(s.gradedAt, d))
        .map((s) => (new Date(s.gradedAt!).getTime() - new Date(s.submittedAt).getTime()) / 3600000),
    );

  const unanswered = (d: number) =>
    qs.filter(
      (q) =>
        q.status !== "answered" &&
        inWin(q.createdAt, d) &&
        nowMs - new Date(q.createdAt).getTime() > 48 * 3600000,
    ).length;

  const noReply = (d: number) =>
    rv.filter((r) => !r.reply && inWin(r.createdAt, d)).length;

  const windows = [1, 7, 30];
  const rows: [string, string[]][] = [
    ["Thời gian chấm bài trung vị", windows.map((d) => { const h = gradeHours(d); return h == null ? "—" : `${Math.round(h)} giờ`; })],
    ["Câu hỏi chưa trả lời > 48 giờ", windows.map((d) => String(unanswered(d)))],
    ["Đánh giá chưa phản hồi", windows.map((d) => String(noReply(d)))],
  ];

  return {
    code: "A8",
    title: "Sức khỏe vận hành",
    question: "Học viên có đang phải chờ quá lâu?",
    windows: ["Hôm nay", "7 ngày", "30 ngày"],
    rows,
    note: "Tính từ bài nộp, câu hỏi và đánh giá thật trong dữ liệu mẫu.",
    table: {
      headers: ["Chỉ số", "Hôm nay", "7 ngày", "30 ngày"],
      rows: rows.map(([l, v]) => [l, ...v]),
    },
  };
}

export function getInsightsA4(w: AnalyticsWindow) {
  const wk = groupWeeks(SEED_ANALYTICS_DAILY.slice(-Math.max(w.days, 56))).slice(-8);
  const endMs = new Date(ANALYTICS_AS_OF + "T23:59:59Z").getTime();

  const rows = wk.map((c) => {
    const n = sum(c.days, "newEnrolments");
    const startMs = new Date(c.start + "T00:00:00Z").getTime();
    const h = hashString(c.start);
    const cells = Array.from({ length: 9 }, (_, i) => {
      if (startMs + i * 7 * DAY_MS > endMs) return null;
      if (i === 0) return 100;
      return Math.max(5, Math.round(100 * (0.56 * Math.exp(-0.24 * i) + 0.2) + ((h >> i) % 9) - 4));
    });
    return { label: "Tuần " + dm(c.start), n, cells, pinned: false };
  });

  const totalN = rows.reduce((s, r) => s + r.n, 0);
  const allRow = {
    label: "Tất cả",
    n: totalN,
    pinned: true,
    cells: Array.from({ length: 9 }, (_, i) => {
      const rs = rows.filter((r) => r.cells[i] != null);
      const nn = rs.reduce((s, r) => s + r.n, 0);
      return nn ? Math.round(rs.reduce((s, r) => s + (r.cells[i] ?? 0) * r.n, 0) / nn) : null;
    }),
  };

  const cols = Array.from({ length: 9 }, (_, i) => "T" + i);

  return {
    code: "A4",
    title: "Giữ chân theo nhóm ghi danh",
    question: "Sau bao nhiêu tuần học viên bắt đầu bỏ học?",
    cols,
    rows: [allRow, ...rows.slice().reverse()],
    note: "T0 = tuần ghi danh. Ô trống: tuần đó chưa tới. Tỉ lệ giữ chân được suy ra từ dữ liệu mẫu.",
    table: {
      headers: ["Nhóm", "n", ...cols],
      rows: [allRow, ...rows].map((r) => [
        r.label,
        r.n,
        ...r.cells.map((v) => (v == null ? "" : v + "%")),
      ]),
    },
  };
}

export function getInsightsA5(sortBy: "rate" | "n" = "rate") {
  const rows = SEED_COURSES.filter((c) => c.status === "published")
    .map((c) => {
      const n = c.learnersCount || 0;
      const rate = 18 + (hashString(c.id) % 30);
      return { c, n, rate };
    })
    .sort((a, b) => (sortBy === "n" ? b.n - a.n : b.rate - a.rate));

  return {
    code: "A5",
    title: "Tỉ lệ hoàn thành theo khóa",
    question: "Khóa nào học viên học tới cùng?",
    rows,
    sortBy,
    note: "Tỉ lệ hoàn thành được suy ra từ dữ liệu mẫu.",
    table: {
      headers: ["Khóa học", "Học viên", "Hoàn thành"],
      rows: rows.map((r) => [r.c.title, r.n, r.rate + "%"]),
    },
  };
}

export function getInsightsA6(w: AnalyticsWindow) {
  const took = sum(w.cur, "diagnosticTaken");
  const lesson1 = sum(w.cur, "startFromLesson1");
  const trend = groupWeeks(w.cur).map((wk) => ({
    x: wk.start,
    label: "Tuần " + dm(wk.start),
    y: Math.round(
      (sum(wk.days, "diagnosticTaken") / (sum(wk.days, "newEnrolments") || 1)) * 100,
    ),
  }));

  const segs = [
    { label: "Tìm điểm bắt đầu (làm bài đầu vào)", value: took, tone: "accent" as const },
    { label: "Học từ bài 1", value: lesson1, tone: "neutral" as const },
  ];

  return {
    code: "A6",
    title: "Làm bài kiểm tra đầu vào hay học từ bài 1",
    question: "Bao nhiêu học viên mới chọn tìm điểm bắt đầu?",
    segs,
    trend,
    table: {
      headers: ["Tuần", "% làm bài đầu vào"],
      rows: trend.map((t) => [t.label, t.y + "%"]),
    },
  };
}

export function getInsightsA9(w: AnalyticsWindow) {
  const errRate = (days: AnalyticsDailyRecord[]) =>
    (sum(days, "pathErrors") / (sum(days, "pathRequests") || 1)) * 100;
  const p95 = (days: AnalyticsDailyRecord[]) => median(days.map((d) => d.p95Latency)) || 0;

  const cur = makeSeries(w.cur, "p95Latency", "avg", w.days);
  const prev = w.compare && w.prev ? makeSeries(w.prev, "p95Latency", "avg", w.days) : null;

  const tiles = [
    {
      label: "Yêu cầu trợ lý / ngày",
      value: Math.round(avg(w.cur, "aiRequests")),
      prev: w.compare && w.prev ? Math.round(avg(w.prev, "aiRequests")) : null,
      compare: w.compare,
    },
    {
      label: "Lỗi tạo lộ trình",
      value: errRate(w.cur),
      prev: w.compare && w.prev ? errRate(w.prev) : null,
      deltaGood: "down" as const,
      format: (v: number) => v.toFixed(1) + "%",
      compare: w.compare,
    },
    {
      label: "Độ trễ p95 (trung vị)",
      value: p95(w.cur),
      prev: w.compare && w.prev ? p95(w.prev) : null,
      deltaGood: "down" as const,
      format: (v: number) => Math.round(v) + " ms",
      compare: w.compare,
    },
    {
      label: "Lần chạm giới hạn",
      value: sum(w.cur, "rateLimitHits"),
      prev: w.compare && w.prev ? sum(w.prev, "rateLimitHits") : null,
      deltaGood: "down" as const,
      compare: w.compare,
    },
  ];

  return {
    code: "A9",
    title: "Sức khỏe AI",
    question: "AI có đang chậm hoặc lỗi nhiều hơn?",
    tiles,
    cur,
    prev,
    note: "Lỗi, độ trễ và lần chạm giới hạn: số càng cao càng xấu.",
    table: {
      headers: ["Mốc", "p95 kỳ này (ms)", "p95 kỳ trước (ms)"],
      rows: cur.map((p, i) => [
        p.label,
        Math.round(p.y),
        prev && prev[i] ? Math.round(prev[i]!.y) : "—",
      ]),
    },
  };
}

// ───────────────────────── S37: B1..B9 Data Builders ─────────────────────────

export function getFinanceB1(w: AnalyticsWindow) {
  const k = (days: AnalyticsDailyRecord[]) => ({
    gross: sum(days, "revenue"),
    net: sum(days, "revenue") - sum(days, "discount") - sum(days, "refundAmount"),
    paid: sum(days, "ordersPaid"),
    discount: sum(days, "discount"),
    refund: sum(days, "refundAmount"),
  });

  const c = k(w.cur);
  const p = w.compare && w.prev ? k(w.prev) : null;

  const tiles = [
    { label: "Doanh thu gộp", value: c.gross, prev: p && p.gross, isVnd: true },
    { label: "Doanh thu ròng sau voucher", value: c.net, prev: p && p.net, isVnd: true },
    { label: "Đơn đã thanh toán", value: c.paid, prev: p && p.paid, isVnd: false },
    { label: "Giá trị đơn trung bình", value: c.paid ? c.gross / c.paid : 0, prev: p && p.paid ? p.gross / p.paid : null, isVnd: true },
    { label: "Tiền giảm giá", value: c.discount, prev: p && p.discount, isVnd: true, deltaGood: "down" as const },
    { label: "Hoàn tiền", value: c.refund, prev: p && p.refund, isVnd: true, deltaGood: "down" as const },
  ];

  return {
    code: "B1",
    title: "Chỉ số doanh thu",
    question: "Kỳ này thu được bao nhiêu?",
    tiles,
    table: {
      headers: ["Chỉ số", "Kỳ này", "Kỳ trước"],
      rows: tiles.map((t) => [t.label, Math.round(t.value), t.prev != null ? Math.round(t.prev) : "—"]),
    },
  };
}

export function getFinanceB2(w: AnalyticsWindow) {
  const cur = makeSeries(w.cur, "revenue", "sum", w.days);
  const prev = w.compare && w.prev ? makeSeries(w.prev, "revenue", "sum", w.days) : null;
  const mean = cur.reduce((s, p) => s + p.y, 0) / (cur.length || 1);

  return {
    code: "B2",
    title: "Doanh thu theo thời gian",
    question: `Doanh thu theo ${w.days <= 30 ? "ngày" : "tuần"}, kỳ này so với kỳ trước`,
    cur,
    prev,
    mean,
    table: {
      headers: ["Mốc", "Kỳ này", "Kỳ trước (cùng vị trí)"],
      rows: cur.map((p, i) => [
        p.label,
        Math.round(p.y),
        prev && prev[i] ? `${Math.round(prev[i]!.y)} (${prev[i]!.label})` : "—",
      ]),
    },
  };
}

export function getFinanceB4(w: AnalyticsWindow) {
  const aov = sum(w.cur, "revenue") / (sum(w.cur, "ordersPaid") || 1);
  const st = [
    { label: "Đã thanh toán", k: "ordersPaid" as const, tone: "good" as const },
    { label: "Chờ thanh toán", k: "ordersPending" as const, tone: "warning" as const },
    { label: "Hết hạn", k: "ordersExpired" as const, tone: "neutral" as const },
    { label: "Thiếu tiền", k: "ordersUnderpaid" as const, tone: "serious" as const },
    { label: "Đã huỷ", k: "ordersCancelled" as const, tone: "slot-3" as const },
    { label: "Hoàn tiền", k: "refunds" as const, tone: "critical" as const },
  ];

  const segs = st.map((s) => ({
    label: s.label,
    value: sum(w.cur, s.k),
    amount: Math.round(sum(w.cur, s.k) * aov),
    tone: s.tone,
  }));

  const created = sum(w.cur, "ordersCreated");
  const paidCount = sum(w.cur, "ordersPaid");
  const successRate = ((paidCount / (created || 1)) * 100).toFixed(1);

  const wk = groupWeeks(w.cur).map((x) => ({
    label: dm(x.start),
    values: [
      sum(x.days, "ordersPaid"),
      sum(x.days, "ordersExpired") + sum(x.days, "ordersCancelled"),
      sum(x.days, "ordersUnderpaid") + sum(x.days, "ordersPending"),
    ],
  }));

  return {
    code: "B4",
    title: "Trạng thái đơn hàng",
    question: "Bao nhiêu đơn tạo ra thực sự được thanh toán?",
    created,
    paidCount,
    successRate,
    segs,
    wk,
    table: {
      headers: ["Trạng thái", "Số đơn", "Giá trị ước tính"],
      rows: segs.map((s) => [s.label, s.value, s.amount]),
    },
  };
}

export function getFinanceB8() {
  const os = SEED_ORDERS;
  const under = os.filter((o) => o.status === "pending" && o.received > 0 && o.received < o.total);
  const stale = os.filter((o) => o.status === "pending" && o.received === 0);
  const refunds = os.filter((o) => o.status === "refund_requested");

  const cards = [
    { title: "Đơn thiếu tiền", count: under.length, list: under, hint: "Liên hệ người mua để chuyển thêm hoặc hoàn tiền." },
    { title: "Đơn chờ quá 30 phút", count: stale.length, list: stale, hint: "Đối soát sao kê với mã CODI#####." },
    { title: "Hoàn tiền chờ xử lý", count: refunds.length, list: refunds, hint: "Xác nhận và chuyển khoản hoàn tiền." },
  ];

  const total = cards.reduce((s, c) => s + c.count, 0);

  return {
    code: "B8",
    title: "Cần đối soát",
    question: "Việc gì cần làm ngay?",
    cards,
    total,
    note: "Tính từ đơn hàng thật trong dữ liệu mẫu, không phụ thuộc khoảng thời gian.",
    table: {
      headers: ["Hạng mục", "Số đơn", "Mã đơn"],
      rows: cards.map((c) => [c.title, c.count, c.list.map((o) => o.code).join(" ")]),
    },
  };
}

export function getFinanceB3(w: AnalyticsWindow, groupBy: "course" | "category" | "lecturer" = "course") {
  const totalRev = sum(w.cur, "revenue");
  const aov = totalRev / (sum(w.cur, "ordersPaid") || 1);
  const pub = SEED_COURSES.filter((c) => c.status === "published" && c.price > 0);
  const wsum = pub.reduce((s, c) => s + (c.learnersCount || 1) * c.price, 0) || 1;

  const split = pub.map((c) => ({
    c,
    revenue: Math.round((totalRev * ((c.learnersCount || 1) * c.price)) / wsum / 1000) * 1000,
  }));

  const groupKey =
    groupBy === "category"
      ? (r: (typeof split)[0]) => (r.c.categoryId === "cat-frontend" ? "Frontend" : r.c.categoryId === "cat-backend" ? "Backend" : "Công cụ")
      : groupBy === "lecturer"
        ? (r: (typeof split)[0]) => (r.c.lecturerId === "usr-lecturer-001" ? "Trần Quốc Huy" : "Nguyễn Hoàng Nam")
        : (r: (typeof split)[0]) => r.c.title;

  const groups: Record<string, number> = {};
  split.forEach((r) => {
    const k = groupKey(r);
    groups[k] = (groups[k] || 0) + r.revenue;
  });

  const rows = Object.entries(groups)
    .map(([k, v]) => ({ k, v, orders: Math.round(v / aov) }))
    .sort((a, b) => b.v - a.v);

  const head = { course: "Khóa học", category: "Danh mục", lecturer: "Giảng viên" }[groupBy];

  return {
    code: "B3",
    title: "Doanh thu theo khóa học",
    question: "Nguồn doanh thu đến từ đâu?",
    groupBy,
    head,
    rows,
    totalRev,
    note: "Doanh thu kỳ được phân bổ theo số học viên × giá của từng khóa (dữ liệu mẫu).",
    table: {
      headers: [head, "Đơn (ước tính)", "Doanh thu"],
      rows: rows.map((r) => [r.k, r.orders, r.v]),
    },
  };
}

export function getFinanceB5(w: AnalyticsWindow) {
  const steps = [
    { label: "Thêm vào giỏ / Mua ngay", value: sum(w.cur, "cartAdds") + sum(w.cur, "buyNow") },
    { label: "Tạo đơn", value: sum(w.cur, "ordersCreated") },
    { label: "Đã thanh toán", value: sum(w.cur, "ordersPaid") },
  ];

  const fromCart = sum(w.cur, "ordersFromCart");
  const created = sum(w.cur, "ordersCreated");
  const cartAdds = sum(w.cur, "cartAdds");
  const buyNow = sum(w.cur, "buyNow");
  const paidRate = ((sum(w.cur, "ordersPaid") / (created || 1)) * 100).toFixed(1);

  const sources = [
    { source: "Giỏ hàng", clicks: cartAdds, orders: fromCart, rate: ((fromCart / (cartAdds || 1)) * 100).toFixed(1) + "%" },
    { source: "Mua ngay", clicks: buyNow, orders: created - fromCart, rate: (((created - fromCart) / (buyNow || 1)) * 100).toFixed(1) + "%" },
  ];

  return {
    code: "B5",
    title: "Phễu thanh toán",
    question: "Khách bỏ ở bước nào trước khi trả tiền?",
    steps,
    sources,
    note: `Tỉ lệ thanh toán chung sau khi tạo đơn: ${paidRate}%. Nguồn được suy ra từ dữ liệu mẫu.`,
    table: {
      headers: ["Bước", "Số lượng"],
      rows: steps.map((s) => [s.label, s.value]),
    },
  };
}

export function getFinanceB6(w: AnalyticsWindow) {
  const buckets = [
    { label: "< 1 phút", value: sum(w.cur, "payLt1") },
    { label: "1–5 phút", value: sum(w.cur, "pay1to5") },
    { label: "5–15 phút", value: sum(w.cur, "pay5to15") },
    { label: "15–30 phút", value: sum(w.cur, "pay15to30") },
  ];
  const expired = sum(w.cur, "ordersExpired");

  const totalPaid = buckets.reduce((s, x) => s + x.value, 0);
  let acc = 0;
  let medianLabel: string | null = null;
  buckets.forEach((x) => {
    acc += x.value;
    if (medianLabel == null && acc >= totalPaid / 2) {
      medianLabel = x.label;
    }
  });

  return {
    code: "B6",
    title: "Thời gian từ tạo đơn đến thanh toán",
    question: "Khách mất bao lâu để chuyển khoản?",
    buckets,
    expired,
    medianLabel,
    table: {
      headers: ["Khoảng thời gian", "Số đơn"],
      rows: [...buckets.map((b) => [b.label, b.value]), ["Hết hạn", expired]],
    },
  };
}

export function getFinanceB7(w: AnalyticsWindow) {
  const share: Record<string, number> = { WELCOME20: 0.55, REACT10: 0.25, BACKEND50K: 0.12, GIAM100K: 0.08 };
  const uses = sum(w.cur, "voucherUsage");
  const disc = sum(w.cur, "discount");
  const aov = sum(w.cur, "revenue") / (sum(w.cur, "ordersPaid") || 1);
  const today = ANALYTICS_AS_OF;

  const rows = SEED_VOUCHERS.map((v) => {
    const s = share[v.code] || 0;
    const u = Math.round(uses * s);
    const status = !v.active
      ? "Ngừng"
      : v.expiresAt && v.expiresAt < today
        ? "Hết hạn"
        : v.usageLimit && v.used >= v.usageLimit
          ? "Hết lượt"
          : "Đang chạy";
    return {
      code: v.code,
      uses: u,
      discount: Math.round((disc * s) / 1000) * 1000,
      revenue: Math.round((u * aov) / 1000) * 1000,
      status,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  return {
    code: "B7",
    title: "Hiệu quả voucher",
    question: "Voucher nào mang lại doanh thu?",
    rows,
    note: "Lượt dùng trong kỳ được phân bổ theo tỉ trọng của từng mã (dữ liệu mẫu).",
    table: {
      headers: ["Mã", "Lượt dùng", "Tiền giảm", "Doanh thu có mã", "Trạng thái"],
      rows: rows.map((r) => [r.code, r.uses, r.discount, r.revenue, r.status]),
    },
  };
}
