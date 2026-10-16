// Small, real PDF fixture authored for this repository. No provider or learner state is simulated.
import { mkdirSync, writeFileSync } from "node:fs";
const directory = new URL("../public/dev/lesson-player/", import.meta.url);
mkdirSync(directory, { recursive: true });
const texts = ["TypeScript - Chuoi (du lieu dev)", "const name: string = 'Codi';", "Tom tat: string bieu dien van ban."];
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
for (const [index, text] of texts.entries()) {
  const page = 4 + index * 2;
  const content = `BT /F1 20 Tf 40 250 Td (${text}) Tj 0 -45 Td (Trang ${index + 1}/3 - Codi lesson player) Tj ET`;
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 340] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
}
let output = "%PDF-1.4\n";
const offsets = [0];
for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; }
const start = Buffer.byteLength(output);
output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
writeFileSync(new URL("slides.pdf", directory), output);
console.log("Prepared three-page PDF lesson fixture");
