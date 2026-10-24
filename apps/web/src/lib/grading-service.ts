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
  name?: string;
  title?: string;
  label?: string;
  desc?: string;
  description?: string;
  points?: number;
  maxScore?: number;
}

export function getCriterionName(c: RubricCriterion): string {
  return c.name || c.title || c.label || c.id;
}

export function getCriterionMaxScore(c: RubricCriterion): number {
  return Number(c.points ?? c.maxScore ?? 0);
}

/**
 * Tách nội dung nhận xét, lịch sử sửa điểm và điểm rubric từ chuỗi feedback lưu trong database.
 * Hỗ trợ định dạng Base64 hiện đại (miễn nhiễm với ký tự "-->" trong reason) và fallback định dạng cũ.
 */
export function parseFeedbackAndHistory(rawFeedback: string | null | undefined): {
  feedback: string;
  history: GradingHistoryEntry[];
  rubricScores: Record<string, number> | null;
} {
  if (!rawFeedback) {
    return { feedback: "", history: [], rubricScores: null };
  }

  // 1. Kiểm tra định dạng Base64 an toàn mới
  const b64Marker = "<!--grading_meta_b64:";
  const b64Idx = rawFeedback.indexOf(b64Marker);
  if (b64Idx !== -1) {
    const cleanFeedback = rawFeedback.slice(0, b64Idx).trim();
    const rest = rawFeedback.slice(b64Idx + b64Marker.length);
    const endIdx = rest.indexOf("-->");
    const b64Str = (endIdx !== -1 ? rest.slice(0, endIdx) : rest).trim();

    try {
      const jsonStr = Buffer.from(b64Str, "base64").toString("utf8");
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return { feedback: cleanFeedback, history: parsed, rubricScores: null };
      }
      return {
        feedback: cleanFeedback,
        history: Array.isArray(parsed?.history) ? parsed.history : [],
        rubricScores:
          parsed?.rubricScores && typeof parsed.rubricScores === "object"
            ? parsed.rubricScores
            : null,
      };
    } catch {
      return { feedback: cleanFeedback, history: [], rubricScores: null };
    }
  }

  // 2. Fallback định dạng cũ: <!--grading_history:
  const legacyMarker = "<!--grading_history:";
  const legacyIdx = rawFeedback.indexOf(legacyMarker);
  if (legacyIdx !== -1) {
    const cleanFeedback = rawFeedback.slice(0, legacyIdx).trim();
    const rest = rawFeedback.slice(legacyIdx + legacyMarker.length);
    const lastEndIdx = rest.lastIndexOf("-->");
    const jsonStr = (lastEndIdx !== -1 ? rest.slice(0, lastEndIdx) : rest).trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return {
        feedback: cleanFeedback,
        history: Array.isArray(parsed) ? parsed : [],
        rubricScores: null,
      };
    } catch {
      return { feedback: cleanFeedback, history: [], rubricScores: null };
    }
  }

  return { feedback: rawFeedback.trim(), history: [], rubricScores: null };
}

/**
 * Đóng gói nhận xét cùng mảng lịch sử sửa điểm và điểm rubric thành chuỗi lưu database.
 * Mã hoá Base64 bên trong HTML comment để không bị ngắt khi nội dung chứa chuỗi "-->".
 */
export function serializeFeedbackAndHistory(
  feedback: string,
  history: GradingHistoryEntry[],
  rubricScores?: Record<string, number> | null
): string {
  const clean = (feedback || "").trim();
  const hasHistory = Array.isArray(history) && history.length > 0;
  const hasRubric =
    rubricScores !== undefined &&
    rubricScores !== null &&
    typeof rubricScores === "object" &&
    Object.keys(rubricScores).length > 0;

  if (!hasHistory && !hasRubric) {
    return clean;
  }

  const payload = {
    history: hasHistory ? history : [],
    rubricScores: hasRubric ? rubricScores : undefined,
  };

  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return `${clean}\n\n<!--grading_meta_b64:${b64}-->`;
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
    const name = getCriterionName(criterion);
    const max = getCriterionMaxScore(criterion);
    const val = scores[criterion.id];

    if (val === undefined || val === null || isNaN(val)) {
      isValid = false;
      errors[criterion.id] = `Vui lòng nhập điểm cho "${name}".`;
    } else if (val < 0 || val > max) {
      isValid = false;
      errors[criterion.id] = `Điểm "${name}" phải từ 0 đến ${max}.`;
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
 * Xác thực điểm số rubric phía server theo STATE-MACHINES §20:
 * Mọi tiêu chí phải có điểm, nằm trong giới hạn [0..maxScore], và tổng điểm phải khớp.
 */
export function validateRubricScores(
  rubric: RubricCriterion[] | null | undefined,
  scores: Record<string, number> | null | undefined,
  totalScore: number
): { isValid: boolean; error?: string; derivedTotal?: number } {
  if (!rubric || rubric.length === 0) {
    return { isValid: true, derivedTotal: totalScore };
  }

  if (!scores || typeof scores !== "object" || Object.keys(scores).length === 0) {
    return {
      isValid: false,
      error: "Bài tập có thang điểm (rubric), vui lòng chấm điểm chi tiết cho từng tiêu chí.",
    };
  }

  const { total, isValid, errors } = computeRubricTotal(rubric, scores);
  if (!isValid) {
    const firstError = Object.values(errors)[0] || "Điểm theo thang điểm (rubric) không hợp lệ.";
    return { isValid: false, error: firstError };
  }

  if (Math.abs(total - totalScore) > 0.05) {
    return {
      isValid: false,
      error: `Tổng điểm (${totalScore}) không khớp với tổng điểm các tiêu chí rubric (${total}).`,
      derivedTotal: total,
    };
  }

  return { isValid: true, derivedTotal: total };
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
