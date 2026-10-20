import { beforeEach, describe, expect, it, vi } from "vitest";
import { courseChapters, courseLessons, courses } from "@codi-1/db";

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

const mockTransaction = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/services", () => ({
  auth: {
    api: {
      getSession: (...args: any[]) => mockGetSession(...args),
    },
  },
  db: {
    transaction: (cb: any) => mockTransaction(cb),
    select: (...args: any[]) => mockSelect(...args),
    insert: (...args: any[]) => mockInsert(...args),
    update: (...args: any[]) => mockUpdate(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}));

import {
  addChapter,
  addLesson,
  deleteChapter,
  deleteLesson,
  generateAiQuizQuestions,
  getEditableCourse,
  restoreLesson,
  saveQuizData,
  updateCourseInfo,
} from "./actions";

function mockOwnedContent(course: Record<string, unknown>, lesson: Record<string, unknown>) {
  mockSelect.mockImplementation((selection?: { lesson?: unknown }) => ({
    from: vi.fn().mockImplementation((table) => {
      const rows = table === courses ? [course]
        : table === courseChapters ? [{ id: lesson.chapterId, courseId: course.id }]
        : table === courseLessons ? (selection?.lesson ? [{ lesson }] : [lesson])
        : [];
      const query = {
        where: vi.fn().mockResolvedValue(rows),
        innerJoin: vi.fn().mockReturnThis(),
      };
      return query;
    }),
  }));
}

describe("Course Editor & Quiz Builder Actions (#114)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({
      user: { id: "lecturer-1" },
    });
    mockRequireRole.mockResolvedValue(undefined);
  });

  describe("getEditableCourse guard", () => {
    it("ném lỗi khi khoá học không tồn tại hoặc không thuộc quyền giảng viên", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(getEditableCourse("non-existent")).rejects.toThrow(
        "Không tìm thấy khoá học hoặc khoá học không thuộc quyền quản lý của bạn."
      );
    });

    it("chặn chỉnh sửa (read-only) khi khoá học ở trạng thái pending (chờ duyệt)", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "c-pending", instructorId: "lecturer-1", status: "pending" },
          ]),
        }),
      });

      await expect(getEditableCourse("c-pending")).rejects.toThrow(
        "Khoá học đang chờ duyệt — nội dung chỉ đọc."
      );
    });

    it("cho phép chỉnh sửa khi khoá học ở trạng thái draft", async () => {
      const mockCourse = { id: "c-draft", instructorId: "lecturer-1", status: "draft" };
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockCourse]),
        }),
      });

      const { course } = await getEditableCourse("c-draft");
      expect(course.id).toBe("c-draft");
    });
  });

  describe("updateCourseInfo", () => {
    it("báo lỗi validation khi tên hoặc mô tả quá ngắn", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "c-1", instructorId: "lecturer-1", status: "draft" },
          ]),
        }),
      });

      const res = await updateCourseInfo("c-1", {
        title: "abc",
        summary: "ngắn",
        category: "Web",
        level: "Beginner",
        learningOutcomes: [],
        requirements: [],
      });

      expect(res.success).toBe(false);
      expect(res.errors?.title).toBe("Tên khoá học cần ít nhất 5 ký tự.");
      expect(res.errors?.summary).toBe("Mô tả cần ít nhất 20 ký tự.");
    });

    it("cập nhật thông tin thành công và đánh dấu knowledge_map_status = 'stale' nếu khoá đã xuất bản (D17)", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "c-pub",
              instructorId: "lecturer-1",
              status: "published",
              knowledgeMapStatus: "confirmed",
            },
          ]),
        }),
      });

      const mockTxUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const mockTxInsertValues = vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      });

      mockTransaction.mockImplementation(async (cb: any) => {
        return cb({
          update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
          insert: vi.fn().mockReturnValue({ values: mockTxInsertValues }),
        });
      });

      const res = await updateCourseInfo("c-pub", {
        title: "Khoá học React Native Thực Chiến",
        summary: "Xây dựng ứng dụng đa nền tảng iOS & Android với Expo và React Native.",
        category: "Mobile",
        level: "Intermediate",
        learningOutcomes: ["Làm chủ Navigation", "Quản lý state với Zustand"],
        requirements: ["Đã biết JavaScript cơ bản"],
      });

      expect(res.success).toBe(true);
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalled();
    });
  });

  describe("addChapter & deleteLesson (Undo support)", () => {
    it("thêm chương mới với position tăng dần", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // getEditableCourse
            return { where: vi.fn().mockResolvedValue([{ id: "c-1", instructorId: "lecturer-1", status: "draft" }]) };
          }
          // lastChapter
          return {
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ position: 2 }]),
              }),
            }),
          };
        }),
      }));

      mockInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "ch-3", title: "Chương 4", position: 3 }]),
        }),
      });

      const res = await addChapter("c-1");
      expect(res.success).toBe(true);
      expect(res.chapter.position).toBe(3);
    });

    it("xoá bài học trả về thông tin bài học để hỗ trợ Hoàn tác (Undo toast §7.17)", async () => {
      mockOwnedContent(
        { id: "c-1", instructorId: "lecturer-1", status: "draft" },
        { id: "ls-10", chapterId: "ch-1", title: "Bài 1: Cài đặt môi trường", position: 0 },
      );

      mockDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const res = await deleteLesson("c-1", "ls-10");
      expect(res.success).toBe(true);
      expect(res.deletedLesson?.title).toBe("Bài 1: Cài đặt môi trường");
    });

    it("khôi phục bài học vừa xoá thành công khi bấm Hoàn tác", async () => {
      mockOwnedContent(
        { id: "c-1", instructorId: "lecturer-1", status: "draft" },
        { id: "ls-10", chapterId: "ch-1" },
      );

      mockInsert.mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const res = await restoreLesson("c-1", {
        id: "ls-10",
        chapterId: "ch-1",
        title: "Bài 1: Cài đặt môi trường",
        position: 0,
      });

      expect(res.success).toBe(true);
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe("saveQuizData (Quiz Builder)", () => {
    beforeEach(() => {
      mockOwnedContent(
        { id: "c-1", instructorId: "lecturer-1", status: "draft" },
        { id: "ls-1", chapterId: "ch-1", title: "Quiz lesson" },
      );
    });

    it("ném lỗi khi điểm đạt không nằm trong khoảng 1-100", async () => {
      await expect(
        saveQuizData("c-1", "ls-1", {
          passingScore: 0,
          isEntry: false,
          questions: [],
        })
      ).rejects.toThrow("Điểm đạt phải từ 1 đến 100%.");
    });

    it("ném lỗi khi quiz không có câu hỏi nào", async () => {
      await expect(
        saveQuizData("c-1", "ls-1", {
          passingScore: 70,
          isEntry: false,
          questions: [],
        })
      ).rejects.toThrow("Cần ít nhất một câu hỏi.");
    });

    it("ném lỗi khi câu hỏi có dưới 2 lựa chọn hoặc thiếu đáp án đúng", async () => {
      await expect(
        saveQuizData("c-1", "ls-1", {
          passingScore: 70,
          isEntry: false,
          questions: [
            {
              text: "Biến let trong JS là gì?",
              correctIndex: 0,
              options: ["Khai báo biến block-scoped"], // chỉ có 1 lựa chọn
            },
          ],
        })
      ).rejects.toThrow("Câu 1: cần ít nhất 2 lựa chọn có nội dung.");
    });

    it("lưu quiz thành công và lưu đúng các options cùng đáp án đúng", async () => {
      const mockTxUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const mockTxDeleteWhere = vi.fn().mockResolvedValue(undefined);
      const mockTxInsertValues = vi.fn().mockImplementation((val: any) => ({
        returning: vi.fn().mockResolvedValue([{ id: 501 }]),
      }));

      mockTransaction.mockImplementation(async (cb: any) => {
        return cb({
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  for: vi.fn().mockResolvedValue([{ id: 99, currentQuizRevision: 1 }]),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
          delete: vi.fn().mockReturnValue({ where: mockTxDeleteWhere }),
          insert: vi.fn().mockReturnValue({ values: mockTxInsertValues }),
        });
      });

      const res = await saveQuizData("c-1", "ls-1", {
        passingScore: 80,
        isEntry: false,
        questions: [
          {
            text: "React Hook nào dùng để quản lý state cơ bản?",
            explanation: "useState dùng để khởi tạo và cập nhật local state.",
            correctIndex: 1,
            options: ["useEffect", "useState", "useMemo", "useRef"],
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalled();
    });
  });

  describe("generateAiQuizQuestions", () => {
    it("sinh câu hỏi AI cho quiz bài học và lưu vào ai_content_drafts", async () => {
      mockOwnedContent(
        { id: "c-1", instructorId: "lecturer-1", title: "React TypeScript Chuyên Sâu", status: "draft" },
        { id: "ls-1", chapterId: "ch-1", title: "React lesson" },
      );

      const mockValues = vi.fn().mockResolvedValue(undefined);
      mockInsert.mockReturnValue({ values: mockValues });

      const res = await generateAiQuizQuestions("c-1", "ls-1", 3, "medium");

      expect(res.success).toBe(true);
      expect(res.questions.length).toBe(3);
      expect(res.questions[0].aiGenerated).toBe(true);
      expect(res.questions[0].aiReviewed).toBe(false);
      expect(res.questions[0].options.length).toBe(4);
      expect(res.questions[0].correctIndex).toBe(0);
      expect(mockInsert).toHaveBeenCalled();
    });
  });
});

