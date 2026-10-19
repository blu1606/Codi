import { describe, expect, it } from "vitest";
import {
  applySnippetPlaceholders,
  computeRubricTotal,
  formatDateTime,
  formatRelativeTime,
  parseFeedbackAndHistory,
  serializeFeedbackAndHistory,
  validateGradeInput,
  type GradingHistoryEntry,
  type RubricCriterion,
} from "./grading-service";

describe("Grading Service Unit Tests", () => {
  describe("parseFeedbackAndHistory & serializeFeedbackAndHistory", () => {
    it("handles empty or null feedback", () => {
      expect(parseFeedbackAndHistory(null)).toEqual({ feedback: "", history: [] });
      expect(parseFeedbackAndHistory(undefined)).toEqual({ feedback: "", history: [] });
      expect(parseFeedbackAndHistory("")).toEqual({ feedback: "", history: [] });
    });

    it("parses plain feedback without history", () => {
      const text = "Bài làm rất tốt, cách tổ chức mã nguồn rõ ràng.";
      const res = parseFeedbackAndHistory(text);
      expect(res.feedback).toBe(text);
      expect(res.history).toEqual([]);
    });

    it("serializes and parses feedback with history entries correctly", () => {
      const feedback = "Em cần chú ý thêm phần tối ưu vòng lặp.";
      const history: GradingHistoryEntry[] = [
        {
          oldScore: 7,
          newScore: 8.5,
          reason: "Học viên giải trình lại phần bài tập nâng cao",
          feedback: "Bài nộp ban đầu chưa tối ưu",
          at: "2026-10-18T10:00:00.000Z",
          gradedBy: "lecturer-1",
        },
      ];

      const serialized = serializeFeedbackAndHistory(feedback, history);
      expect(serialized).toContain("<!--grading_history:");
      expect(serialized).toContain(feedback);

      const parsed = parseFeedbackAndHistory(serialized);
      expect(parsed.feedback).toBe(feedback);
      expect(parsed.history).toHaveLength(1);
      expect(parsed.history[0].oldScore).toBe(7);
      expect(parsed.history[0].newScore).toBe(8.5);
      expect(parsed.history[0].reason).toBe("Học viên giải trình lại phần bài tập nâng cao");
    });

    it("handles corrupted or malformed history gracefully", () => {
      const corrupted = "Nhận xét bình thường\n\n<!--grading_history:{invalid_json}-->";
      const parsed = parseFeedbackAndHistory(corrupted);
      expect(parsed.feedback).toBe("Nhận xét bình thường");
      expect(parsed.history).toEqual([]);
    });
  });

  describe("applySnippetPlaceholders", () => {
    it("replaces double braces {{ten_hoc_vien}} and {{diem}}", () => {
      const template = "Chào {{ten_hoc_vien}}, bài của bạn đạt {{diem}} điểm. Cố gắng phát huy!";
      const result = applySnippetPlaceholders(template, {
        studentName: "Nguyễn Văn Tuấn",
        score: 9.5,
      });
      expect(result).toBe("Chào Nguyễn Văn Tuấn, bài của bạn đạt 9,5 điểm. Cố gắng phát huy!");
    });

    it("replaces single braces {ten_hoc_vien} and {diem}", () => {
      const template = "Chào {ten_hoc_vien}, điểm số: {diem}/10.";
      const result = applySnippetPlaceholders(template, {
        studentName: "Lê Thị Lan",
        score: 8,
      });
      expect(result).toBe("Chào Lê Thị Lan, điểm số: 8/10.");
    });

    it("uses default fallbacks when variables are missing", () => {
      const template = "Chào {{ten_hoc_vien}}, điểm của bạn là {{diem}}.";
      const result = applySnippetPlaceholders(template, {});
      expect(result).toBe("Chào em, điểm của bạn là —.");
    });
  });

  describe("computeRubricTotal", () => {
    const sampleRubric: RubricCriterion[] = [
      { id: "syntax", name: "Cú pháp & Clean code", points: 3 },
      { id: "logic", name: "Thuật toán & Tính đúng đắn", points: 5 },
      { id: "test", name: "Độ bao phủ Test case", points: 2 },
    ];

    it("calculates total accurately when all scores are valid", () => {
      const scores = { syntax: 2.5, logic: 4.5, test: 2 };
      const res = computeRubricTotal(sampleRubric, scores);
      expect(res.isValid).toBe(true);
      expect(res.total).toBe(9);
      expect(Object.keys(res.errors)).toHaveLength(0);
    });

    it("returns invalid and reports error when criterion score exceeds max points", () => {
      const scores = { syntax: 4, logic: 4, test: 1 };
      const res = computeRubricTotal(sampleRubric, scores);
      expect(res.isValid).toBe(false);
      expect(res.errors.syntax).toBeDefined();
    });

    it("returns invalid when criterion score is negative or missing", () => {
      const scores = { syntax: -1, logic: 3 }; // missing test
      const res = computeRubricTotal(sampleRubric, scores as any);
      expect(res.isValid).toBe(false);
      expect(res.errors.syntax).toBeDefined();
      expect(res.errors.test).toBeDefined();
    });
  });

  describe("validateGradeInput guards (STATE-MACHINES §20)", () => {
    it("validates score within 0..maxScore for pending submission", () => {
      expect(
        validateGradeInput({ score: 8.5, maxScore: 10, wasGraded: false }).isValid
      ).toBe(true);

      expect(
        validateGradeInput({ score: 11, maxScore: 10, wasGraded: false }).isValid
      ).toBe(false);

      expect(
        validateGradeInput({ score: -1, maxScore: 10, wasGraded: false }).isValid
      ).toBe(false);
    });

    it("requires reason when editing grade if score changed", () => {
      // Sửa điểm từ 7 thành 9 mà không có lý do -> không hợp lệ
      const withoutReason = validateGradeInput({
        score: 9,
        maxScore: 10,
        wasGraded: true,
        oldScore: 7,
        reason: "",
      });
      expect(withoutReason.isValid).toBe(false);
      expect(withoutReason.error).toContain("lý do điều chỉnh");

      // Có lý do hợp lệ -> hợp lệ
      const withReason = validateGradeInput({
        score: 9,
        maxScore: 10,
        wasGraded: true,
        oldScore: 7,
        reason: "Chấm lại câu 3 sau phúc khảo",
      });
      expect(withReason.isValid).toBe(true);
    });

    it("does not require reason if score is unchanged (feedback only edit)", () => {
      const res = validateGradeInput({
        score: 8,
        maxScore: 10,
        wasGraded: true,
        oldScore: 8,
        reason: "",
      });
      expect(res.isValid).toBe(true);
    });
  });

  describe("formatRelativeTime & formatDateTime", () => {
    it("formats relative time correctly", () => {
      expect(formatRelativeTime(null)).toBe("");
      expect(formatRelativeTime("invalid")).toBe("");

      const now = Date.now();
      expect(formatRelativeTime(new Date(now - 30 * 1000))).toBe("Vừa xong");
      expect(formatRelativeTime(new Date(now - 10 * 60 * 1000))).toBe("10 phút trước");
      expect(formatRelativeTime(new Date(now - 3 * 3600 * 1000))).toBe("3 giờ trước");
      expect(formatRelativeTime(new Date(now - 2 * 86400 * 1000))).toBe("2 ngày trước");
    });

    it("formats date and time correctly", () => {
      expect(formatDateTime(null)).toBe("—");
      expect(formatDateTime("invalid")).toBe("—");
      const d = new Date(2026, 9, 15, 14, 30); // 15/10/2026 14:30
      expect(formatDateTime(d)).toBe("14:30 15/10/2026");
    });
  });
});
