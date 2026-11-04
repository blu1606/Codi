// Run: npx tsx --test src/lib/assignment-rubric.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRubric } from "./assignment-rubric";

test("reads seed markdown rubric lines as criteria", () => {
  const raw = "- Kết quả đúng (5 điểm): Hàm trả về đúng.\n- Code dễ đọc (3 điểm): Đặt tên rõ.\n- Xử lý lỗi (2 điểm)";
  assert.deepEqual(parseRubric(raw), [
    { id: "r1", name: "Kết quả đúng", points: 5, desc: "Hàm trả về đúng." },
    { id: "r2", name: "Code dễ đọc", points: 3, desc: "Đặt tên rõ." },
    { id: "r3", name: "Xử lý lỗi", points: 2, desc: "" },
  ]);
});

test("reads builder JSON rubric unchanged", () => {
  const raw = JSON.stringify([{ id: "a", name: "Đúng", desc: "x", points: 10 }]);
  assert.deepEqual(parseRubric(raw), [{ id: "a", name: "Đúng", desc: "x", points: 10 }]);
});

test("returns no criteria for empty or unreadable rubric", () => {
  assert.deepEqual(parseRubric(null), []);
  assert.deepEqual(parseRubric("Chấm theo cảm nhận"), []);
});
