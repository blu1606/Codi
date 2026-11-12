/**
 * publication-service.ts — domain logic and rules for course publication review
 * (Admin S32 <-> Lecturer S25, S32b).
 *
 * Implements STATE-MACHINES.md §16 & §17 and docs/mockup/js/course-review.js contract:
 * - 8 readiness conditions for lecturer submission
 * - 7 criteria for admin review
 * - canApprove guards (no unmarked criteria, no 'fix' criteria, no open 'must' flags)
 * - autoCriteria suggestions
 * - rulePrecheck deterministic inspection (the model pass is publication-ai-review.ts)
 * - flag carry-over rules
 */

export const ENTRY_MIN = 5;

export type ReviewCriterionId =
  | "info"
  | "materials"
  | "quiz"
  | "entry"
  | "code"
  | "assignment"
  | "rights";

export type ReviewCriterionStatus = "pass" | "fix" | "na";
export type ReviewFlagSeverity = "must" | "should";
export type ReviewFlagStatus = "open" | "fixed" | "closed";
export type ReviewFlagSource = "admin" | "ai";
export type ReviewRoundStatus = "in_review" | "changes_requested" | "rejected" | "approved";

export interface CriterionDefinition {
  id: ReviewCriterionId;
  label: string;
  help: string;
}

export const CRITERIA: readonly CriterionDefinition[] = [
  {
    id: "info",
    label: "Mô tả, đối tượng học viên và giá đề xuất",
    help: "Mô tả đủ rõ để học viên quyết định mua; giá đề xuất hợp lý.",
  },
  {
    id: "materials",
    label: "Video, slide và tài liệu đầy đủ, xem được",
    help: "Mọi bài video/slide đều có tệp; bài đọc có nội dung.",
  },
  {
    id: "quiz",
    label: "Quiz đúng đáp án, giải thích rõ",
    help: "Đáp án đúng được đánh dấu chính xác, lựa chọn sai hợp lý.",
  },
  {
    id: "entry",
    label: `Bài kiểm tra đầu vào (≥ ${ENTRY_MIN} câu)`,
    help: "Đủ câu để Codi xếp lộ trình cá nhân.",
  },
  {
    id: "code",
    label: "Bài code có test và lời giải chạy đạt",
    help: "Có test biên, test ẩn và lời giải qua tất cả test.",
  },
  {
    id: "assignment",
    label: "Bài tập có yêu cầu rõ và thang chấm",
    help: "Có tiêu chí chấm điểm và cách nộp bài.",
  },
  {
    id: "rights",
    label: "Bản quyền tài liệu, không có nội dung vi phạm",
    help: "Tài liệu do giảng viên sở hữu hoặc được phép dùng.",
  },
] as const;

export const SEVERITY: Record<ReviewFlagSeverity, string> = {
  must: "Bắt buộc sửa",
  should: "Nên sửa",
};

export const FLAG_STATUS: Record<ReviewFlagStatus, string> = {
  open: "Đang mở",
  fixed: "Giảng viên đã sửa",
  closed: "Đã đóng",
};

export const ROUND_STATUS: Record<ReviewRoundStatus, string> = {
  in_review: "Đang duyệt",
  changes_requested: "Yêu cầu sửa",
  rejected: "Từ chối",
  approved: "Đã duyệt",
};

export interface MaterialLike {
  id?: number | string;
  type: string;
  title?: string | null;
  url?: string | null;
  fileName?: string | null;
  durationSeconds?: number | null;
}

export interface QuizQuestionLike {
  id: number | string;
  text: string;
  explanation?: string | null;
  correctIndex?: number;
  options: string[];
  aiGenerated?: boolean | null;
  aiReviewed?: boolean | null;
}

export interface QuizLike {
  id?: number | string;
  passingScore?: number | null;
  questions: QuizQuestionLike[];
}

export interface CodeTestLike {
  id?: number | string;
  name: string;
  call?: string;
  expected?: any;
  hidden?: boolean;
}

export interface CodeLike {
  kind: "tutorial" | "challenge";
  tests: CodeTestLike[];
  instructions?: string[];
  starterCode?: string;
  solutionCheck?: {
    ok: boolean;
    passed?: number;
    total?: number;
  } | null;
}

export interface AssignmentRubricItemLike {
  name: string;
  desc?: string;
  points: number;
}

export interface AssignmentLike {
  instructions: string;
  rubric?: AssignmentRubricItemLike[];
  passScore?: number;
  maxScore?: number;
  dueDays?: number;
  latePenalty?: number;
  latePolicy?: string;
}

export interface LessonLike {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  durationSeconds?: number;
  body?: string | null;
  fileName?: string | null;
  materials?: MaterialLike[];
  quiz?: QuizLike | null;
  code?: CodeLike | null;
  assignment?: AssignmentLike | null;
}

export interface ChapterLike {
  id: string;
  title: string;
  lessons: LessonLike[];
}

export interface CourseDataForReview {
  id: string;
  title: string;
  summary?: string | null;
  description?: string | null;
  category?: string | null;
  level?: string | null;
  price?: number | null;
  proposedPrice?: number | null;
  knowledgeMapStatus?: string | null;
  chapters: ChapterLike[];
  entryTest?: {
    questions: QuizQuestionLike[];
  } | null;
  learningOutcomes?: string[];
  requirements?: string[];
}

export interface ReadinessItem {
  key: string;
  ok: boolean;
  label: string;
  hint: string;
  href: string;
}

export interface ReadinessResult {
  items: ReadinessItem[];
  allOk: boolean;
}

/**
 * Checks if a lesson has its required material / content.
 */
export function materialOk(l: LessonLike): boolean {
  if (["video", "pdf", "slide"].includes(l.type)) {
    const hasMaterialFile =
      (l.materials &&
        l.materials.length > 0 &&
        l.materials.some((m) => !!m.fileName || !!m.url || !!m.title)) ||
      !!l.fileName;
    return !!hasMaterialFile;
  }
  if (l.type === "reading") {
    return !!(l.body && l.body.trim().length > 0);
  }
  return true;
}

/**
 * Flattens all lessons from chapters.
 */
export function extractAllLessons(course: CourseDataForReview): LessonLike[] {
  return course.chapters.flatMap((ch) => ch.lessons || []);
}

/**
 * Completeness check (readiness(c)) according to STATE-MACHINES §16.1.
 * All items must be 'ok' before lecturer submit is enabled.
 */
export function checkReadiness(c: CourseDataForReview): ReadinessResult {
  const ls = extractAllLessons(c);
  const desc = (c.description || c.summary || "").trim();

  // 1. Code challenge guard: if any challenge exists, every challenge has tests and solutionCheck.ok
  const challenges = ls.filter((l) => l.code && l.code.kind === "challenge");
  const failedChallenges = challenges.filter(
    (l) =>
      !l.code ||
      !l.code.tests ||
      l.code.tests.length === 0 ||
      !l.code.solutionCheck ||
      !l.code.solutionCheck.ok
  );
  const codeItem: ReadinessItem[] =
    challenges.length > 0
      ? [
          {
            key: "code",
            ok: failedChallenges.length === 0,
            label: "Bài code có test và lời giải chạy đạt",
            hint:
              failedChallenges.length === 0
                ? "Tất cả bài code đều có test và lời giải đạt."
                : `Có bài code thiếu test hoặc lời giải chưa đạt: ${failedChallenges.map((l) => `"${l.title}"`).join(", ")}.`,
            href: failedChallenges.length > 0 ? `/dashboard/lecturer/courses/${c.id}/code/${failedChallenges[0].id}` : `/dashboard/lecturer/courses/${c.id}/content`,
          },
        ]
      : [];

  // 2. AI questions guard: no quiz question with aiGenerated && aiReviewed === false
  const allQuizzes = ls.filter((l) => l.quiz && l.quiz.questions.length > 0).map((l) => l.quiz!);
  if (c.entryTest) {
    allQuizzes.push(c.entryTest);
  }
  const pendingAiQuestions = allQuizzes.flatMap((q) =>
    q.questions.filter((item) => item.aiGenerated && item.aiReviewed === false)
  );
  const hasAiQuestions = allQuizzes.some((q) => q.questions.some((item) => item.aiGenerated));
  const aiItem: ReadinessItem[] = hasAiQuestions
    ? [
        {
          key: "ai",
          ok: pendingAiQuestions.length === 0,
          label: "Câu hỏi do AI tạo đã được duyệt",
          hint:
            pendingAiQuestions.length === 0
              ? "Đã duyệt tất cả câu hỏi do AI tạo."
              : `Còn ${pendingAiQuestions.length} câu hỏi AI tạo chưa được duyệt.`,
          href: `/dashboard/lecturer/courses/${c.id}/content`,
        },
      ]
    : [];

  // 3. Assignment rubric guard: every assignment has a rubric
  const assignments = ls.filter((l) => !!l.assignment);
  const missingRubric = assignments.filter(
    (l) => !l.assignment?.rubric || l.assignment.rubric.length === 0
  );
  const rubricItem: ReadinessItem[] =
    assignments.length > 0
      ? [
          {
            key: "assignment",
            ok: missingRubric.length === 0,
            label: "Bài tập có thang chấm",
            hint:
              missingRubric.length === 0
                ? "Mọi bài tập đều có thang chấm."
                : `Cần thêm thang chấm cho: ${missingRubric.map((l) => `"${l.title}"`).join(", ")}.`,
            href: missingRubric.length > 0 ? `/dashboard/lecturer/courses/${c.id}/content?lesson=${missingRubric[0].id}` : `/dashboard/lecturer/courses/${c.id}/content`,
          },
        ]
      : [];

  // Standard 5 items
  const baseItems: ReadinessItem[] = [
    {
      key: "desc",
      ok: desc.length >= 20,
      label: "Mô tả khoá học",
      hint: desc.length >= 20 ? "Đã đạt" : "Mô tả cần ít nhất 20 ký tự.",
      href: `/dashboard/lecturer/courses/${c.id}/info`,
    },
    {
      key: "lessons",
      ok: ls.length >= 1,
      label: "Ít nhất 1 bài học",
      hint: ls.length >= 1 ? "Đã đạt" : "Thêm chương và bài học.",
      href: `/dashboard/lecturer/courses/${c.id}/content`,
    },
    {
      key: "price",
      ok: c.proposedPrice !== null && c.proposedPrice !== undefined,
      label: "Giá đề xuất",
      hint:
        c.proposedPrice !== null && c.proposedPrice !== undefined
          ? "Đã đạt"
          : "Nhập giá đề xuất (quản trị viên xác nhận giá cuối).",
      href: `/dashboard/lecturer/courses/${c.id}/info`,
    },
    {
      key: "entry",
      ok: !!(c.entryTest && c.entryTest.questions && c.entryTest.questions.length >= ENTRY_MIN),
      label: `Bài kiểm tra đầu vào (≥ ${ENTRY_MIN} câu)`,
      hint: c.entryTest
        ? `Hiện có ${c.entryTest.questions.length} câu.`
        : "Chưa có bài kiểm tra đầu vào.",
      href: `/dashboard/lecturer/courses/${c.id}/quiz/entry`,
    },
    {
      key: "kmap",
      ok: c.knowledgeMapStatus === "confirmed",
      label: "Bản đồ kiến thức đã xác nhận",
      hint:
        c.knowledgeMapStatus === "confirmed"
          ? "Đã đạt"
          : c.knowledgeMapStatus === "stale"
            ? "Bản đồ đã cũ, cần xem lại và xác nhận lại."
            : "Xem lại và xác nhận bản đồ kiến thức.",
      href: `/dashboard/lecturer/courses/${c.id}/kmap`,
    },
  ];

  const items = [...codeItem, ...aiItem, ...rubricItem, ...baseItems];
  const allOk = items.every((x) => x.ok);

  return { items, allOk };
}

export interface AutoCriterionResult {
  status: ReviewCriterionStatus | null;
  why: string;
}

/**
 * Suggested status per criterion computed from content (STATE-MACHINES §17).
 */
export function autoCriteria(c: CourseDataForReview): Record<ReviewCriterionId, AutoCriterionResult> {
  const ls = extractAllLessons(c);
  const desc = (c.description || c.summary || "").trim();
  const price = c.proposedPrice;

  const quizzes = ls.filter((l) => l.quiz && l.quiz.questions.length > 0);
  const challenges = ls.filter((l) => l.code && l.code.kind === "challenge");
  const assigns = ls.filter((l) => !!l.assignment);
  const missingMaterials = ls.filter((l) => !materialOk(l));

  const entryQuestions = c.entryTest?.questions?.length || 0;

  return {
    info:
      desc.length >= 40 && price !== null && price !== undefined
        ? { status: "pass", why: "Mô tả và giá đề xuất đã có." }
        : { status: "fix", why: "Mô tả ngắn hoặc chưa có giá đề xuất." },
    materials:
      missingMaterials.length > 0
        ? { status: "fix", why: `${missingMaterials.length} bài chưa có tệp.` }
        : { status: "pass", why: "Mọi bài đều có tài liệu." },
    quiz:
      quizzes.length === 0
        ? { status: "na", why: "Khoá chưa có quiz bài học." }
        : { status: "pass", why: `${quizzes.length} quiz — cần xem từng câu.` },
    entry:
      entryQuestions >= ENTRY_MIN
        ? { status: "pass", why: `${entryQuestions} câu.` }
        : {
            status: "fix",
            why: entryQuestions > 0 ? `Chỉ có ${entryQuestions} câu.` : "Chưa có.",
          },
    code:
      challenges.length === 0
        ? { status: "na", why: "Không có bài code." }
        : challenges.every(
              (l) =>
                l.code &&
                l.code.tests &&
                l.code.tests.length > 0 &&
                l.code.solutionCheck &&
                l.code.solutionCheck.ok
            )
          ? { status: "pass", why: "Lời giải qua tất cả test." }
          : { status: "fix", why: "Có bài code thiếu test hoặc lời giải chưa đạt." },
    assignment:
      assigns.length === 0
        ? { status: "na", why: "Không có bài tập." }
        : assigns.every((l) => (l.assignment?.rubric || []).length > 0)
          ? { status: "pass", why: "Mọi bài tập có thang chấm." }
          : {
              status: "fix",
              why: `${assigns.filter((l) => !(l.assignment?.rubric || []).length).length} bài tập chưa có thang chấm.`,
            },
    rights: {
      status: null,
      why: "Cần người duyệt xác nhận.",
    },
  };
}

export interface ReviewFlagTarget {
  type: string;
  lessonId?: string | null;
  itemId?: string | number | null;
  label: string;
}

export interface ReviewFlagDto {
  id?: number | string;
  requestId?: number;
  targetType?: string;
  lessonId?: string | null;
  targetLabel: string;
  target?: ReviewFlagTarget;
  severity: ReviewFlagSeverity;
  comment: string;
  status: ReviewFlagStatus;
  lecturerReply?: string | null;
  reply?: string | null;
  source: ReviewFlagSource;
  carriedFromFlagId?: number | null;
  carried?: boolean;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ReviewRoundDto {
  id: number;
  courseId: string;
  round: number;
  status: ReviewRoundStatus;
  requestedBy: string;
  reviewedBy?: string | null;
  validationStatus: string;
  reviewNote?: string | null;
  approvedPrice?: number | null;
  requestedAt: string | Date;
  reviewedAt?: string | Date | null;
  criteria: Record<string, { status: ReviewCriterionStatus | null; note?: string | null }>;
  flags: ReviewFlagDto[];
}

/**
 * Checks why admin approval is blocked (STATE-MACHINES §17 canApprove).
 * Returns empty array if course can be approved.
 */
export function canApprove(round: {
  criteria: Record<string, { status: ReviewCriterionStatus | null; note?: string | null }>;
  flags: ReviewFlagDto[];
}): string[] {
  const why: string[] = [];

  const unmarked = CRITERIA.filter(
    (k) => !round.criteria[k.id] || !round.criteria[k.id].status
  );
  if (unmarked.length > 0) {
    why.push(`Còn ${unmarked.length} tiêu chí chưa chấm.`);
  }

  const fixCriteria = CRITERIA.filter(
    (k) => round.criteria[k.id] && round.criteria[k.id].status === "fix"
  );
  if (fixCriteria.length > 0) {
    why.push(`${fixCriteria.length} tiêu chí đang ở "Cần sửa".`);
  }

  const openMustFlags = round.flags.filter(
    (f) => f.severity === "must" && f.status !== "closed"
  );
  if (openMustFlags.length > 0) {
    why.push(`${openMustFlags.length} cờ "Bắt buộc sửa" chưa đóng.`);
  }

  return why;
}

/**
 * Rule-based pre-check for common course review issues (no model involved; the model pass is
 * publication-ai-review.ts). The admin review screen shows these as proposals; targets use the anchors that
 * validateReviewTarget accepts, so an accepted proposal becomes a flag at the right place.
 */
export function rulePrecheck(c: CourseDataForReview): Array<{
  target: ReviewFlagTarget;
  severity: ReviewFlagSeverity;
  comment: string;
}> {
  const out: Array<{
    target: ReviewFlagTarget;
    severity: ReviewFlagSeverity;
    comment: string;
  }> = [];

  const add = (
    target: ReviewFlagTarget,
    severity: ReviewFlagSeverity,
    comment: string
  ) => {
    out.push({ target, severity, comment });
  };

  const desc = (c.description || c.summary || "").trim();
  if (desc.length < 60) {
    add(
      { type: "course", itemId: "summary", label: "Mô tả khoá học" },
      "should",
      "Mô tả còn ngắn — nên nêu rõ đối tượng học viên và kết quả đạt được."
    );
  }

  const entryQuestions = c.entryTest?.questions?.length || 0;
  if (entryQuestions < ENTRY_MIN) {
    add(
      { type: "entry", label: "Bài kiểm tra đầu vào" },
      "must",
      `Bài kiểm tra đầu vào mới có ${entryQuestions} câu, cần ít nhất ${ENTRY_MIN} câu để xếp lộ trình.`
    );
  }

  const ls = extractAllLessons(c);
  for (const l of ls) {
    const lt: ReviewFlagTarget = {
      type: "lesson",
      lessonId: l.id,
      label: `Bài: ${l.title}`,
    };

    if (!materialOk(l)) {
      add(
        lt,
        "must",
        `Chưa có tệp ${l.type === "video" ? "video" : "slide/PDF"} — học viên sẽ thấy bài trống.`
      );
    }

    if (l.quiz && l.quiz.questions) {
      if (l.quiz.questions.length < 3) {
        add(
          { type: "quiz", lessonId: l.id, label: `Quiz · ${l.title}` },
          "should",
          `Quiz chỉ có ${l.quiz.questions.length} câu, nên có ít nhất 3 câu.`
        );
      }

      l.quiz.questions.forEach((q, i) => {
        const qt: ReviewFlagTarget = {
          type: "question",
          lessonId: l.id,
          itemId: q.id,
          label: `Câu ${i + 1}: ${q.text.slice(0, 40)}`,
        };
        if (q.options.length <= 2) {
          add(
            qt,
            "should",
            "Câu chỉ có 2 lựa chọn nên dễ đoán — nên thêm lựa chọn sai hợp lý."
          );
        }
        if (!q.explanation || q.explanation.trim().length === 0) {
          add(qt, "should", "Câu hỏi chưa có phần giải thích đáp án.");
        }
      });
    }

    if (l.code && l.code.kind === "challenge") {
      const ct: ReviewFlagTarget = { type: "code", lessonId: l.id, label: `Bài code · ${l.title}` };
      if (!l.code.solutionCheck || !l.code.solutionCheck.ok) {
        add(ct, "must", "Lời giải mẫu chưa chạy đạt tất cả test.");
      }
      if (
        !l.code.tests ||
        l.code.tests.length < 3 ||
        !l.code.tests.some((t) => t.hidden)
      ) {
        add(
          ct,
          "should",
          "Bài code nên có ít nhất 3 test, trong đó có test ẩn cho trường hợp biên."
        );
      }
    }

    if (l.assignment && (!l.assignment.rubric || l.assignment.rubric.length === 0)) {
      add(
        {
          type: "assignment",
          lessonId: l.id,
          label: `Bài tập: ${l.title}`,
        },
        "should",
        "Bài tập chưa có thang chấm — học viên không biết được chấm theo tiêu chí nào."
      );
    }
  }

  return out;
}

/**
 * Returns lecturer editor link for fixing flagged item.
 */
export function targetHref(courseId: string, target: ReviewFlagTarget): string {
  if (target.label === "Bài kiểm tra đầu vào") {
    return `/dashboard/lecturer/courses/${courseId}/quiz/entry`;
  }
  if (target.type === "question") {
    return target.lessonId
      ? `/dashboard/lecturer/courses/${courseId}/quiz/${target.lessonId}`
      : `/dashboard/lecturer/courses/${courseId}/quiz/entry`;
  }
  if (target.type === "test" || target.type === "code") {
    return `/dashboard/lecturer/courses/${courseId}/code/${target.lessonId || ""}`;
  }
  if (target.type === "course") {
    return `/dashboard/lecturer/courses/${courseId}/info`;
  }
  if (target.lessonId) {
    return `/dashboard/lecturer/courses/${courseId}/content?lesson=${target.lessonId}`;
  }
  return `/dashboard/lecturer/courses/${courseId}/content`;
}

// ───────────────────────── review anchors ─────────────────────────
/**
 * Where a flag points. `itemId` narrows it: a course-info field for "course", a chapter id for "chapter",
 * a material / question / test id for those types. Lesson-scoped types carry the lesson id.
 */
export const REVIEW_TARGET_TYPES = ["course", "entry", "chapter", "lesson", "reading", "material", "quiz", "question", "code", "test", "assignment"] as const;
export const COURSE_INFO_FIELDS = ["title", "summary", "outcomes", "requirements", "price", "category"] as const;
const LESSON_TARGETS: readonly string[] = ["lesson", "reading", "material", "quiz", "code", "test", "assignment"];

/** Returns a Vietnamese error when the target does not exist in the course, or null. */
export function validateReviewTarget(
  c: CourseDataForReview,
  t: { type: string; lessonId?: string | null; itemId?: string | null },
): string | null {
  if (!(REVIEW_TARGET_TYPES as readonly string[]).includes(t.type)) return "Vị trí góp ý không hợp lệ.";
  const itemId = t.itemId ?? null;
  if (itemId !== null && (typeof itemId !== "string" || itemId.length > 100)) return "Vị trí góp ý không hợp lệ.";
  const lesson = t.lessonId ? extractAllLessons(c).find((l) => l.id === t.lessonId) : undefined;
  if (t.lessonId && !lesson) return "Bài học không thuộc khoá học này.";
  if (LESSON_TARGETS.includes(t.type) && !lesson) return "Góp ý này cần gắn với một bài học.";
  const is = (id: unknown) => id !== undefined && id !== null && String(id) === itemId;
  switch (t.type) {
    case "course":
      return itemId === null || (COURSE_INFO_FIELDS as readonly string[]).includes(itemId) ? null : "Mục thông tin khoá học không hợp lệ.";
    case "chapter":
      return c.chapters.some((ch) => is(ch.id)) ? null : "Chương không thuộc khoá học này.";
    case "material":
      return (lesson?.materials || []).some((m) => is(m.id)) ? null : "Tài liệu không thuộc bài học này.";
    case "test":
      return (lesson?.code?.tests || []).some((x) => is(x.id)) ? null : "Test không thuộc bài học này.";
    case "question": {
      const qs = lesson ? lesson.quiz?.questions || [] : c.entryTest?.questions || [];
      return qs.some((q) => is(q.id)) ? null : "Câu hỏi không thuộc bài kiểm tra này.";
    }
    default:
      return null;
  }
}

// ───────────────────────── round-to-round changes ─────────────────────────
export interface ReviewContentChanges {
  comparedRound: number;
  course: string[];
  entry: boolean;
  chapters: { added: string[]; renamed: string[]; removed: string[] };
  lessons: { added: string[]; changed: Record<string, string[]>; removed: string[] };
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const questionsKey = (qs?: QuizQuestionLike[]) => (qs || []).map((q) => [q.text, q.options, q.correctIndex, q.explanation || ""]);
const codeKey = (code?: CodeLike | null) => (code ? [code.instructions, code.starterCode, code.tests.map((t) => [t.name, t.call, t.hidden])] : null);

/** What the lecturer changed since the content the admin decided on in an earlier round. */
export function diffReviewContent(prev: CourseDataForReview, cur: CourseDataForReview, comparedRound: number): ReviewContentChanges {
  const course: string[] = [];
  if (!sameValue(prev.title, cur.title)) course.push("title");
  if (!sameValue(prev.description, cur.description)) course.push("summary");
  if (!sameValue(prev.category, cur.category) || !sameValue(prev.level, cur.level)) course.push("category");
  if (!sameValue(prev.proposedPrice, cur.proposedPrice)) course.push("price");
  if (!sameValue(prev.learningOutcomes, cur.learningOutcomes)) course.push("outcomes");
  if (!sameValue(prev.requirements, cur.requirements)) course.push("requirements");

  const prevChapters = new Map(prev.chapters.map((ch) => [ch.id, ch]));
  const curChapterIds = new Set(cur.chapters.map((ch) => ch.id));
  const chapters = {
    added: cur.chapters.filter((ch) => !prevChapters.has(ch.id)).map((ch) => ch.id),
    renamed: cur.chapters.filter((ch) => prevChapters.get(ch.id) && prevChapters.get(ch.id)?.title !== ch.title).map((ch) => ch.id),
    removed: prev.chapters.filter((ch) => !curChapterIds.has(ch.id)).map((ch) => ch.title),
  };

  const prevLessons = new Map(extractAllLessons(prev).map((l) => [l.id, l]));
  const curLessons = extractAllLessons(cur);
  const curLessonIds = new Set(curLessons.map((l) => l.id));
  const changed: Record<string, string[]> = {};
  const added: string[] = [];
  for (const l of curLessons) {
    const p = prevLessons.get(l.id);
    if (!p) { added.push(l.id); continue; }
    const keys: string[] = [];
    if (!sameValue(p.title, l.title)) keys.push("title");
    if (!sameValue(p.description, l.description) || !sameValue(p.durationSeconds, l.durationSeconds)) keys.push("description");
    if (!sameValue(p.body, l.body)) keys.push("reading");
    const mats = (x: LessonLike) => (x.materials || []).map((m) => [m.type, m.title, m.url]);
    if (!sameValue(mats(p), mats(l))) keys.push("material");
    const quiz = (x: LessonLike) => (x.quiz ? [x.quiz.passingScore, questionsKey(x.quiz.questions)] : null);
    if (!sameValue(quiz(p), quiz(l))) keys.push("quiz");
    if (!sameValue(codeKey(p.code), codeKey(l.code))) keys.push("code");
    if (!sameValue(p.assignment, l.assignment)) keys.push("assignment");
    if (keys.length) changed[l.id] = keys;
  }
  return {
    comparedRound,
    course,
    entry: !sameValue(questionsKey(prev.entryTest?.questions), questionsKey(cur.entryTest?.questions)),
    chapters,
    lessons: { added, changed, removed: [...prevLessons.values()].filter((l) => !curLessonIds.has(l.id)).map((l) => l.title) },
  };
}

/** Flag row → the DTO both review screens read. */
export function toReviewFlagDto(f: {
  id: number; requestId: number; targetType: string; lessonId: string | null; targetItemId: string | null; targetLabel: string;
  severity: ReviewFlagSeverity; comment: string; status: ReviewFlagStatus; lecturerReply: string | null; source: ReviewFlagSource;
  carriedFromFlagId: number | null; createdAt: Date; updatedAt: Date;
}): ReviewFlagDto {
  return {
    id: f.id,
    requestId: f.requestId,
    targetType: f.targetType,
    lessonId: f.lessonId,
    targetLabel: f.targetLabel,
    target: { type: f.targetType, lessonId: f.lessonId, itemId: f.targetItemId, label: f.targetLabel },
    severity: f.severity,
    comment: f.comment,
    status: f.status,
    lecturerReply: f.lecturerReply,
    reply: f.lecturerReply,
    source: f.source,
    carriedFromFlagId: f.carriedFromFlagId,
    carried: !!f.carriedFromFlagId,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}
