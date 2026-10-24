import { beforeEach, describe, expect, it, vi } from "vitest";

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
  createNotificationService: () => ({
    notify: (...args: any[]) => mockNotify(...args),
  }),
}));

vi.mock("@/lib/ai", () => ({
  getLlmProvider: () => ({
    getModel: () => "mock-model",
  }),
}));

vi.mock("ai", () => ({
  generateText: (...args: any[]) => mockGenerateText(...args),
}));

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

  describe("gradeSubmission", () => {
    it("fails when submission does not exist or does not belong to lecturer's course", async () => {
      mockSelect.mockReturnValue(createMockQuery([]));

      const res = await gradeSubmission({ submissionId: 999, score: 8 });
      expect(res.success).toBe(false);
      expect(res.error).toContain("không tồn tại");
    });

    it("fails when submission is draft", async () => {
      const mockDraftSub = {
        id: 10,
        status: "draft",
        score: null,
        feedback: null,
        maxScore: 10,
        passingScore: 60,
        studentUserId: "user-student-1",
        courseId: "c1",
        courseTitle: "React",
        lessonTitle: "Bài 1",
        rubric: null,
        type: "assignment",
      };

      mockSelect.mockReturnValue(createMockQuery([mockDraftSub]));

      const res = await gradeSubmission({ submissionId: 10, score: 8 });
      expect(res.success).toBe(false);
      expect(res.error).toContain("bản nháp");
    });

    it("validates rubric criteria on server and derives total", async () => {
      const mockRubricSub = {
        id: 10,
        status: "pending",
        score: null,
        feedback: null,
        maxScore: 10,
        passingScore: 60,
        studentUserId: "user-student-1",
        courseId: "c1",
        courseTitle: "React",
        lessonTitle: "Bài 1",
        type: "assignment",
        rubric: JSON.stringify([
          { id: "ui", name: "Giao diện", points: 4 },
          { id: "logic", name: "Logic", points: 6 },
        ]),
      };

      mockSelect.mockReturnValue(createMockQuery([mockRubricSub]));

      // Missing rubric scores
      const missingRes = await gradeSubmission({
        submissionId: 10,
        score: 8,
      });
      expect(missingRes.success).toBe(false);
      expect(missingRes.error).toContain("thang điểm (rubric)");

      // Out of bounds rubric score
      const outOfBoundsRes = await gradeSubmission({
        submissionId: 10,
        score: 11,
        rubricScores: { ui: 5, logic: 6 }, // ui max is 4
      });
      expect(outOfBoundsRes.success).toBe(false);
      expect(outOfBoundsRes.error).toContain("từ 0 đến 4");

      // Score sum mismatch
      const mismatchRes = await gradeSubmission({
        submissionId: 10,
        score: 7,
        rubricScores: { ui: 4, logic: 6 }, // sum is 10 != 7
      });
      expect(mismatchRes.success).toBe(false);
      expect(mismatchRes.error).toContain("không khớp");
    });

    it("grades pending submission successfully and notifies learner atomically (pending -> graded)", async () => {
      const mockSub = {
        id: 10,
        status: "pending",
        score: null,
        feedback: null,
        maxScore: 10,
        passingScore: 60,
        studentUserId: "user-student-1",
        courseId: "c1",
        courseTitle: "React",
        lessonTitle: "Bài 1",
        rubric: null,
        type: "assignment",
      };

      let queryCall = 0;
      mockSelect.mockImplementation(() => {
        queryCall++;
        if (queryCall === 1) return createMockQuery([mockSub]); // initial check
        if (queryCall === 2) return createMockQuery([mockSub]); // transaction fresh check
        if (queryCall === 3) return createMockQuery([{ id: "c1" }]); // myCourseRows
        if (queryCall === 4) return createMockQuery([{ id: 11 }]); // nextPendingId
        return createMockQuery([]);
      });

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 10 }]),
          }),
        }),
      });

      const res = await gradeSubmission({
        submissionId: 10,
        score: 8.5,
        feedback: "Làm tốt lắm em!",
        courseFilter: "c1",
      });

      expect(res.success).toBe(true);
      expect(res.submissionId).toBe(10);
      expect(res.nextPendingId).toBe(11);
      expect(mockNotify).toHaveBeenCalledWith(
        "user-student-1",
        "Bài tập đã được chấm",
        expect.stringContaining("8,5/10"),
        "/dashboard/learner"
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/lecturer/grading");
    });

    it("requires reason when modifying score of already graded submission (graded -> graded)", async () => {
      const mockSub = {
        id: 10,
        status: "graded",
        score: 7,
        feedback: "Bài cũ",
        maxScore: 10,
        passingScore: 60,
        studentUserId: "user-student-1",
        courseId: "c1",
        courseTitle: "React",
        lessonTitle: "Bài 1",
        rubric: null,
        type: "assignment",
      };

      mockSelect.mockImplementation(() => createMockQuery([mockSub]));

      // Thay đổi điểm từ 7 lên 9 mà không có lý do -> thất bại
      const failRes = await gradeSubmission({
        submissionId: 10,
        score: 9,
        feedback: "Cập nhật",
        reason: "",
      });
      expect(failRes.success).toBe(false);
      expect(failRes.error).toContain("lý do điều chỉnh");

      // Thay đổi điểm từ 7 lên 9 kèm lý do hợp lệ -> thành công và lưu lịch sử
      let queryCall = 0;
      mockSelect.mockImplementation(() => {
        queryCall++;
        if (queryCall === 1) return createMockQuery([mockSub]);
        if (queryCall === 2) return createMockQuery([mockSub]);
        if (queryCall === 3) return createMockQuery([{ id: "c1" }]);
        if (queryCall === 4) return createMockQuery([]);
        return createMockQuery([]);
      });

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 10 }]),
          }),
        }),
      });

      const okRes = await gradeSubmission({
        submissionId: 10,
        score: 9,
        feedback: "Cập nhật",
        reason: "Phúc khảo phần bổ sung câu 2",
      });
      expect(okRes.success).toBe(true);
      expect(mockNotify).toHaveBeenCalledWith(
        "user-student-1",
        "Điểm bài tập đã được cập nhật",
        expect.stringContaining("9/10"),
        "/dashboard/learner"
      );
    });

    it("rejects concurrent modification when submission was altered in another session", async () => {
      const initialSub = {
        id: 10,
        status: "pending",
        score: null,
        feedback: null,
        maxScore: 10,
        passingScore: 60,
        studentUserId: "user-student-1",
        courseId: "c1",
        courseTitle: "React",
        lessonTitle: "Bài 1",
        rubric: null,
        type: "assignment",
      };

      const concurrentAlteredSub = {
        ...initialSub,
        status: "graded", // already graded by another lecturer
        score: 9,
      };

      let queryCall = 0;
      mockSelect.mockImplementation(() => {
        queryCall++;
        if (queryCall === 1) return createMockQuery([initialSub]);
        if (queryCall === 2) return createMockQuery([concurrentAlteredSub]); // conflict!
        return createMockQuery([]);
      });

      const res = await gradeSubmission({
        submissionId: 10,
        score: 8,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("phiên làm việc khác");
    });
  });

  describe("getAiGradingDraft", () => {
    it("returns error when submission has no content or link", async () => {
      const mockEmptySub = {
        id: 10,
        answerText: "",
        fileName: null,
        linkUrl: null,
        maxScore: 10,
        instructions: "Viết component",
        type: "assignment",
        status: "pending",
      };

      mockSelect.mockReturnValue(createMockQuery([mockEmptySub]));

      const res = await getAiGradingDraft(10);
      expect(res.success).toBe(false);
      expect(res.error).toContain("chưa nộp nội dung");
    });

    it("evaluates genuine submission with LLM and returns suggested score and constructive feedback", async () => {
      const mockSub = {
        id: 10,
        answerText: "Em đã hoàn thành bài tập với React hooks.",
        fileName: "code.zip",
        linkUrl: "https://github.com/student/app",
        maxScore: 10,
        instructions: "Viết component",
        rubric: null,
        type: "assignment",
        status: "pending",
      };

      mockSelect.mockReturnValue(createMockQuery([mockSub]));

      mockGenerateText.mockResolvedValue({
        text: JSON.stringify({
          suggestedScore: 8.5,
          feedback: "Bài làm hoàn thành tốt các yêu cầu React hooks. Cần lưu ý thêm useCallback.",
        }),
      });

      const res = await getAiGradingDraft(10);
      expect(res.success).toBe(true);
      expect(res.suggestedScore).toBe(8.5);
      expect(res.feedback).toContain("React hooks");
    });

    it("returns clear unavailable error when AI service is not configured or fails", async () => {
      const mockSub = {
        id: 10,
        answerText: "Em nộp bài.",
        fileName: null,
        linkUrl: null,
        maxScore: 10,
        instructions: "Làm bài",
        rubric: null,
        type: "assignment",
        status: "pending",
      };

      mockSelect.mockReturnValue(createMockQuery([mockSub]));
      mockGenerateText.mockRejectedValue(new Error("AI service error"));

      const res = await getAiGradingDraft(10);
      expect(res.success).toBe(false);
      expect(res.error).toContain("chưa khả dụng");
    });
  });
});
