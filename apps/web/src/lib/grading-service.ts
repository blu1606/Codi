/**
 * Grading domain service and utilities.
 * Handles history parsing, rubric calculation, placeholder replacement, and validation guards.
 */

export interface GradingHistoryEntry {
  oldScore: number;
  newScore: number;
  feedback?: string | null;
  reason?: string | null;
  at: string;
  gradedBy?: string | null;
}

export interface RubricCriterion {
  id: string;
  name: string;
  desc?: string;
  points: number;
}

/**
 * Tách nội dung nhận xét và lịch sử sửa điểm từ chuỗi feedback lưu trong database.
 */
export function parseFeedbackAndHistory(rawFeedback: string | null | undefined): {
  feedback: string;
  history: GradingHistoryEntry[];
} {
  if (!rawFeedback) {
    return { feedback: "", history: [] };
  }

  const marker = "<!--grading_history:";
  const idx = rawFeedback.indexOf(marker);
  if (idx === -1) {
    return { feedback: rawFeedback.trim(), history: [] };
  }

  const cleanFeedback = rawFeedback.slice(0, idx).trim();
  const endMarker = "-->";
  const jsonPart = rawFeedback.slice(idx + marker.length);
  const endIdx = jsonPart.indexOf(endMarker);
  const jsonStr = (endIdx !== -1 ? jsonPart.slice(0, endIdx) : jsonPart).trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      feedback: cleanFeedback,
      history: Array.isArray(parsed) ? parsed : [],
    };
  } catch {
    return { feedback: cleanFeedback, history: [] };
  }
}

/**
 * Đóng gói nhận xét cùng mảng lịch sử sửa điểm thành chuỗi lưu database.
 */
export function serializeFeedbackAndHistory(
  feedback: string,
  history: GradingHistoryEntry[]
): string {
  const clean = (feedback || "").trim();
  if (!history || history.length === 0) {
    return clean;
  }
  return `${clean}\n\n<!--grading_history:${JSON.stringify(history)}-->`;
}

/**
 * Thay thế các biến placeholder trong mẫu nhận xét:
 * - {{ten_hoc_vien}} hoặc {ten_hoc_vien} -> tên học viên
 * - {{diem}} hoặc {diem} -> điểm số đã nhập
 */
export function applySnippetPlaceholders(
  template: string,
  variables: { studentName?: string; score?: number | string | null }
): string {
  if (!template) return "";
  let result = template;
  const name = (variables.studentName || "em").trim();
  const scoreStr =
    variables.score !== undefined && variables.score !== null && variables.score !== ""
      ? String(variables.score).replace(".", ",")
      : "—";

  result = result.replace(/\{\{ten_hoc_vien\}\}|\{ten_hoc_vien\}/g, name);
  result = result.replace(/\{\{diem\}\}|\{diem\}/g, scoreStr);
  return result;
}

/**
 * Tính tổng điểm theo thang điểm Rubric.
 */
export function computeRubricTotal(
  rubric: RubricCriterion[],
  scores: Record<string, number>
): { total: number; isValid: boolean; errors: Record<string, string> } {
  let total = 0;
  let isValid = true;
  const errors: Record<string, string> = {};

  for (const criterion of rubric) {
    const val = scores[criterion.id];
    if (val === undefined || val === null || isNaN(val)) {
      isValid = false;
      errors[criterion.id] = `Vui lòng nhập điểm cho "${criterion.name}".`;
    } else if (val < 0 || val > criterion.points) {
      isValid = false;
      errors[criterion.id] = `Điểm "${criterion.name}" phải từ 0 đến ${criterion.points}.`;
    } else {
      total += val;
    }
  }

  return {
    total: Math.round(total * 10) / 10,
    isValid,
    errors,
  };
}

/**
 * Kiểm tra các ràng buộc khi chấm bài hoặc sửa điểm (STATE-MACHINES.md §20).
 */
export function validateGradeInput(input: {
  score: number;
  maxScore: number;
  wasGraded: boolean;
  oldScore?: number | null;
  reason?: string | null;
}): { isValid: boolean; error?: string } {
  const { score, maxScore, wasGraded, oldScore, reason } = input;

  if (isNaN(score) || score < 0 || score > maxScore) {
    return {
      isValid: false,
      error: `Điểm số phải là số hợp lệ từ 0 đến ${maxScore}.`,
    };
  }

  // Ràng buộc khi sửa điểm bài đã chấm (graded -> graded và điểm thay đổi)
  if (wasGraded && oldScore !== undefined && oldScore !== null && score !== oldScore) {
    if (!reason || reason.trim().length < 3) {
      return {
        isValid: false,
        error: "Vui lòng nhập lý do điều chỉnh điểm số (tối thiểu 3 ký tự).",
      };
    }
  }

  return { isValid: true };
}

/**
 * Định dạng thời gian tương đối theo tiếng Việt (chuẩn mockup S26).
 */
export function formatRelativeTime(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return "";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "";

  const diffSec = (Date.now() - d.getTime()) / 1000;
  if (diffSec < 60) return "Vừa xong";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)} ngày trước`;

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Định dạng ngày giờ chuẩn tiếng Việt: HH:mm dd/MM/yyyy.
 */
export function formatDateTime(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return "—";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "—";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
