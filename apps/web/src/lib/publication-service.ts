/**
 * publication-service.ts — domain logic and rules for course publication review
 * (Admin S32 <-> Lecturer S25, S32b).
 *
 * Implements STATE-MACHINES.md §16 & §17 and docs/mockup/js/course-review.js contract:
 * - 8 readiness conditions for lecturer submission
 * - 7 criteria for admin review
 * - canApprove guards (no unmarked criteria, no 'fix' criteria, no open 'must' flags)
 * - autoCriteria suggestions
 * - aiPrecheck deterministic inspection
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
}

export interface QuizQuestionLike {
  id: number | string;
  text: string;
  explanation?: string | null;
  correctIndex?: number;
  options: string[];
  aiGenerated?: boolean;
  aiReviewed?: boolean;
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
      ok:
        (c.proposedPrice !== null && c.proposedPrice !== undefined) ||
        (c.price !== null && c.price !== undefined),
      label: "Giá đề xuất",
      hint:
        (c.proposedPrice !== null && c.proposedPrice !== undefined) ||
        (c.price !== null && c.price !== undefined)
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
  const price = c.proposedPrice ?? c.price;

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
 * Deterministic AI pre-check for common course review issues.
 */
export function aiPrecheck(c: CourseDataForReview): Array<{
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
      { type: "course", label: "Mô tả khoá học" },
      "should",
      "Mô tả còn ngắn — nên nêu rõ đối tượng học viên và kết quả đạt được."
    );
  }

  const entryQuestions = c.entryTest?.questions?.length || 0;
  if (entryQuestions < ENTRY_MIN) {
    add(
      { type: "course", label: "Bài kiểm tra đầu vào" },
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
          lt,
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
      if (!l.code.solutionCheck || !l.code.solutionCheck.ok) {
        add(lt, "must", "Lời giải mẫu chưa chạy đạt tất cả test.");
      }
      if (
        !l.code.tests ||
        l.code.tests.length < 3 ||
        !l.code.tests.some((t) => t.hidden)
      ) {
        add(
          lt,
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
