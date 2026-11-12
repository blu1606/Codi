// Writes the security demo samples (security-samples.ts) to a folder so the presenter can upload them by hand,
// with a Vietnamese README: file → what the system should do, plus the links to paste for the SSRF test.
// Used by write-security-test-kit.ts (no database needed) and by seed-demo-submissions.ts.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SECURITY_LINKS, SECURITY_SAMPLES } from "./security-samples";

export const DEFAULT_KIT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "test-kit");
export const DEMO_LEARNER_EMAIL = "hocvien.demo@codi.vn";

function readme() {
  const rows = SECURITY_SAMPLES.map((s) => `| \`${s.file}\` | ${s.expect} | ${s.note} |`).join("\n");
  const links = SECURITY_LINKS.map((l) => `| \`${l.url}\` | ${l.expect} |`).join("\n");
  return `# Bộ tệp thử bảo mật (demo)

Tạo tự động bởi \`backend/scripts/demo-content/write-security-test-kit.ts\`; không commit thư mục này.
Mọi "mã độc" ở đây đều vô hại (app.alert, tham chiếu calc.exe không chạy, tệp ghi chú, phần đầu MZ giả).

Đăng nhập học viên demo \`${DEMO_LEARNER_EMAIL}\` (mật khẩu mẫu chung của dữ liệu seed), mở khoá
"course-demo-js-full", vào bài tập 481 / 484 / 491 và nộp từng tệp.

## Tệp

| Tệp | Hệ thống phải | Ghi chú |
|---|---|---|
${rows}

- **chặn khi nộp**: bước xác nhận tải lên báo "Tệp bị chặn vì lý do bảo mật: …" và tệp không được lưu.
- **nộp được, AI cảnh báo Nghi chèn lệnh**: nộp thành công; giảng viên mở /teach/grading, bấm "AI gợi ý điểm và
  nhận xét", khối "Kiểm tra bảo mật" hiện màu vàng với lý do và đoạn trích; AI được dặn không cộng điểm vì đoạn đó.
- **an toàn**: khối "Kiểm tra bảo mật" màu xanh.

## Đường dẫn (ô "Đường dẫn bài làm")

| Đường dẫn | Kết quả mong đợi |
|---|---|
${links}

Đường dẫn bị chặn vẫn nộp được (hệ thống không tải chúng lúc nộp); khi giảng viên yêu cầu AI gợi ý, khối
"Kiểm tra bảo mật" hiện màu đỏ "bị chặn" và AI không đọc đường dẫn đó.
`;
}

/** Writes every sample and the README into `dir`; returns the written file names. */
export function writeSecurityTestKit(dir = DEFAULT_KIT_DIR): string[] {
  mkdirSync(dir, { recursive: true });
  for (const sample of SECURITY_SAMPLES) writeFileSync(path.join(dir, sample.file), sample.bytes());
  writeFileSync(path.join(dir, "README.md"), readme(), "utf8");
  writeFileSync(path.join(dir, "links.txt"), `${SECURITY_LINKS.map((l) => l.url).join("\n")}\n`, "utf8");
  return [...SECURITY_SAMPLES.map((s) => s.file), "README.md", "links.txt"];
}
