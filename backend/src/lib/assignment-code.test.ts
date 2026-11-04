// Run: npx tsx --test src/lib/assignment-code.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignmentCodeLanguage,
  assignmentTransition,
  requireAssignment,
  type AssignmentDraft,
} from "./assessment-contract";

const draft = (over: Partial<AssignmentDraft> = {}): AssignmentDraft => ({
  linkUrl: "",
  answerText: "",
  fileKey: null,
  fileName: null,
  ...over,
});

test("a function to write in a .js file is a JavaScript code assignment", () => {
  assert.equal(
    assignmentCodeLanguage({
      title: "Bài tập: Hàm và phạm vi",
      instructions: 'Viết hàm formatPrice(n) trả về chuỗi giá VND có dấu chấm phân cách (ví dụ 1290000 → "1.290.000 ₫"). Nộp đường dẫn hoặc tệp .js.',
    }),
    "javascript",
  );
  assert.equal(
    assignmentCodeLanguage({
      title: "Bài tập: Đối tượng và destructuring",
      instructions: "Cho mảng đơn hàng, viết hàm trả về tổng tiền theo từng khách hàng dùng reduce và destructuring. Nộp tệp .js.\n\nĐịnh dạng tệp chấp nhận: .zip, .js, .pdf.",
    }),
    "javascript",
  );
  assert.equal(assignmentCodeLanguage({ title: "Bài tập: Kiểu", instructions: "Viết hàm sum(a: number) bằng TypeScript." }), "typescript");
});

test("pages, components and projects keep link or file submission", () => {
  for (const instructions of [
    "Xây dựng component Bộ đếm (Counter) có nút tăng, giảm và đặt lại. Nộp đường dẫn CodeSandbox hoặc GitHub.",
    "Tạo trang danh sách người dùng lấy dữ liệu từ API. Nộp tệp .zip mã nguồn.\n\nĐịnh dạng tệp chấp nhận: .zip, .js, .pdf.",
    "Xây dựng trang tra cứu thời tiết theo tên thành phố. Nộp đường dẫn GitHub.",
    "Hoàn thành ứng dụng quản lý công việc theo yêu cầu.",
    "Viết bài phân tích về kiến trúc.",
  ])
    assert.equal(assignmentCodeLanguage({ title: "Bài tập", instructions }), null, instructions);
  assert.equal(assignmentCodeLanguage({ title: "Bài tập", instructions: null }), null);
});

test("submitted code completes a code assignment whatever its link/file format", () => {
  assert.doesNotThrow(() => requireAssignment("link", draft({ code: "function f() {}" }), "javascript"));
  assert.throws(() => requireAssignment("link", draft({ code: "   " }), "javascript"));
  // Code does not count for an assignment that has no code editor.
  assert.throws(() => requireAssignment("link", draft({ code: "function f() {}" }), null));
  // A link given next to the code is still validated.
  assert.throws(() => requireAssignment("link", draft({ code: "x", linkUrl: "ftp://a" }), "javascript"));
});

test("code is refused by assignments without an editor and kept when omitted", () => {
  const state = { type: "assignment", submission: null, draft: draft({ code: "saved" }), format: "link" as const };
  assert.throws(() =>
    assignmentTransition({ ...state, codeLanguage: null }, { type: "assignment-draft", linkUrl: "", answerText: "", code: "x" }),
  );
  const kept = assignmentTransition({ ...state, codeLanguage: "javascript" }, { type: "assignment-draft", linkUrl: "", answerText: "note" });
  assert.equal(kept.type === "draft" && kept.draft.code, "saved");
  const submitted = assignmentTransition(
    { ...state, codeLanguage: "javascript" },
    { type: "assignment-submit", linkUrl: "", answerText: "", code: "function formatPrice() {}" },
  );
  assert.equal(submitted.type, "submit");
});
