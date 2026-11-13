/**
 * CSV support for the quiz batch-import dialog. A CSV file is converted into the dialog's tab-row text, so the
 * existing parseQuizImport preview and per-question validation run unchanged.
 *
 * Format (UTF-8, optional BOM, `,` or `;` delimiter detected from the first record, RFC 4180 quoting):
 *     cau_hoi, phuong_an_A, phuong_an_B, [phuong_an_C … phuong_an_F], dap_an, [giai_thich]
 *   - The header row is optional; it is skipped when its first cell is cau_hoi / câu hỏi / question.
 *   - dap_an is a letter A–F (any case) or a 1-based option number.
 *   - Empty option cells (e.g. unused phuong_an_E/F columns) are dropped; blank rows are skipped.
 */
export const MAX_QUIZ_CSV_BYTES = 1024 * 1024;
export const QUIZ_CSV_TOO_LARGE = 'Tệp CSV quá lớn (tối đa 1 MB). Hãy chia nhỏ tệp rồi nhập lần lượt.';
export const QUIZ_CSV_WRONG_TYPE = 'Chỉ hỗ trợ tệp .csv (UTF-8).';

const HEADER_FIRST_CELL = /^(cau_hoi|câu hỏi|cau hoi|question)$/i;

/** Picks `;` when the first record (outside quotes) has more semicolons than commas, else `,`. */
function detectDelimiter(text) {
  let commas = 0; let semicolons = 0; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch === ',') commas++;
    else if (!quoted && ch === ';') semicolons++;
  }
  return semicolons > commas ? ';' : ',';
}

/** RFC 4180 parser: returns records as arrays of raw cell strings. Strips a UTF-8 BOM; accepts CRLF, LF or CR. */
export function parseCsv(raw, delimiter) {
  const text = String(raw ?? '').replace(/^\uFEFF/, '');
  const sep = delimiter || detectDelimiter(text);
  const rows = []; let row = []; let cell = ''; let quoted = false;
  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => { endCell(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (ch === '"' && cell === '') quoted = true; // a quote only opens a quoted field at its start
    else if (ch === sep) endCell();
    else if (ch === '\r') { if (text[i + 1] === '\n') i++; endRow(); }
    else if (ch === '\n') endRow();
    else cell += ch;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

// Tabs and line breaks inside a cell would split the tab row, so they collapse to a single space.
const flatten = (cell) => cell.normalize('NFC').replace(/[\t\r\n]+/g, ' ').trim();

/** Converts CSV text into tab rows (question, options…, answer, [explanation]) for parseQuizImport. */
export function csvToQuizText(raw) {
  const rows = parseCsv(raw)
    .map((cells) => cells.map(flatten))
    .filter((cells) => cells.some((c) => c.length > 0));
  if (rows.length && HEADER_FIRST_CELL.test(rows[0][0])) rows.shift();
  return rows.map((cells) => {
    const [question, ...rest] = cells;
    // Unused option columns leave empty cells between the options and dap_an; dropping every empty cell after the
    // question keeps the remaining order (options, answer, explanation). A missing answer still fails validation.
    return [question, ...rest.filter((c) => c.length > 0)].join('\t');
  }).join('\n');
}

/** Client-side sample file offered by the dialog's "Tải file mẫu" link. */
export const QUIZ_CSV_SAMPLE = [
  'cau_hoi,phuong_an_A,phuong_an_B,phuong_an_C,phuong_an_D,dap_an,giai_thich',
  'Thủ đô của Việt Nam là gì?,Huế,Hà Nội,Đà Nẵng,TP. Hồ Chí Minh,B,Hà Nội là thủ đô từ năm 1010.',
  'Hook nào dùng để lưu state trong React?,useState,useEffect,useRef,,1,useState trả về giá trị và hàm cập nhật.',
  '"Kết quả của 0.1 + 0.2 === 0.3 trong JavaScript?",true,false,,,B,"Số thực dấu phẩy động nên tổng là 0.30000000000000004, ""==="" trả về false."',
].join('\r\n') + '\r\n';
