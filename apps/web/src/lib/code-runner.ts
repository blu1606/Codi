/**
 * Trình giải thích lỗi tiếng Việt thân thiện cho bài tập code (S23b).
 * Toàn bộ logic chạy code đã được chuyển sang QuickJS WebAssembly sandbox độc lập (@codi-1/coding-runner).
 */

/**
 * Giải thích lỗi bằng tiếng Việt tự nhiên cho người học và giảng viên.
 */
export function explainError(err: string | null): string {
  if (!err) return "";
  let m = /ReferenceError: (\S+) is not defined/.exec(err);
  if (m) return `Chưa có biến hoặc hàm "${m[1]}". Kiểm tra lại tên hàm đã được khai báo chưa.`;
  m = /TypeError: (.+) is not a function/.exec(err);
  if (m) return `"${m[1]}" không phải là hàm. Hãy kiểm tra lại tên hàm hoặc cách gọi hàm.`;
  m = /TypeError: Cannot read propert(?:y|ies) of (undefined|null)/.exec(err);
  if (m) return `Đang truy cập thuộc tính của giá trị ${m[1]}. Kiểm tra xem biến đã có dữ liệu chưa.`;
  if (/^SyntaxError/.test(err)) return "Lỗi cú pháp: kiểm tra lại các dấu ngoặc tròn, nhọn, phẩy hoặc nháy.";
  return err;
}
