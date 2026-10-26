import { and, asc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { hashPassword } from "@codi-1/auth";
import { createDb, type Database } from "@codi-1/db";
import { account, user } from "@codi-1/db/schema/auth";
import { userRoles } from "@codi-1/db/schema/roles";
import { courses } from "@codi-1/db/schema/courses";
import { courseChapters, courseLessons } from "@codi-1/db/schema/course-content";
import { orderEvents, orderItems, orders, payments, vouchers } from "@codi-1/db/schema/commerce";
import { lessonProgress } from "@codi-1/db/schema/learning";
import { studentEnrollments } from "@codi-1/db/schema/student-profile";
import { studentStudyDays } from "@codi-1/db/schema/study-activity";
import { courseDiscussions, courseReviews } from "@codi-1/db/schema/interaction";

// Demo data for the admin insights (S36), admin finance (S37) and lecturer revenue (S29b) charts.
// Writes only: 8 new learner accounts (learnerNN@codi.vn, ids usr-seed-learner-NN), orders with CODI-SEED-* codes,
// their order items / events / payments / enrolments / lesson completions, study days for the seed learners,
// three unanswered questions and three unreplied reviews, and the usage counters of the three vouchers used.
// Existing mockup learners are reused and never updated. Idempotent: an order whose code exists is skipped as a
// whole, enrolments and lesson completions are created only with their order, and study days, questions and
// reviews are skipped when present. Every seeded instant is GMT+7 (Asia/Bangkok) and relative to REF_DAY, so
// re-runs are deterministic. The whole write runs in one transaction. No schema change.
// Usage: cd apps/web && npx varlock run -- tsx scripts/seed-analytics-demo.ts [--dry-run]

const DAY = 86_400_000;
const REF_DAY = "2026-10-26"; // "today" in GMT+7 used as day 0
const CODE_PREFIX = "CODI-SEED-";
const CHUNK = 200;
const DRY_RUN = process.argv.includes("--dry-run");

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const dayString = (daysAgo: number) => new Date(Date.parse(`${REF_DAY}T00:00:00Z`) - daysAgo * DAY).toISOString().slice(0, 10);
const at = (daysAgo: number, [hh, mm]: readonly [number, number]) => new Date(`${dayString(daysAgo)}T${pad(hh)}:${pad(mm)}:00+07:00`);
const fmtVnd = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`;
const NOW_REF = at(1, [22, 0]); // completions are spread up to the evening before day 0, so nothing is in the future

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- catalogue of seed inputs
const COURSE_IDS = { R: "course-react-001", J: "course-js-001", N: "course-node-001", P: "course-python-001", G: "course-git-001" } as const;
type CourseKey = keyof typeof COURSE_IDS;
const VOUCHER_CODES = { WELCOME20: "WELCOME20", REACT10: "REACT10", BACKEND50K: "BACKEND50K" } as const;
type VoucherCode = keyof typeof VOUCHER_CODES;

const learnerId = (n: number) => `usr-learner-${pad(n, 3)}`; // mockup learners 001–010 (004 is inactive and not used)
const seedLearnerId = (n: number) => `usr-seed-learner-${n}`;
const EXISTING_LEARNERS = [1, 2, 3, 5, 6, 7, 8, 9, 10].map(learnerId);
// Sign-up days ago: each buyer's account is created before its first order.
const NEW_LEARNERS = [
  { n: 11, createdDaysAgo: 58 }, { n: 12, createdDaysAgo: 76 }, { n: 13, createdDaysAgo: 64 }, { n: 14, createdDaysAgo: 82 },
  { n: 15, createdDaysAgo: 44 }, { n: 16, createdDaysAgo: 88 }, { n: 17, createdDaysAgo: 6 }, { n: 18, createdDaysAgo: 14 },
];
const NEW_EMAILS = NEW_LEARNERS.map((l) => `learner${l.n}@codi.vn`);
const nName = (n: number) => `Học viên demo ${n}`;
const N = (n: number) => seedLearnerId(n);
const L = (n: number) => learnerId(n);

interface PaidPlan { buyer: string; daysAgo: number; time: [number, number]; courses: CourseKey[]; voucher: VoucherCode | null; refundDaysAgo?: number; ref?: string }
// Paid orders (34 paid, 2 refunded). Paid => enrolled. Each learner/course pair appears once, and each buyer's
// orders are after the account's creation day (checked in preflight).
const PAID: PaidPlan[] = [
  { ref: "a", buyer: N(11), daysAgo: 2, time: [20, 14], courses: ["R"], voucher: null },
  { buyer: L(7), daysAgo: 3, time: [9, 30], courses: ["N"], voucher: "WELCOME20" },
  { buyer: N(12), daysAgo: 5, time: [21, 5], courses: ["J"], voucher: null },
  { ref: "d", buyer: L(8), daysAgo: 6, time: [13, 10], courses: ["R"], voucher: "REACT10" },
  { buyer: N(13), daysAgo: 8, time: [19, 40], courses: ["P"], voucher: null },
  { buyer: L(5), daysAgo: 9, time: [10, 20], courses: ["N", "P"], voucher: "WELCOME20" },
  { buyer: L(9), daysAgo: 11, time: [20, 50], courses: ["J"], voucher: "BACKEND50K" },
  { buyer: N(14), daysAgo: 12, time: [8, 15], courses: ["R", "J"], voucher: "WELCOME20" },
  { buyer: L(2), daysAgo: 14, time: [19, 5], courses: ["J", "P"], voucher: "WELCOME20" },
  { buyer: L(6), daysAgo: 15, time: [12, 30], courses: ["N"], voucher: null },
  { buyer: N(15), daysAgo: 17, time: [21, 30], courses: ["R"], voucher: null },
  { buyer: L(1), daysAgo: 18, time: [9, 0], courses: ["R"], voucher: "REACT10" },
  { buyer: N(16), daysAgo: 19, time: [15, 45], courses: ["N"], voucher: null },
  { buyer: L(7), daysAgo: 21, time: [20, 10], courses: ["P"], voucher: null },
  { buyer: L(3), daysAgo: 22, time: [19, 20], courses: ["P"], voucher: null },
  { buyer: N(11), daysAgo: 24, time: [10, 0], courses: ["J"], voucher: null },
  { buyer: L(10), daysAgo: 13, time: [20, 40], courses: ["J"], voucher: "BACKEND50K" },
  { buyer: N(12), daysAgo: 28, time: [13, 25], courses: ["N"], voucher: "WELCOME20" },
  { buyer: L(8), daysAgo: 27, time: [18, 55], courses: ["P"], voucher: null },
  { ref: "t", buyer: N(13), daysAgo: 33, time: [20, 20], courses: ["R"], voucher: null },
  { buyer: L(5), daysAgo: 35, time: [9, 10], courses: ["J"], voucher: null },
  { buyer: N(14), daysAgo: 38, time: [11, 0], courses: ["N"], voucher: null },
  { buyer: L(9), daysAgo: 22, time: [19, 30], courses: ["N"], voucher: null },
  { buyer: N(15), daysAgo: 42, time: [14, 40], courses: ["J"], voucher: "WELCOME20", refundDaysAgo: 37 },
  { buyer: L(6), daysAgo: 31, time: [21, 15], courses: ["P"], voucher: null },
  { buyer: N(16), daysAgo: 47, time: [9, 50], courses: ["R"], voucher: null },
  { buyer: L(2), daysAgo: 50, time: [20, 5], courses: ["N"], voucher: "BACKEND50K" },
  { buyer: L(7), daysAgo: 27, time: [18, 0], courses: ["R"], voucher: "REACT10" },
  { buyer: N(11), daysAgo: 56, time: [19, 35], courses: ["N"], voucher: null, refundDaysAgo: 50 },
  { buyer: L(1), daysAgo: 58, time: [10, 10], courses: ["P"], voucher: null },
  { buyer: N(13), daysAgo: 62, time: [19, 0], courses: ["N"], voucher: "WELCOME20" },
  { buyer: L(8), daysAgo: 20, time: [20, 30], courses: ["N"], voucher: null },
  { buyer: L(9), daysAgo: 19, time: [21, 0], courses: ["P"], voucher: null },
  { buyer: N(12), daysAgo: 74, time: [16, 20], courses: ["R"], voucher: null },
  { buyer: N(14), daysAgo: 80, time: [10, 30], courses: ["P"], voucher: "WELCOME20" },
  { buyer: N(16), daysAgo: 86, time: [11, 15], courses: ["J"], voucher: null },
];

interface PendingPlan { buyer: string; daysAgo: number; time: [number, number]; course: CourseKey; underpaid?: boolean }
// Plain pending orders: two older than 24h, one from today. The underpaid order is pending with half received.
const PENDING: PendingPlan[] = [
  { buyer: L(1), daysAgo: 0, time: [6, 30], course: "N" },
  { buyer: N(15), daysAgo: 3, time: [14, 0], course: "P" },
  { buyer: L(6), daysAgo: 5, time: [20, 10], course: "J" },
  { buyer: N(16), daysAgo: 4, time: [11, 0], course: "P", underpaid: true },
];

// Unanswered questions older than 48h (lessons are indexed in course order, starting at 0).
const QUESTIONS = [
  { author: N(14), course: "R" as CourseKey, lessonIndex: 3, daysAgo: 3, time: [20, 15] as [number, number], body: "Em làm theo bài này nhưng state chưa cập nhật ngay sau khi gọi setState, có phải do bất đồng bộ không ạ?" },
  { author: L(9), course: "J" as CourseKey, lessonIndex: 4, daysAgo: 5, time: [21, 40] as [number, number], body: "Phần hàm bậc cao trong bài này em chưa hiểu cách truyền callback, mong thầy cô giải thích thêm ạ." },
  { author: N(12), course: "N" as CourseKey, lessonIndex: 1, daysAgo: 9, time: [19, 5] as [number, number], body: "Em chạy server Express nhưng báo cổng 3000 đã được sử dụng, em nên kiểm tra thế nào ạ?" },
];

// Unreplied visible reviews, each on an enrolment created by a paid order (matched by ref).
const REVIEWS = [
  { ref: "a", rating: 4, daysAgo: 1, time: [19, 30] as [number, number], text: "Bài giảng dễ theo dõi, phần hooks được giải thích rõ. Mong có thêm bài tập thực hành." },
  { ref: "d", rating: 5, daysAgo: 1, time: [21, 0] as [number, number], text: "Lộ trình từ cơ bản đến dự án rất hợp lý, mình học được nhiều." },
  { ref: "t", rating: 3, daysAgo: 9, time: [20, 0] as [number, number], text: "Nội dung ổn nhưng phần routing còn ít ví dụ, mong được cập nhật." },
];

// ---------------------------------------------------------------- helpers
class SeedError extends Error {}
function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new SeedError(`Thiếu biến môi trường ${name}.`);
  return value;
}

const voucherDiscount = (code: VoucherCode, subtotal: number) => {
  if (code === "WELCOME20") {
    if (subtotal < 500_000) throw new SeedError("WELCOME20 cần đơn tối thiểu 500.000 ₫.");
    return Math.floor((subtotal * 20) / 100);
  }
  if (code === "REACT10") return Math.floor((subtotal * 10) / 100);
  return Math.min(50_000, subtotal);
};

interface OrderSpec {
  code: string;
  seq: number;
  buyer: string;
  status: "pending" | "paid" | "refunded";
  createdAt: Date;
  paidAt: Date | null;
  updatedAt: Date;
  courses: CourseKey[];
  voucher: VoucherCode | null;
  subtotal: number;
  discount: number;
  total: number;
  received: number;
  events: { label: string; at: Date }[];
  payment: { txCode: string; amount: number; status: "success" | "pending"; at: Date } | null;
  enroll: boolean;
  ref?: string;
  underpaid: boolean;
}

function buildOrderSpecs(
  priceOf: Map<CourseKey, number>,
  existingCodes: Set<string>,
  createdOf: Map<string, Date>,
): { specs: OrderSpec[]; skipped: string[] } {
  const specs: OrderSpec[] = [];
  const skipped: string[] = [];
  const pick = (seq: number) => mulberry32(20261026 + seq * 7919);
  const paidSpecs = PAID.map((p, i): OrderSpec => {
    const seq = i + 1;
    const code = `${CODE_PREFIX}${pad(seq, 3)}`;
    const createdAt = at(p.daysAgo, p.time);
    const rand = pick(seq)();
    const paidAt = new Date(createdAt.getTime() + (1 + Math.floor(rand * 28)) * 60_000);
    const subtotal = p.courses.reduce((sum, c) => sum + priceOf.get(c)!, 0);
    const discount = p.voucher ? voucherDiscount(p.voucher, subtotal) : 0;
    const refunded = p.refundDaysAgo !== undefined;
    const refundAt = refunded ? at(p.refundDaysAgo!, [15, 0]) : null;
    const txCode = `${CODE_PREFIX}TX-${pad(seq, 3)}`;
    return {
      code, seq, buyer: p.buyer, status: refunded ? "refunded" : "paid", createdAt, paidAt,
      updatedAt: refundAt ?? paidAt, courses: p.courses, voucher: p.voucher, subtotal, discount,
      total: subtotal - discount, received: subtotal - discount,
      events: [
        { label: "Đã tạo đơn", at: createdAt },
        { label: "Đã nhận tiền", at: paidAt },
        ...(refundAt ? [{ label: "Đã hoàn tiền ngoài hệ thống", at: refundAt }] : []),
      ],
      payment: { txCode, amount: subtotal - discount, status: "success", at: paidAt },
      enroll: true, ref: p.ref, underpaid: false,
    };
  });
  const pendingSpecs = PENDING.map((p, j): OrderSpec => {
    const seq = PAID.length + j + 1;
    const code = `${CODE_PREFIX}${pad(seq, 3)}`;
    const createdAt = at(p.daysAgo, p.time);
    const total = priceOf.get(p.course)!;
    const received = p.underpaid ? Math.floor(total / 2) : 0;
    const partialAt = new Date(createdAt.getTime() + 20 * 60_000);
    return {
      code, seq, buyer: p.buyer, status: "pending", createdAt, paidAt: null,
      updatedAt: p.underpaid ? partialAt : createdAt, courses: [p.course], voucher: null, subtotal: total,
      discount: 0, total, received,
      events: p.underpaid
        ? [
            { label: "Đã tạo đơn", at: createdAt },
            { label: `Đã nhận một phần: ${fmtVnd(received)} (Tổng nhận: ${fmtVnd(received)} / Cần: ${fmtVnd(total)})`, at: partialAt },
          ]
        : [{ label: "Đã tạo đơn", at: createdAt }],
      payment: p.underpaid ? { txCode: `${CODE_PREFIX}TX-${pad(seq, 3)}`, amount: received, status: "pending", at: partialAt } : null,
      enroll: false, underpaid: p.underpaid === true,
    };
  });
  for (const spec of [...paidSpecs, ...pendingSpecs]) {
    if (existingCodes.has(spec.code)) {
      skipped.push(spec.code);
      continue;
    }
    const buyerCreated = createdOf.get(spec.buyer);
    if (!buyerCreated) throw new SeedError(`Người mua ${spec.buyer} không có tài khoản.`);
    if (spec.createdAt.getTime() <= buyerCreated.getTime()) throw new SeedError(`Đơn ${spec.code} trước ngày tạo tài khoản ${spec.buyer}.`);
    specs.push(spec);
  }
  return { specs, skipped };
}

// Lesson completions for one enrolment: n of the course's lessons, spread between enrolment and NOW_REF.
function completionPlan(enrolledAt: Date, courseId: string, lessonIds: string[], seed: number) {
  const total = lessonIds.length;
  const age = (NOW_REF.getTime() - enrolledAt.getTime()) / DAY;
  const cap = Math.min(total - 1, Math.max(1, Math.round(age * 1.2)));
  const n = Math.min(total - 1, 1 + Math.floor(mulberry32(seed)() * cap));
  const span = NOW_REF.getTime() - enrolledAt.getTime();
  const rows = Array.from({ length: n }, (_, i) => {
    const t = new Date(Math.round((enrolledAt.getTime() + ((i + 1) / (n + 1)) * span) / 1000) * 1000);
    return { lessonId: lessonIds[i]!, completedAt: t, startedAt: new Date(Math.max(enrolledAt.getTime(), t.getTime() - 25 * 60_000)) };
  });
  return { courseId, progress: Math.round((100 * n) / total), rows, lastActiveAt: rows.at(-1)?.completedAt ?? enrolledAt };
}

// ---------------------------------------------------------------- main
async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV === "production") throw new SeedError("Cần DATABASE_URL của môi trường phát triển.");
  const password = DRY_RUN ? null : requireEnv("SEED_ACCOUNT_PASSWORD");
  const db: Database = createDb({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    // ---- preflight (reads only)
    const existingLearners = await db.select({ id: user.id, createdAt: user.createdAt }).from(user).where(inArray(user.id, EXISTING_LEARNERS));
    if (existingLearners.length !== EXISTING_LEARNERS.length) throw new SeedError(`Thiếu tài khoản học viên mẫu: ${existingLearners.length}/${EXISTING_LEARNERS.length}.`);
    const createdOf = new Map<string, Date>(existingLearners.map((r) => [r.id, r.createdAt]));

    const seedIds = NEW_LEARNERS.map((l) => seedLearnerId(l.n));
    const takenNew = await db.select({ id: user.id, email: user.email }).from(user).where(or(inArray(user.id, seedIds), inArray(user.email, NEW_EMAILS)));
    const alreadyCreated = new Set<string>();
    for (const row of takenNew) {
      const expected = NEW_LEARNERS.find((l) => seedLearnerId(l.n) === row.id);
      if (!expected || row.email !== `learner${expected.n}@codi.vn`) throw new SeedError("Email hoặc mã tài khoản mẫu đã thuộc về tài khoản khác; dừng để không ghi đè.");
      alreadyCreated.add(row.id);
    }
    for (const l of NEW_LEARNERS) createdOf.set(seedLearnerId(l.n), at(l.createdDaysAgo, [10, 0]));

    const courseRows = await db.select({ id: courses.id, price: courses.price, title: courses.title }).from(courses).where(inArray(courses.id, Object.values(COURSE_IDS)));
    if (courseRows.length !== Object.values(COURSE_IDS).length) throw new SeedError("Thiếu khoá học mẫu.");
    const keyOf = new Map<string, CourseKey>(Object.entries(COURSE_IDS).map(([k, id]) => [id, k as CourseKey]));
    const priceOf = new Map<CourseKey, number>(courseRows.map((c) => [keyOf.get(c.id)!, c.price]));
    const titleOf = new Map<CourseKey, string>(courseRows.map((c) => [keyOf.get(c.id)!, c.title]));

    const lessonRows = await db.select({ courseId: courseChapters.courseId, lessonId: courseLessons.id, chapterPos: courseChapters.position, lessonPos: courseLessons.position })
      .from(courseLessons).innerJoin(courseChapters, eq(courseChapters.id, courseLessons.chapterId))
      .where(inArray(courseChapters.courseId, Object.values(COURSE_IDS)))
      .orderBy(asc(courseChapters.position), asc(courseLessons.position));
    const lessonsOf = new Map<CourseKey, string[]>();
    for (const row of lessonRows) {
      const key = keyOf.get(row.courseId)!;
      lessonsOf.set(key, [...(lessonsOf.get(key) ?? []), row.lessonId]);
    }
    for (const key of Object.keys(COURSE_IDS) as CourseKey[]) if ((lessonsOf.get(key)?.length ?? 0) < 2) throw new SeedError(`Khoá ${key} thiếu bài học.`);

    const voucherRows = await db.select({ id: vouchers.id, code: vouchers.code, usageLimit: vouchers.usageLimit, usedCount: vouchers.usedCount })
      .from(vouchers).where(inArray(vouchers.code, Object.values(VOUCHER_CODES)));
    if (voucherRows.length !== 3) throw new SeedError("Thiếu voucher mẫu.");
    const voucherOf = new Map(voucherRows.map((v) => [v.code as VoucherCode, v]));

    const existingCodes = new Set((await db.select({ code: orders.code }).from(orders).where(like(orders.code, `${CODE_PREFIX}%`))).map((r) => r.code));
    const buyers = [...EXISTING_LEARNERS, ...seedIds];
    const owned = new Set((await db.select({ userId: studentEnrollments.userId, courseId: studentEnrollments.courseId }).from(studentEnrollments)
      .where(inArray(studentEnrollments.userId, buyers))).map((r) => `${r.userId}|${r.courseId}`));

    const { specs, skipped } = buildOrderSpecs(priceOf, existingCodes, createdOf);

    // Enrolment conflicts: a pair already owned (outside this seed) or repeated in the plan stops the run.
    const planned = new Set<string>();
    const planVoucherUse = new Map<VoucherCode, number>();
    for (const spec of specs) {
      if (spec.enroll) {
        for (const c of spec.courses) {
          const pair = `${spec.buyer}|${COURSE_IDS[c]}`;
          if (owned.has(pair) || planned.has(pair)) throw new SeedError(`Trùng ghi danh ${spec.buyer} / ${c} (đơn ${spec.code}).`);
          planned.add(pair);
        }
      }
      if (spec.voucher) planVoucherUse.set(spec.voucher, (planVoucherUse.get(spec.voucher) ?? 0) + 1);
    }
    for (const [code, need] of planVoucherUse) {
      const v = voucherOf.get(code)!;
      if (v.usageLimit !== null && v.usedCount + need > v.usageLimit) throw new SeedError(`Voucher ${code} sẽ vượt hạn mức.`);
    }
    // Free-course enrolments for the two learners who only study the free course (git).
    const freeEnrolments = [
      { buyer: seedLearnerId(17), enrolledAt: at(5, [9, 30]) },
      { buyer: seedLearnerId(18), enrolledAt: at(13, [10, 0]) },
    ].filter((f) => !owned.has(`${f.buyer}|${COURSE_IDS.G}`));

    // Study days: last 30 GMT+7 days per learner, weekends lighter, days before the account existed skipped.
    const studyLearners = [...EXISTING_LEARNERS, ...seedIds];
    const studyRows: { userId: string; date: string; seconds: number }[] = [];
    studyLearners.forEach((id, idx) => {
      const rand = mulberry32(20261026 + idx * 101);
      const created = createdOf.get(id)!;
      for (let k = 29; k >= 0; k--) {
        if (at(k, [23, 59]).getTime() <= created.getTime()) continue;
        const weekend = [0, 6].includes(new Date(Date.parse(`${dayString(k)}T00:00:00Z`)).getUTCDay());
        const roll = rand();
        const minutes = 25 + Math.floor(rand() * 70);
        if (roll < (weekend ? 0.45 : 0.75)) studyRows.push({ userId: id, date: dayString(k), seconds: minutes * 60 });
      }
    });

    const summary = {
      mode: DRY_RUN ? "dry-run" : "write",
      plannedPaidOrders: specs.filter((s) => s.status !== "pending" && !s.underpaid).length,
      refunded: specs.filter((s) => s.status === "refunded").length,
      pendingOrders: specs.filter((s) => s.status === "pending").length,
      underpaidOrders: specs.filter((s) => s.underpaid).length,
      skippedExistingCodes: skipped,
      newLearners: NEW_LEARNERS.filter((l) => !alreadyCreated.has(seedLearnerId(l.n))).length,
      enrolmentsFromOrders: specs.filter((s) => s.enroll).reduce((sum, s) => sum + s.courses.length, 0),
      freeEnrolments: freeEnrolments.length,
      voucherIncrements: Object.fromEntries(planVoucherUse),
      studyDayCandidates: studyRows.length,
      questions: QUESTIONS.length,
      reviews: REVIEWS.length,
    };
    if (DRY_RUN) {
      console.log(JSON.stringify(summary, null, 2));
      for (const s of specs) console.log(`${s.code} ${s.buyer.replace(/^usr-(learner|seed-learner)-/, "")} ${s.status}${s.underpaid ? " underpaid" : ""} ${s.courses.join("+")} total=${s.total} received=${s.received} created=${s.createdAt.toISOString()}`);
      return;
    }

    // ---- writes (one transaction)
    const counts = await db.transaction(async (tx) => {
      const c = { users: 0, accounts: 0, roles: 0, orders: 0, orderItems: 0, orderEvents: 0, payments: 0, enrolments: 0, lessonProgress: 0, voucherUses: 0, studyDays: 0, questions: 0, reviews: 0 };
      const hashed = await hashPassword(password!);

      for (const l of NEW_LEARNERS) {
        const id = seedLearnerId(l.n);
        if (alreadyCreated.has(id)) continue;
        const createdAt = at(l.createdDaysAgo, [10, 0]);
        await tx.insert(user).values({ id, name: nName(l.n), email: `learner${l.n}@codi.vn`, emailVerified: true, createdAt, updatedAt: createdAt }).onConflictDoNothing();
        c.users += 1;
        await tx.insert(account).values({ id: `seed-analytics-credential-${id}`, accountId: id, providerId: "credential", userId: id, password: hashed, createdAt, updatedAt: createdAt }).onConflictDoNothing();
        c.accounts += 1;
        await tx.insert(userRoles).values({ userId: id, roleId: "LEARNER", grantedAt: createdAt });
        c.roles += 1;
      }

      const enrolmentId = new Map<string, number>();
      const enrolWithLessons = async (buyer: string, courseKey: CourseKey, enrolledAt: Date, orderItemId: number | null, progress: number, lessonsDone: ReturnType<typeof completionPlan> | null) => {
        const [row] = await tx.insert(studentEnrollments).values({
          userId: buyer, courseId: COURSE_IDS[courseKey], enrolledAt, orderItemId, progress, status: "active",
          lastActiveAt: lessonsDone?.lastActiveAt ?? enrolledAt,
        }).returning({ id: studentEnrollments.id });
        if (!row) throw new SeedError(`Không tạo được ghi danh ${buyer} / ${courseKey}.`);
        enrolmentId.set(`${buyer}|${courseKey}`, row.id);
        c.enrolments += 1;
        if (lessonsDone && lessonsDone.rows.length) {
          await tx.insert(lessonProgress).values(lessonsDone.rows.map((r) => ({
            enrollmentId: row.id, lessonId: r.lessonId, status: "completed" as const, studiedAt: r.completedAt,
            firstStartedAt: r.startedAt, lastAccessedAt: r.completedAt, completedAt: r.completedAt,
          })));
          c.lessonProgress += lessonsDone.rows.length;
        }
        return row.id;
      };

      for (const spec of specs) {
        const [order] = await tx.insert(orders).values({
          code: spec.code, userId: spec.buyer, voucherId: spec.voucher ? voucherOf.get(spec.voucher)!.id : null,
          subtotal: spec.subtotal, discountAmount: spec.discount, totalAmount: spec.total, receivedAmount: spec.received,
          status: spec.status, failReason: null, paymentDeadline: new Date(spec.createdAt.getTime() + 30 * 60_000),
          createdAt: spec.createdAt, updatedAt: spec.updatedAt, paidAt: spec.paidAt,
        }).returning({ id: orders.id });
        c.orders += 1;
        const itemRows = await tx.insert(orderItems).values(spec.courses.map((k) => ({
          orderId: order!.id, courseId: COURSE_IDS[k], courseTitle: titleOf.get(k)!, unitPrice: priceOf.get(k)!,
        }))).returning({ id: orderItems.id, courseId: orderItems.courseId });
        c.orderItems += itemRows.length;
        await tx.insert(orderEvents).values(spec.events.map((e) => ({ orderId: order!.id, label: e.label, actorId: spec.buyer, createdAt: e.at })));
        c.orderEvents += spec.events.length;
        if (spec.payment) {
          await tx.insert(payments).values({
            orderId: order!.id, transactionCode: spec.payment.txCode, method: "bank_transfer", amount: spec.payment.amount,
            transferContent: spec.code, status: spec.payment.status, paidAt: spec.payment.at,
            providerResponse: JSON.stringify({ id: spec.payment.txCode, transferType: "in", transferAmount: spec.payment.amount, content: spec.code, source: "seed-analytics-demo" }),
          });
          c.payments += 1;
        }
        if (spec.voucher && spec.status !== "pending") {
          const v = voucherOf.get(spec.voucher)!;
          const claimed = await tx.update(vouchers).set({ usedCount: sql`${vouchers.usedCount} + 1` }).where(and(
            eq(vouchers.id, v.id), or(isNull(vouchers.usageLimit), sql`${vouchers.usedCount} < ${vouchers.usageLimit}`),
          )).returning({ id: vouchers.id });
          if (claimed.length !== 1) throw new SeedError(`Voucher ${spec.voucher} hết lượt.`);
          c.voucherUses += 1;
        }
        if (spec.enroll) {
          // One enrolment per course; lesson completions only for paid (not refunded) orders.
          for (const item of itemRows) {
            const key = keyOf.get(item.courseId)!;
            const plan = spec.status === "paid"
              ? completionPlan(spec.paidAt!, COURSE_IDS[key], lessonsOf.get(key)!, spec.seq * 31 + key.charCodeAt(0))
              : null;
            await enrolWithLessons(spec.buyer, key, spec.paidAt!, item.id, plan?.progress ?? 0, plan);
          }
        }
      }

      for (const f of freeEnrolments) {
        const plan = completionPlan(f.enrolledAt, COURSE_IDS.G, lessonsOf.get("G")!, 900 + f.buyer.length);
        await enrolWithLessons(f.buyer, "G", f.enrolledAt, null, plan.progress, plan);
      }

      for (let i = 0; i < studyRows.length; i += CHUNK) {
        const inserted = await tx.insert(studentStudyDays).values(studyRows.slice(i, i + CHUNK)).onConflictDoNothing().returning({ date: studentStudyDays.date });
        c.studyDays += inserted.length;
      }

      for (const q of QUESTIONS) {
        const [existing] = await tx.select({ id: courseDiscussions.id }).from(courseDiscussions)
          .where(and(eq(courseDiscussions.authorId, q.author), eq(courseDiscussions.body, q.body)));
        if (existing) continue;
        const lessonId = lessonsOf.get(q.course)![q.lessonIndex];
        if (!lessonId) throw new SeedError("Bài học cho câu hỏi không tồn tại.");
        await tx.insert(courseDiscussions).values({
          courseId: COURSE_IDS[q.course], lessonId, parentId: null, authorId: q.author, body: q.body,
          isLecturerReply: false, status: "unanswered", isHidden: false, createdAt: at(q.daysAgo, q.time),
        });
        c.questions += 1;
      }

      for (const r of REVIEWS) {
        const spec = PAID.find((p) => p.ref === r.ref);
        if (!spec) throw new SeedError(`Thiếu đơn tham chiếu ${r.ref}.`);
        const [enr] = await tx.select({ id: studentEnrollments.id }).from(studentEnrollments)
          .where(and(eq(studentEnrollments.userId, spec.buyer), eq(studentEnrollments.courseId, COURSE_IDS.R)));
        if (!enr) throw new SeedError(`Thiếu ghi danh cho đánh giá ${r.ref}.`);
        const [existing] = await tx.select({ id: courseReviews.id }).from(courseReviews).where(eq(courseReviews.enrollmentId, enr.id));
        if (existing) continue;
        await tx.insert(courseReviews).values({
          courseId: COURSE_IDS.R, enrollmentId: enr.id, rating: r.rating, text: r.text, isVisible: true, createdAt: at(r.daysAgo, r.time),
        });
        c.reviews += 1;
      }
      return c;
    });

    console.log(JSON.stringify({ ...summary, inserted: counts }, null, 2));
  } finally {
    await db.$client.end();
  }
}

void main().catch((error: unknown) => {
  console.error("Analytics demo seed failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
