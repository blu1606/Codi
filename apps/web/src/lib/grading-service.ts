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
export function parseFeedbackAndHistory(rawFeedback: string | null | undefined, strict = false): {
  feedback: string;
  history: GradingHistoryEntry[];
  rubricScores: Record<string, number> | null;
} {
  const raw = rawFeedback || "";
  const empty = { feedback: raw.trim(), history: [] as GradingHistoryEntry[], rubricScores: null };
  const marker = "<!--grading_record_v2:";
  let feedback = raw.trim();
  try {
    let payload: any;
    const recordIndex = raw.lastIndexOf("\n\n" + marker);
    if (recordIndex >= 0) {
      const match = raw.slice(recordIndex + 2).match(/^<!--grading_record_v2:([A-Za-z0-9+/=]+)-->\s*$/);
      if (!match) throw new Error("invalid envelope");
      const encoded = match[1]!;
      const decoded = Buffer.from(encoded, "base64");
      if (decoded.toString("base64") !== encoded) throw new Error("invalid encoding");
      payload = JSON.parse(decoded.toString("utf8"));
      if (typeof payload.feedback !== "string") throw new Error("invalid feedback");
      if (payload.feedback !== raw.slice(0, recordIndex).trim()) throw new Error("feedback mismatch");
      feedback = payload.feedback;
    } else {
      // Legacy metadata was a suffix; choose the final appended envelope, not a literal in visible text.
      const b64 = raw.lastIndexOf("\n\n<!--grading_meta_b64:");
      const legacy = raw.lastIndexOf("\n\n<!--grading_history:");
      const index = Math.max(b64, legacy);
      if (index < 0) {
        if (strict && /<!--grading_(?:record_v2|meta_b64|history):/.test(raw)) throw new Error("ambiguous legacy metadata");
        return empty;
      }
      const isB64 = index === b64;
      const prefix = isB64 ? "\n\n<!--grading_meta_b64:" : "\n\n<!--grading_history:";
      const tail = raw.slice(index + prefix.length).trimEnd();
      if (!tail.endsWith("-->")) throw new Error("invalid suffix");
      const value = tail.slice(0, -3);
      payload = JSON.parse(isB64 ? Buffer.from(value, "base64").toString("utf8") : value);
      if (Array.isArray(payload)) payload = { history: payload };
      feedback = raw.slice(0, index).trim();
    }
    if (!Array.isArray(payload?.history) || !payload.history.every((entry: any) =>
      entry && Number.isFinite(entry.oldScore) && Number.isFinite(entry.newScore) &&
      typeof entry.at === "string" &&
      ["feedback", "reason", "gradedBy"].every(key => entry[key] == null || typeof entry[key] === "string")
    )) throw new Error("invalid history");
    const scores = payload.rubricScores;
    if (scores != null && (typeof scores !== "object" || Array.isArray(scores) ||
      !Object.values(scores).every(value => typeof value === "number" && Number.isFinite(value)))) {
      throw new Error("invalid rubric scores");
    }
    return { feedback, history: payload.history, rubricScores: scores ?? null };
  } catch {
    if (strict) throw new Error("Lịch sử chấm điểm không hợp lệ. Không thể ghi đè; vui lòng liên hệ hỗ trợ.");
    // Reading does not erase the stored value. Mutations must use strict mode.
    return { ...empty, feedback: raw.split("\n\n<!--grading_")[0]!.trim() };
  }
}

/** Append a versioned final envelope; literal markers in feedback cannot shadow the suffix. */
export function serializeFeedbackAndHistory(
  feedback: string,
  history: GradingHistoryEntry[],
  rubricScores?: Record<string, number> | null
): string {
  const payload = { feedback: (feedback || "").trim(), history, rubricScores: rubricScores ?? null };
  return `${payload.feedback}\n\n<!--grading_record_v2:${Buffer.from(JSON.stringify(payload), "utf8").toString("base64")}-->`;
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

    if (typeof val !== "number" || !Number.isFinite(val)) {
      isValid = false;
      errors[criterion.id] = `Vui lòng nhập điểm cho "${name}".`;
    } else if (!Number.isFinite(max) || max < 0 || val < 0 || val > max) {
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
