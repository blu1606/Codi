import {
  getEditableCourse,
  verifyChapterBelongsToCourse,
  verifyLessonBelongsToCourse,
} from "./course-queries";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessmentSubmissions, courseChapters, courseLessons, courses, lessonMaterials } from "@codi-1/db";

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
  getCourseEditorData,
  getLessonDetails,
  getQuizBuilderData,
  moveChapter,
  moveLesson,
  renameChapter,
  renameLesson,
  restoreLesson,
  saveQuizData,
  updateCourseInfo,
  updateLesson,
} from "./actions";

function mockOwnedContent(course: Record<string, unknown>, lesson: Record<string, unknown>) {
  mockSelect.mockImplementation((selection?: { lesson?: unknown }) => ({
    from: vi.fn().mockImplementation((table) => {
      const rows =
        table === courses
          ? [course]
          : table === courseChapters
          ? [{ id: lesson.chapterId, courseId: course.id }]
          : table === courseLessons
          ? selection?.lesson
            ? [{ lesson }]
            : [lesson]
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

  describe("Cross-course ownership guards (Finding 1)", () => {
    it("verifyChapterBelongsToCourse ném lỗi khi chapter không thuộc khoá học", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      await expect(verifyChapterBelongsToCourse("c-1", "ch-other")).rejects.toThrow(
        "Không tìm thấy chương trong khoá học này."
      );
    });

    it("verifyLessonBelongsToCourse ném lỗi khi lesson không thuộc khoá học qua join", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(verifyLessonBelongsToCourse("c-1", "ls-other")).rejects.toThrow(
        "Không tìm thấy bài học trong khoá học này."
      );
    });

    it("addLesson chặn thêm bài vào chapter của khoá khác", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // getEditableCourse
            return { where: vi.fn().mockResolvedValue([{ id: "c-1", instructorId: "lecturer-1", status: "draft" }]) };
          }
          // verifyChapterBelongsToCourse (không tìm thấy)
          return { where: vi.fn().mockResolvedValue([]) };
        }),
      }));

      await expect(addLesson("c-1", "ch-foreign")).rejects.toThrow(
        "Không tìm thấy chương trong khoá học này."
      );
    });

    it("renameLesson chặn đổi tên bài học của khoá khác", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return { where: vi.fn().mockResolvedValue([{ id: "c-1", instructorId: "lecturer-1", status: "draft" }]) };
          }
          // verifyLessonBelongsToCourse
          return {
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
      }));

      await expect(renameLesson("c-1", "ls-foreign", "Tên mới")).rejects.toThrow(
        "Không tìm thấy bài học trong khoá học này."
      );
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
        category: "Frontend",
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

  describe("deleteLesson & restoreLesson (Finding 2)", () => {
    function mockDeletion(submissions: number, lesson: Record<string, unknown>, materials: Record<string, unknown>[] = []) {
      mockTransaction.mockImplementation((run) => run({ select: mockSelect, delete: mockDelete, update: mockUpdate }));
      mockSelect.mockImplementation((selection?: { lesson?: unknown }) => {
        let table: unknown;
        const rows = () => table === courses
          ? [{ id: "c-1", instructorId: "lecturer-1", status: "draft" }]
          : table === courseLessons ? [selection?.lesson ? { lesson } : lesson]
          : table === assessmentSubmissions ? [{ count: submissions }]
          : table === lessonMaterials ? materials : [];
        const query = {
          from(value: unknown) { table = value; return query; },
          innerJoin() { return query; }, where() { return query; },
          for() { return query; }, limit() { return query; }, orderBy() { return query; },
          then(resolve: (value: unknown[]) => unknown) { return Promise.resolve(rows()).then(resolve); },
        };
        return query;
      });
    }
    it("chặn xoá bài học khi đã có học viên nộp bài / làm bài kiểm tra", async () => {
      mockDeletion(2, { id: "ls-10", chapterId: "ch-1", title: "Bài 1" });

      await expect(deleteLesson("c-1", "ls-10")).rejects.toThrow(
        "Không thể xoá bài học vì đã có học viên làm bài kiểm tra hoặc nộp bài trong bài học này."
      );
    });

    it("xoá bài học an toàn trả về đầy đủ snapshot để phục hồi hoàn hảo khi Hoàn tác", async () => {
      mockDeletion(0, {
        id: "ls-10",
        chapterId: "ch-1",
        title: "Bài 1: Cài đặt",
        description: "Mô tả bài học",
        durationSeconds: 1200,
        position: 0,
        isPublished: true,
        body: "Nội dung bài học",
        isFreePreview: true,
        isRemedial: false,
      }, [{ id: 101, lessonId: "ls-10", type: "video", title: "Video 1", url: "https://vid", position: 0 }]);

      mockDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const res = await deleteLesson("c-1", "ls-10");
      expect(res.success).toBe(true);
      expect(res.deletedLesson.lesson.title).toBe("Bài 1: Cài đặt");
      expect(res.deletedLesson.lesson.body).toBe("Nội dung bài học");
      expect(res.deletedLesson.materials.length).toBe(1);
    });

    it("khôi phục bài học hoàn chỉnh kèm tài liệu khi bấm Hoàn tác", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return { where: vi.fn().mockResolvedValue([{ id: "c-1", instructorId: "lecturer-1", status: "draft" }]) };
          }
          // verifyChapterBelongsToCourse
          return { where: vi.fn().mockResolvedValue([{ id: "ch-1", courseId: "c-1" }]) };
        }),
      }));

      const mockTxInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      mockTransaction.mockImplementation(async (cb: any) => {
        return cb({
          insert: mockTxInsert,
          update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
        });
      });

      const res = await restoreLesson("c-1", {
        lesson: {
          id: "ls-10",
          chapterId: "ch-1",
          title: "Bài 1: Cài đặt",
          description: "Mô tả",
          durationSeconds: 1200,
          position: 0,
          isPublished: true,
          body: "Nội dung",
          isFreePreview: true,
          isRemedial: false,
        },
        materials: [
          {
            id: 101,
            lessonId: "ls-10",
            type: "video",
            title: "Video 1",
            url: "https://vid",
            position: 0,
            fileSizeKb: null,
            durationSeconds: 300,
            createdAt: new Date(),
          },
        ],
        assessments: [],
      });

      expect(res.success).toBe(true);
      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  describe("updateLesson (Finding 9 / S22)", () => {
    it("cập nhật thông tin chi tiết bài học và tài liệu học tập", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return { where: vi.fn().mockResolvedValue([{ id: "c-1", instructorId: "lecturer-1", status: "draft" }]) };
          }
          // verifyLessonBelongsToCourse
          return {
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: "ls-1", chapterId: "ch-1" }]),
            }),
          };
        }),
      }));

      const mockTxUpdate = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
      const mockTxDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const mockTxInsert = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      mockTransaction.mockImplementation(async (cb: any) => {
        return cb({
          update: mockTxUpdate,
          delete: mockTxDelete,
          insert: mockTxInsert,
        });
      });

      const res = await updateLesson("c-1", "ls-1", {
        title: "Bài học cập nhật",
        description: "Mô tả chi tiết",
        durationMinutes: 15,
        body: "Nội dung markdown",
        isFreePreview: true,
        materials: [
          {
            type: "pdf",
            title: "Tài liệu tham khảo",
            url: "https://codi.test/doc.pdf",
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(mockTransaction).toHaveBeenCalled();
    });
  });

  describe("saveQuizData (Findings 3, 4, 8)", () => {
    beforeEach(() => {
      mockOwnedContent(
        { id: "c-1", instructorId: "lecturer-1", status: "draft" },
        { id: "ls-1", chapterId: "ch-1", title: "Quiz lesson" },
      );
    });

    it("lưu bài kiểm tra đầu vào (Diagnostic) mà KHÔNG làm mất cờ isDiagnostic (Finding 3)", async () => {
      const mockTxUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      let txSelectCalls = 0;
      mockTransaction.mockImplementation(async (cb: any) => {
        return cb({
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                txSelectCalls++;
                if (txSelectCalls === 1) {
                  return {
                    limit: vi.fn().mockReturnValue({
                      for: vi.fn().mockResolvedValue([{ id: 99, isDiagnostic: true, lessonId: null, currentQuizRevision: 1 }]),
                    }),
                  };
                }
                return Promise.resolve([]);
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
          delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 701 }]),
            }),
          }),
        });
      });

      const res = await saveQuizData("c-1", "entry", {
        passingScore: 75,
        isEntry: true,
        questions: [
          {
            text: "Câu hỏi xếp lớp 1",
            correctIndex: 0,
            options: ["A", "B"],
          },
        ],
      });

      expect(res.success).toBe(true);
      expect(mockTxUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ passingScore: 75, isDiagnostic: true, currentQuizRevision: 2 })
      );
    });

    it("lưu quiz tạo revision mới bảo toàn lịch sử câu hỏi và bài làm (Finding 4)", async () => {
      const mockTxUpdateSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const mockTxInsertValues = vi.fn().mockImplementation((val: any) => ({
        returning: vi.fn().mockResolvedValue([{ id: 501 }]),
      }));

      mockTransaction.mockImplementation(async (cb: any) => {
        return cb({
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  for: vi.fn().mockResolvedValue([{ id: 99, currentQuizRevision: 2 }]),
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
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
      expect(mockTxInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({ quizRevision: 3 })
      );
      expect(mockTxUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ currentQuizRevision: 3 })
      );
      expect(mockTransaction).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalled();
    });

    it("kiểm tra bài học gắn với câu hỏi diagnostic phải thuộc khoá học (Finding 8)", async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return { where: vi.fn().mockResolvedValue([{ id: "c-1", instructorId: "lecturer-1", status: "draft" }]) };
          }
          // verifyLessonBelongsToCourse: không tìm thấy lesson
          return {
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
      }));

      await expect(
        saveQuizData("c-1", "entry", {
          passingScore: 80,
          isEntry: true,
          questions: [
            {
              text: "Câu hỏi diagnostic gắn bài lạ",
              correctIndex: 0,
              options: ["A", "B"],
              lessonId: "ls-foreign",
            },
          ],
        })
      ).rejects.toThrow("Không tìm thấy bài học trong khoá học này.");
    });
  });
});
