import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const mockGetSession = vi.fn();
const mockRequireRole = vi.fn();
const mockHeaders = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}));

vi.mock("@codi-1/auth", () => ({
  ROLE: { LEARNER: "LEARNER", LECTURER: "LECTURER", ADMIN: "ADMIN" },
  requireRole: (...args: any[]) => mockRequireRole(...args),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();
const mockNotify = vi.fn().mockResolvedValue({ id: 1 });
const mockNotificationContext = vi.fn();
const mockGenerateText = vi.fn();

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: (...args: any[]) => mockGetSession(...args),
    },
  },
  db: {
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
    transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

vi.mock("@/lib/notification-service", () => ({
  createNotificationService: (tx: unknown) => { mockNotificationContext(tx); return ({
    notify: (...args: any[]) => mockNotify(...args),
  }); },
}));

vi.mock("@/lib/ai", () => ({
  getLlmProvider: () => ({
    getModel: () => "mock-model",
  }),
}));

vi.mock("ai", () => ({
  generateText: (...args: any[]) => mockGenerateText(...args),
}));

import { submissionIdentity } from "./submission-identity";
import { parseFeedbackAndHistory, serializeFeedbackAndHistory } from "@/lib/grading-service";
import {
  getAiGradingDraft,
  getGradingQueueData,
  gradeSubmission,
} from "./actions";

function createMockQuery(data: any = []) {
  const query: any = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve(data)),
    then: (resolve: any, reject: any) => Promise.resolve(data).then(resolve, reject),
  };
  return query;
}

describe("Lecturer Grading Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({
      user: { id: "lecturer-1", name: "Thầy A" },
    });
    mockRequireRole.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (cb: any) => {
      const mockTx: any = {
        select: (...args: any[]) => mockSelect(...args),
        update: (...args: any[]) => mockUpdate(...args),
        insert: (...args: any[]) => mockInsert(...args),
      };
      return cb(mockTx);
    });
  });

  describe("getGradingQueueData", () => {
    it("returns empty queue when lecturer has no courses", async () => {
      mockSelect.mockReturnValue(createMockQuery([]));

      const res = await getGradingQueueData();
      expect(res.courses).toEqual([]);
      expect(res.counts).toEqual({ pending: 0, graded: 0 });
      expect(res.submissions).toEqual([]);
      expect(res.selectedSubmission).toBeNull();
    });

    it("fetches counts, assignments, submissions list and detail for selected submission", async () => {
      const myCourses = [{ id: "c1", title: "React & Next.js" }];
      const myAssignments = [{ id: 101, title: "Bài tập 1", courseId: "c1" }];
      const submissionsList = [
        {
          id: 10,
          studentName: "Nguyễn Văn B",
          studentEmail: "b@codi.vn",
          studentAvatar: null,
          courseId: "c1",
          courseTitle: "React & Next.js",
          lessonId: "l1",
          lessonTitle: "Bài 1: JSX",
          status: "pending",
          score: null,
          maxScore: 10,
          submittedAt: new Date("2026-10-18T10:00:00Z"),
          gradedAt: null,
        },
      ];

      const detailRow = {
        id: 10,
        studentUserId: "user-student-1",
        studentName: "Nguyễn Văn B",
        studentEmail: "b@codi.vn",
        studentAvatar: null,
        courseId: "c1",
        courseTitle: "React & Next.js",
        lessonId: "l1",
        lessonTitle: "Bài 1: JSX",
        instructions: "Tạo component Header",
        maxScore: 10,
        passingScore: 60,
        rubric: JSON.stringify([
          { id: "c1", name: "Giao diện", points: 5 },
          { id: "c2", name: "Chức năng", points: 5 },
        ]),
        answerText: "Em đã hoàn thành bài tập.",
        fileUrl: null,
        fileName: null,
        linkUrl: "https://github.com/b/hw1",
        submittedAt: new Date("2026-10-18T10:00:00Z"),
        status: "pending",
        score: null,
        feedback: null,
      };

      let selectCall = 0;
      mockSelect.mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) return createMockQuery(myCourses); // courses
        if (selectCall === 2) return createMockQuery(myAssignments); // assignments
        if (selectCall === 3) return createMockQuery([{ count: 1 }]); // pending count
        if (selectCall === 4) return createMockQuery([{ count: 0 }]); // graded count
        if (selectCall === 5) return createMockQuery(submissionsList); // list
        if (selectCall === 6) return createMockQuery([detailRow]); // detail
        if (selectCall === 7) return createMockQuery([]); // next pending
        return createMockQuery([]);
      });

      const res = await getGradingQueueData({ courseId: "c1", assignmentId: "101", date: "today" });
      expect(res.counts.pending).toBe(1);
      expect(res.counts.graded).toBe(0);
      expect(res.assignments).toHaveLength(1);
      expect(res.submissions).toHaveLength(1);
      expect(res.selectedSubmission).not.toBeNull();
      expect(res.selectedSubmission?.studentName).toBe("Nguyễn Văn B");
      expect(res.selectedSubmission?.rubric).toHaveLength(2);
    });
  });

  describe("manual grading integrity", () => {
    let row: any;
    let assessment: any;
    let course: any;
    let failClaim: boolean;
    let active: boolean;
    let lastTx: unknown;
    let locks: string[];
    let tail: Promise<void>;

    beforeEach(() => {
      row = { id: 10, assessmentId: 101, enrollmentId: 21, attempt: 1, status: "graded",
        score: 7, feedback: serializeFeedbackAndHistory("previous", []), gradedAt: new Date("2026-10-20"),
        gradedBy: "lecturer-1", answerText: "solution", fileName: null, fileUrl: null, linkUrl: null,
        submittedAt: new Date("2026-10-19"), savedAt: new Date("2026-10-19") };
      assessment = { id: 101, courseId: "c1", title: "Assignment", type: "assignment",
        rubric: null, instructions: "Solve", maxScore: 10, passingScore: 60 };
      course = { id: "c1", instructorId: "lecturer-1", title: "Course" };
      failClaim = false;
      active = true;
      locks = [];
      tail = Promise.resolve();
      mockSelect.mockImplementation((fields: any) => createMockQuery(fields?.status ? [{ ...row, ...assessment, id: row.id, studentUserId: "student", courseTitle: "Course", lessonTitle: "Assignment" }] : fields?.id && getTableName(fields.id.table) === "courses" ? [{ id: "c1" }] : []));
      mockNotify.mockResolvedValue({ id: 1 });
      // Controlled persistence double: serialized transactions + staged writes/rollback.
      // Lock order is asserted separately; this is not PostgreSQL execution.
      mockTransaction.mockImplementation(async (callback: any) => {
        const previous = tail;
        let release!: () => void;
        tail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        let staged = { ...row };
        let step = 0;
        const results = () => {
          step++;
          if (step === 1) return [{ enrollmentId: 21, assessmentId: 101 }];
          if (step === 2) return [{ id: 21, userId: "student", courseId: "c1" }];
          if (step === 3) return [course];
          if (step === 4) return [assessment];
          return [staged];
        };
        const tx = {
          select: (fields: any) => {
            let table: any;
            const q: any = { from: (value: any) => { table = value; return q; },
              where: () => q,
              innerJoin: () => q,
              limit: () => Promise.resolve(active ? [{ id: 1 }] : []),
              for: (mode: string) => {
                locks.push(`${getTableName(table)}:${mode}`);
                return Promise.resolve(results());
              },
              then: (resolve: any, reject: any) => Promise.resolve(fields?.status ? [staged] : results()).then(resolve, reject),
            };
            return q;
          },
          update: () => ({ set: (values: any) => ({ where: () => ({ returning: async () => {
            if (failClaim) return [];
            staged = { ...staged, ...values };
            return [{ id: staged.id }];
          } }) }) }),
          insert: vi.fn(),
        };
        lastTx = tx;
        try {
          const result = await callback(tx);
          row = staged;
          return result;
        } finally { release(); }
      });
    });

    const token = () => submissionIdentity({ ...row, maxScore: assessment.maxScore,
      passingScore: assessment.passingScore, rubric: assessment.rubric, instructions: assessment.instructions,
      type: assessment.type, courseId: assessment.courseId });
    const save = (viewToken = token(), extra: Record<string, unknown> = {}) =>
      gradeSubmission({ submissionId: 10, viewToken, score: 8, feedback: "new", reason: "Rechecked", ...extra });

    it("serializes graded edits and rejects the losing viewed identity without notification", async () => {
      const viewed = token();
      const results = await Promise.all([save(viewed), save(viewed, { score: 9 })]);
      expect(results.map(result => result.success)).toEqual([true, false]);
      expect(row.score).toBe(8);
      expect(parseFeedbackAndHistory(row.feedback).history).toHaveLength(1);
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(locks.slice(0, 4)).toEqual(["student_enrollments:update", "courses:share", "assessments:share", "assessment_submissions:update"]);
    });

    it("fences same-score feedback edits and retains earlier score history", async () => {
      row.feedback = serializeFeedbackAndHistory("previous", [{ oldScore: 6, newScore: 7, at: "2026-10-20" }]);
      const viewed = token();
      expect((await save(viewed, { score: 7, reason: undefined })).success).toBe(true);
      expect((await save(viewed, { score: 7, feedback: "stale", reason: undefined })).success).toBe(false);
      expect(parseFeedbackAndHistory(row.feedback).history).toHaveLength(1);
      expect(parseFeedbackAndHistory(row.feedback).feedback).toBe("new");
      expect(mockNotify).toHaveBeenCalledTimes(1);
    });

    it("allows only one first grade for the same pending view", async () => {
      row.status = "pending"; row.score = null;
      const viewed = token();
      const results = await Promise.all([save(viewed), save(viewed)]);
      expect(results.map(result => result.success)).toEqual([true, false]);
      expect(parseFeedbackAndHistory(row.feedback).history).toEqual([]);
      expect(mockNotify).toHaveBeenCalledTimes(1);
    });

    it("rejects resubmitted pending content even when row ID and status do not change", async () => {
      row.status = "pending"; row.score = null;
      const viewed = token();
      row.answerText = "resubmitted solution";
      row.submittedAt = new Date("2026-10-24");
      expect((await save(viewed)).success).toBe(false);
      expect(row.status).toBe("pending");
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("requires a viewed token and freshly checks owner, type and rubric under the fence", async () => {
      expect((await save("")).success).toBe(false);
      const viewed = token();
      course.instructorId = "other";
      expect((await save(viewed)).success).toBe(false);
      course.instructorId = "lecturer-1"; assessment.type = "quiz";
      expect((await save(viewed)).success).toBe(false);
      assessment.type = "assignment"; assessment.rubric = "broken";
      expect((await save(token())).success).toBe(false);
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("checks the conditional claim result before notification", async () => {
      failClaim = true;
      expect((await save()).success).toBe(false);
      expect(row.score).toBe(7);
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("rejects a revoked lecturer after obtaining the submission fence", async () => {
      active = false;
      expect((await save()).success).toBe(false);
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("enforces draft, rubric bounds and changed-score reason on the action path", async () => {
      row.status = "draft";
      expect((await save()).success).toBe(false);
      row.status = "graded";
      expect((await save(token(), { reason: "" })).success).toBe(false);
      assessment.rubric = JSON.stringify([{ id: "logic", points: 10 }]);
      expect((await save()).success).toBe(false);
      expect((await save(token(), { rubricScores: { logic: 11 } })).success).toBe(false);
      expect((await save(token(), { rubricScores: { logic: 7 } })).success).toBe(false);
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("rolls back grade and history when transactional notification fails", async () => {
      const previous = row.feedback;
      mockNotify.mockRejectedValueOnce(new Error("notification unavailable"));
      expect((await save()).success).toBe(false);
      expect(row.score).toBe(7);
      expect(row.feedback).toBe(previous);
      expect(mockNotificationContext).toHaveBeenCalledWith(lastTx);
    });

    it("does not overwrite malformed persisted history", async () => {
      row.feedback = "previous\\n\\n<!--grading_meta_b64:broken-->";
      expect((await save()).success).toBe(false);
      expect(row.feedback).toContain("broken");
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it.each([
      "previous\n\n<!--grading_record_v2:broken",
      `previous\n\n<!--grading_meta_b64:${Buffer.from(JSON.stringify({ history: [] })).toString("base64")}!-->`,
      "previous\n\n<!--grading_history:{broken-->",
    ])("refuses corrupt stored frames before grading or notification: %s", async raw => {
      row.feedback = raw;
      expect((await save()).success).toBe(false);
      expect(row.feedback).toBe(raw);
      expect(row.score).toBe(7);
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("grades pending work, persists rubric and preserves next-item filter inputs", async () => {
      row.status = "pending"; row.score = null;
      assessment.rubric = JSON.stringify([{ id: "logic", points: 10 }]);
      const result = await save(token(), { rubricScores: { logic: 8 }, courseFilter: "c1", assignmentFilter: "101", dateFilter: "today" });
      expect(result.success).toBe(true);
      expect(parseFeedbackAndHistory(row.feedback).rubricScores).toEqual({ logic: 8 });
    });
  });

  it("denies direct AI requests without selecting submissions or invoking a provider", async () => {
    const result = await getAiGradingDraft(10);
    expect(result.success).toBe(false);
    expect(result.error).toContain("chưa khả dụng");
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});
