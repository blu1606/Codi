import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Đọc và parse dữ liệu kiểm thử từ file JSON fixture.
 * @param filename Tên file fixture nằm trong thư mục fixtures (ví dụ: 'course-discovery-catalog.json')
 */
export function loadTestData<T>(filename: string): T {
  const filePath = path.isAbsolute(filename)
    ? filename
    : path.resolve(currentDir, "fixtures", filename);

  const rawContent = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(rawContent) as T;
}
