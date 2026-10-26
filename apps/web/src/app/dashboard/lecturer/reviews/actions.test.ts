import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = {
  id: "lecturer-user-1",
  name: "Nguyễn Văn Giảng",
  email: "lecturer@codi.edu.vn",
};

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockRevalidatePath = vi.fn();
const mockGetActiveRoles = vi.fn();

vi.mock("@/services", () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    update: (...args: any[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/lecturer-auth", () => ({
  verifyLecturerSession: vi.fn().mockImplementation(async () => mockUser),
}));

vi.mock("@codi-1/auth", () => ({
  ROLE: { LECTURER: "lecturer", ADMIN: "admin", LEARNER: "learner" },
  getActiveRoles: (...args: any[]) => mockGetActiveRoles(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}));

import {
  deleteCourseReviewReply,
  getLecturerReviewsData,
  replyToCourseReview,
} from "./actions";

describe("Lecturer Reviews Server Actions (STATE-MACHINES.md §15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveRoles.mockResolvedValue(["lecturer"]);
  });

  describe("getLecturerReviewsData", () => {
    it("returns empty structure when lecturer has no courses", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const res = await getLecturerReviewsData();
      expect(res.reviews).toHaveLength(0);
      expect(res.counts.all).toBe(0);
      expect(res.counts.unreplied).toBe(0);
    });

    it("fetches reviews and counts all vs unreplied", async () => {
      let queryCount = 0;
      const mockReviewsList = [
        {
          id: 1,
          courseId: "c1",
          courseTitle: "React",
          learnerId: "s1",
          learnerName: "Học viên A",
          learnerAvatar: null,
          rating: 5,
          text: "Khoá học tuyệt vời!",
          lecturerReply: null,
          repliedAt: null,
          createdAt: new Date("2026-10-15"),
        },
        {
          id: 2,
          courseId: "c1",
          courseTitle: "React",
          learnerId: "s2",
          learnerName: "Học viên B",
          learnerAvatar: null,
          rating: 4,
          text: "Rất chi tiết.",
          lecturerReply: "Cảm ơn em!",
          repliedAt: new Date("2026-10-16"),
          createdAt: new Date("2026-10-14"),
        },
      ];

      mockSelect.mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue([{ id: "c1", title: "React" }]),
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(mockReviewsList),
                }),
              }),
            }),
          }),
        })),
      }));

      const res = await getLecturerReviewsData({ filter: "all" });
      expect(res.counts.all).toBe(2);
      expect(res.counts.unreplied).toBe(1);
      expect(res.reviews).toHaveLength(2);

      // Filter unreplied only
      const resUnreplied = await getLecturerReviewsData({ filter: "unreplied" });
      expect(resUnreplied.reviews).toHaveLength(1);
      expect(resUnreplied.reviews[0].id).toBe(1);
    });
  });

  describe("replyToCourseReview", () => {
    it("fails when reply text is empty", async () => {
      const res = await replyToCourseReview({
        reviewId: 1,
        replyText: "",
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe("Nhập nội dung phản hồi.");
    });

    it("fails when review belongs to another lecturer's course", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 1,
                instructorId: "other-lecturer",
              },
            ]),
          }),
        }),
      });

      const res = await replyToCourseReview({
        reviewId: 1,
        replyText: "Cảm ơn bạn đã phản hồi.",
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain("không có quyền");
    });

    it("successfully posts review reply and revalidates path", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 1,
                instructorId: "lecturer-user-1",
              },
            ]),
          }),
        }),
      });

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const res = await replyToCourseReview({
        reviewId: 1,
        replyText: "Cảm ơn em rất nhiều, chúc em học tốt!",
      });

      expect(res.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        "/dashboard/lecturer/reviews"
      );
    });
  });

  describe("deleteCourseReviewReply", () => {
    it("deletes reply and sets lecturerReply to null", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: 1,
                instructorId: "lecturer-user-1",
              },
            ]),
          }),
        }),
      });

      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const res = await deleteCourseReviewReply({ reviewId: 1 });
      expect(res.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith(
        "/dashboard/lecturer/reviews"
      );
    });
  });
});
