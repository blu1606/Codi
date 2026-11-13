import { describe, expect, it } from "vitest";
import { csvToQuizText, parseCsv, QUIZ_CSV_SAMPLE } from "./quiz-csv";
import { parseQuizImport } from "./quiz-import";

const importCsv = (csv) => parseQuizImport(csvToQuizText(csv), { termSeparator: "tab" });

describe("parseCsv", () => {
  it("keeps commas, line breaks and escaped quotes inside quoted cells", () => {
    expect(parseCsv('a,"b, c","line1\nline2","say ""hi"""\r\nx,y,z,w')).toEqual([
      ["a", "b, c", "line1\nline2", 'say "hi"'],
      ["x", "y", "z", "w"],
    ]);
  });

  it("detects a semicolon delimiter and strips the BOM", () => {
    expect(parseCsv("\uFEFFcau_hoi;A;B\nQ;1,5;2")).toEqual([["cau_hoi", "A", "B"], ["Q", "1,5", "2"]]);
  });

  it("treats a quote in the middle of an unquoted cell as text", () => {
    expect(parseCsv('5" screen,b')).toEqual([['5" screen', "b"]]);
  });
});

describe("csvToQuizText + parseQuizImport", () => {
  it("skips the header row and reads letter answers with an explanation", () => {
    const items = importCsv("cau_hoi,phuong_an_A,phuong_an_B,phuong_an_C,dap_an,giai_thich\nThủ đô?,Huế,Hà Nội,Đà Nẵng,b,Vì vậy.");
    expect(items).toHaveLength(1);
    expect(items[0].errors).toEqual([]);
    expect(items[0].draft).toEqual({ text: "Thủ đô?", options: ["Huế", "Hà Nội", "Đà Nẵng"], correctIndex: 1, explanation: "Vì vậy." });
  });

  it("recognises Vietnamese and English header names", () => {
    expect(csvToQuizText("Câu hỏi,A,B,Đáp án\nQ,x,y,A")).toBe("Q\tx\ty\tA");
    expect(csvToQuizText("question,A,B,answer\nQ,x,y,A")).toBe("Q\tx\ty\tA");
  });

  it("keeps a quoted comma inside an option", () => {
    const [item] = importCsv('Chọn đúng?,"1, 2 và 3",4,A');
    expect(item.errors).toEqual([]);
    expect(item.draft.options).toEqual(["1, 2 và 3", "4"]);
  });

  it("flattens a quoted line break into one question line", () => {
    const [item] = importCsv('"Dòng một\nDòng hai",x,y,2');
    expect(item.draft.text).toBe("Dòng một Dòng hai");
    expect(item.draft.correctIndex).toBe(1);
  });

  it("unescapes doubled quotes", () => {
    const [item] = importCsv('"Từ khoá ""const"" làm gì?",Hằng,Biến,A');
    expect(item.draft.text).toBe('Từ khoá "const" làm gì?');
  });

  it("parses a semicolon-separated file with a BOM", () => {
    const items = importCsv("\uFEFFcau_hoi;phuong_an_A;phuong_an_B;dap_an\r\nQ1;x;y;B\r\nQ2;p;q;1\r\n");
    expect(items.map((x) => [x.draft.text, x.draft.correctIndex, x.errors.length])).toEqual([["Q1", 1, 0], ["Q2", 0, 0]]);
  });

  it("reads a 1-based numeric answer and drops unused option columns", () => {
    const [item] = importCsv("cau_hoi,phuong_an_A,phuong_an_B,phuong_an_C,phuong_an_D,phuong_an_E,phuong_an_F,dap_an,giai_thich\nQ,x,y,z,,,,3,Giải thích");
    expect(item.errors).toEqual([]);
    expect(item.draft).toEqual({ text: "Q", options: ["x", "y", "z"], correctIndex: 2, explanation: "Giải thích" });
  });

  it("skips blank rows", () => {
    expect(importCsv("Q1,x,y,A\n\n,,,\nQ2,x,y,B")).toHaveLength(2);
  });

  it("surfaces a validation error when the answer is missing", () => {
    const [item] = importCsv("cau_hoi,phuong_an_A,phuong_an_B,phuong_an_C,dap_an\nQ,x,y,z,");
    expect(item.errors.length).toBeGreaterThan(0);
    expect(item.errors.join(" ")).toMatch(/Đáp án "z" không khớp|Chưa có đáp án đúng/);
  });

  it("produces only valid questions from the downloadable sample", () => {
    const items = importCsv(QUIZ_CSV_SAMPLE);
    expect(items).toHaveLength(3);
    expect(items.every((x) => x.errors.length === 0)).toBe(true);
  });
});
