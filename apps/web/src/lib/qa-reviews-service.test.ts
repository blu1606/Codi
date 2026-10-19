import { describe, expect, it } from "vitest";
import {
  canResolveConversation,
  formatDate,
  formatRelativeTime,
  validateReplyText,
  validateReviewReply,
} from "./qa-reviews-service";

describe("QA & Reviews Pure Domain Service Tests", () => {
  describe("validateReplyText (STATE-MACHINES.md §14.1 & §14.2)", () => {
    it("rejects replies shorter than 5 characters", () => {
      expect(validateReplyText("").isValid).toBe(false);
      expect(validateReplyText("   ").isValid).toBe(false);
      expect(validateReplyText("1234").isValid).toBe(false);
      expect(validateReplyText("Ok").isValid).toBe(false);
      expect(validateReplyText("1234").error).toBe("Câu trả lời cần ít nhất 5 ký tự.");
    });

    it("accepts replies with 5 or more characters", () => {
      expect(validateReplyText("12345").isValid).toBe(true);
      expect(validateReplyText("Em kiểm tra lại cấu hình nhé.").isValid).toBe(true);
    });

    it("rejects excessively long replies over 5000 characters", () => {
      const longText = "a".repeat(5001);
      const res = validateReplyText(longText);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("5000 ký tự");
    });
  });

  describe("canResolveConversation (Decision D8 & D9)", () => {
    it("cannot resolve if there are no messages", () => {
      const res = canResolveConversation([]);
      expect(res.canResolve).toBe(false);
      expect(res.error).toBe("Hãy trả lời học viên trước khi đánh dấu đã giải quyết.");
    });

    it("cannot resolve if only learner has sent messages", () => {
      const res = canResolveConversation([
        { isLecturer: false },
        { isLecturer: false },
      ]);
      expect(res.canResolve).toBe(false);
      expect(res.error).toBe("Hãy trả lời học viên trước khi đánh dấu đã giải quyết.");
    });

    it("can resolve when at least one lecturer reply exists", () => {
      const res = canResolveConversation([
        { isLecturer: false },
        { isLecturer: true },
      ]);
      expect(res.canResolve).toBe(true);
      expect(res.error).toBeUndefined();
    });
  });

  describe("validateReviewReply (STATE-MACHINES.md §15)", () => {
    it("rejects empty review reply", () => {
      expect(validateReviewReply("").isValid).toBe(false);
      expect(validateReviewReply("   ").isValid).toBe(false);
      expect(validateReviewReply(null).isValid).toBe(false);
      expect(validateReviewReply("").error).toBe("Nhập nội dung phản hồi.");
    });

    it("accepts valid review reply", () => {
      const res = validateReviewReply("Cảm ơn em đã đóng góp ý kiến!");
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it("rejects replies exceeding 3000 characters", () => {
      const longText = "x".repeat(3001);
      const res = validateReviewReply(longText);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("3000 ký tự");
    });
  });

  describe("formatRelativeTime & formatDate", () => {
    it("formats relative time accurately", () => {
      expect(formatRelativeTime(null)).toBe("");
      expect(formatRelativeTime("invalid")).toBe("");

      const now = Date.now();
      expect(formatRelativeTime(new Date(now - 15 * 1000))).toBe("Vừa xong");
      expect(formatRelativeTime(new Date(now - 5 * 60 * 1000))).toBe("5 phút trước");
      expect(formatRelativeTime(new Date(now - 4 * 3600 * 1000))).toBe("4 giờ trước");
      expect(formatRelativeTime(new Date(now - 3 * 86400 * 1000))).toBe("3 ngày trước");
    });

    it("formats date in DD/MM/YYYY format", () => {
      expect(formatDate(null)).toBe("—");
      expect(formatDate("invalid")).toBe("—");
      const d = new Date(2026, 9, 14); // 14/10/2026
      expect(formatDate(d)).toBe("14/10/2026");
    });
  });
});
