// Writes the hand-upload security test kit (safe and malicious sample files + README + links) without touching any
// database or storage.
//   npx tsx scripts/demo-content/write-security-test-kit.ts [outDir]   (default scripts/demo-content/test-kit)
import path from "node:path";
import { DEFAULT_KIT_DIR, writeSecurityTestKit } from "./security-test-kit";

const dir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_KIT_DIR;
const files = writeSecurityTestKit(dir);
console.log(`security test kit: ${files.length} files in ${dir}`);
