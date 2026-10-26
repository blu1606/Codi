import { describe, expect, it } from "vitest";
import {
  applySnippetPlaceholders,
  computeRubricTotal,
  formatDateTime,
  formatRelativeTime,
  parseFeedbackAndHistory,
  serializeFeedbackAndHistory,
  validateGradeInput,
  validateRubricScores,
  type GradingHistoryEntry,
  type RubricCriterion,
} from "./grading-service";

describe("Grading Service Unit Tests", () => {
  it("round trips arbitrary literal metadata markers without replacing history", () => {
    const feedback = 'See <!--grading_meta_b64:bad--> and <!--grading_history:[]--> literally\n\n<!--grading_record_v2:bad-->';
    const history = [{ oldScore: 1, newScore: 2, at: '2026-10-24', reason: 'x --> y' }];
    expect(parseFeedbackAndHistory(serializeFeedbackAndHistory(feedback, history))).toMatchObject({ feedback, history });
  });

  it("refuses malformed persisted metadata during a mutation", () => {
    expect(() => parseFeedbackAndHistory('text\n\n<!--grading_meta_b64:broken-->', true)).toThrow();
  });
  it("reads intact legacy history with terminators, and rejects malformed structured history", () => {
    const history = [{ oldScore: 1, newScore: 2, at: "2026-10-24", reason: "x --> y" }];
    expect(parseFeedbackAndHistory(`text\n\n<!--grading_history:${JSON.stringify(history)}-->`, true).history).toEqual(history);
    const payload = Buffer.from(JSON.stringify({ history: "not an array" })).toString("base64");
    expect(() => parseFeedbackAndHistory(`text\n\n<!--grading_meta_b64:${payload}-->`, true)).toThrow();
  });
  describe("parseFeedbackAndHistory & serializeFeedbackAndHistory", () => {
    it("handles empty or null feedback", () => {
      expect(parseFeedbackAndHistory(null)).toEqual({ feedback: "", history: [], rubricScores: null });
      expect(parseFeedbackAndHistory(undefined)).toEqual({ feedback: "", history: [], rubricScores: null });
      expect(parseFeedbackAndHistory("")).toEqual({ feedback: "", history: [], rubricScores: null });
    });

    it("parses plain feedback without history", () => {
      const text = "Bài làm rất tốt, cách tổ chức mã nguồn rõ ràng.";
      const res = parseFeedbackAndHistory(text);
      expect(res.feedback).toBe(text);
      expect(res.history).toEqual([]);
      expect(res.rubricScores).toBeNull();
    });

    it("serializes and parses feedback with history entries and rubric scores correctly", () => {
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
      const rubricScores = { syntax: 3, logic: 5.5 };

      const serialized = serializeFeedbackAndHistory(feedback, history, rubricScores);
      expect(serialized).toContain("<!--grading_record_v2:");
      // The entire record is encoded; assert visible text through the reader below.

      const parsed = parseFeedbackAndHistory(serialized);
      expect(parsed.feedback).toBe(feedback);
      expect(parsed.history).toHaveLength(1);
      expect(parsed.history[0].oldScore).toBe(7);
      expect(parsed.history[0].newScore).toBe(8.5);
      expect(parsed.history[0].reason).toBe("Học viên giải trình lại phần bài tập nâng cao");
      expect(parsed.rubricScores).toEqual(rubricScores);
    });

    it("preserves history and rubric when reasons or feedback contain an HTML-comment terminator (-->)", () => {
      const feedback = "Em sửa theo hướng dẫn: line 10 --> line 20";
      const history: GradingHistoryEntry[] = [
        {
          oldScore: 6,
          newScore: 9,
          reason: "Corrected from x --> y based on improved test coverage --> 100%",
          feedback: "Original was missing edge cases --> see feedback",
          at: "2026-10-24T12:00:00.000Z",
          gradedBy: "lecturer-1",
        },
      ];
      const rubricScores = { c1: 4.5, c2: 4.5 };

      const serialized = serializeFeedbackAndHistory(feedback, history, rubricScores);
      const parsed = parseFeedbackAndHistory(serialized);

      expect(parsed.feedback).toBe(feedback);
      expect(parsed.history).toHaveLength(1);
      expect(parsed.history[0].reason).toBe("Corrected from x --> y based on improved test coverage --> 100%");
      expect(parsed.history[0].feedback).toBe("Original was missing edge cases --> see feedback");
      expect(parsed.rubricScores).toEqual(rubricScores);
    });

    it("supports backward-compatible parsing of legacy <!--grading_history: comments", () => {
      const legacyHistory = [
        {
          oldScore: 5,
          newScore: 7,
          reason: "Điểm cộng",
          at: "2026-10-15T00:00:00.000Z",
        },
      ];
      const legacyRaw = `Bài làm ổn.\n\n<!--grading_history:${JSON.stringify(legacyHistory)}-->`;
      const parsed = parseFeedbackAndHistory(legacyRaw);

      expect(parsed.feedback).toBe("Bài làm ổn.");
      expect(parsed.history).toHaveLength(1);
      expect(parsed.history[0].newScore).toBe(7);
      expect(parsed.rubricScores).toBeNull();
    });

    it("handles corrupted or malformed history gracefully", () => {
      const corrupted = "Nhận xét bình thường\n\n<!--grading_history:{invalid_json}-->";
      const parsed = parseFeedbackAndHistory(corrupted);
      expect(parsed.feedback).toBe("Nhận xét bình thường");
      expect(parsed.history).toEqual([]);
      expect(parsed.rubricScores).toBeNull();
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

  describe("computeRubricTotal & validateRubricScores", () => {
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

    it("validates missing criterion scores", () => {
      const scores = { syntax: 2, logic: 4 }; // missing 'test'
      const res = computeRubricTotal(sampleRubric, scores);
      expect(res.isValid).toBe(false);
      expect(res.errors.test).toBeDefined();
    });

    it("validates out of bounds criterion scores", () => {
      const scores = { syntax: 4, logic: 4, test: 1 }; // syntax exceeds max 3
      const res = computeRubricTotal(sampleRubric, scores);
      expect(res.isValid).toBe(false);
      expect(res.errors.syntax).toContain("từ 0 đến 3");
    });

    it("validates rubric scores on server and checks sum matches totalScore", () => {
      const valid = validateRubricScores(sampleRubric, { syntax: 3, logic: 5, test: 2 }, 10);
      expect(valid.isValid).toBe(true);
      expect(valid.derivedTotal).toBe(10);

      const mismatch = validateRubricScores(sampleRubric, { syntax: 3, logic: 5, test: 2 }, 8);
      expect(mismatch.isValid).toBe(false);
      expect(mismatch.error).toContain("không khớp");

      const missing = validateRubricScores(sampleRubric, null, 10);
      expect(missing.isValid).toBe(false);
      expect(missing.error).toContain("thang điểm (rubric)");
    });
  });

  describe("validateGradeInput", () => {
    it("accepts valid score within bounds for new grading", () => {
      const res = validateGradeInput({ score: 8.5, maxScore: 10, wasGraded: false });
      expect(res.isValid).toBe(true);
    });

    it("rejects score below 0 or above maxScore", () => {
      expect(validateGradeInput({ score: -1, maxScore: 10, wasGraded: false }).isValid).toBe(false);
      expect(validateGradeInput({ score: 11, maxScore: 10, wasGraded: false }).isValid).toBe(false);
    });

    it("requires reason of at least 3 chars when changing score on already graded submission", () => {
      const noReason = validateGradeInput({
        score: 9,
        maxScore: 10,
        wasGraded: true,
        oldScore: 7,
      });
      expect(noReason.isValid).toBe(false);
      expect(noReason.error).toContain("lý do");

      const withReason = validateGradeInput({
        score: 9,
        maxScore: 10,
        wasGraded: true,
        oldScore: 7,
        reason: "Chấm lại câu 2",
      });
      expect(withReason.isValid).toBe(true);
    });

    it("does not require reason if score did not change when updating feedback", () => {
      const sameScore = validateGradeInput({
        score: 8,
        maxScore: 10,
        wasGraded: true,
        oldScore: 8,
      });
      expect(sameScore.isValid).toBe(true);
    });
  });

  describe("formatRelativeTime & formatDateTime", () => {
    it("formats relative time in Vietnamese correctly", () => {
      const now = new Date();
      expect(formatRelativeTime(now)).toBe("Vừa xong");

      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
      expect(formatRelativeTime(tenMinutesAgo)).toBe("10 phút trước");

      const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);
      expect(formatRelativeTime(twoHoursAgo)).toBe("2 giờ trước");

      const threeDaysAgo = new Date(now.getTime() - 3 * 86400 * 1000);
      expect(formatRelativeTime(threeDaysAgo)).toBe("3 ngày trước");
    });

    it("formats absolute date time with 2-digit padding", () => {
      const d = new Date(2026, 9, 18, 9, 5); // 18/10/2026 09:05
      expect(formatDateTime(d)).toBe("09:05 18/10/2026");
    });
  });
});
