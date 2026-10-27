import { describe, expect, it } from "vitest";
import { parseQuizImport, validateQuestionDraft } from "./quiz-import";

const errorsOf = (raw: string, options?: Parameters<typeof parseQuizImport>[1]) =>
  parseQuizImport(raw, options).map((item) => item.errors);

describe("parseQuizImport: block format", () => {
  it("reads options marked with -, A. and A) and the * correct marker", () => {
    const [q] = parseQuizImport(
      ["Thủ đô của Việt Nam?", "A. Huế", "* B. Hà Nội", "C) Đà Nẵng", "- Cần Thơ"].join("\n"),
    );
    expect(q!.errors).toEqual([]);
    expect(q!.draft).toEqual({
      text: "Thủ đô của Việt Nam?",
      options: ["Huế", "Hà Nội", "Đà Nẵng", "Cần Thơ"],
      correctIndex: 1,
      explanation: "",
    });
  });

  it("accepts a * marker before a dash option and before a plain option text", () => {
    const [q] = parseQuizImport("Hook lưu state?\n*- useState\n- useEffect");
    expect(q!.draft.options).toEqual(["useState", "useEffect"]);
    expect(q!.draft.correctIndex).toBe(0);
    expect(q!.errors).toEqual([]);
  });

  it("keeps Vietnamese words that start with an option letter as option text", () => {
    const [q] = parseQuizImport("Đâu là thủ đô?\n* Ba Đình\n- Ab initio");
    expect(q!.draft.options).toEqual(["Ba Đình", "Ab initio"]);
    expect(q!.errors).toEqual([]);
  });

  it("reads the Giải thích line and joins continuation lines into the explanation", () => {
    const [q] = parseQuizImport(
      ["Props là gì?", "A. State", "* B. Dữ liệu từ cha", "Giải thích: Props được truyền", "từ component cha xuống."].join("\n"),
    );
    expect(q!.draft.explanation).toBe("Props được truyền từ component cha xuống.");
    expect(q!.draft.correctIndex).toBe(1);
    expect(q!.errors).toEqual([]);
  });

  it("splits questions on blank lines, including lines that only hold spaces", () => {
    const items = parseQuizImport(
      ["Q một?", "* A. Có", "- Không", "", "   ", "\n", "Q hai?", "A. X", "* B. Y"].join("\n"),
    );
    expect(items.map((item) => item.draft.text)).toEqual(["Q một?", "Q hai?"]);
    expect(items.map((item) => item.index)).toEqual([1, 2]);
    expect(items.every((item) => item.errors.length === 0)).toBe(true);
  });

  it("handles CRLF line endings from Windows", () => {
    const items = parseQuizImport("Câu A?\r\n* A. Đúng\r\n- Sai\r\n\r\nCâu B?\r\nA. Đúng\r\n* B. Sai\r\n");
    expect(items).toHaveLength(2);
    expect(items[0]!.draft).toMatchObject({ text: "Câu A?", options: ["Đúng", "Sai"], correctIndex: 0 });
    expect(items[1]!.draft).toMatchObject({ text: "Câu B?", correctIndex: 1 });
    expect(items.every((item) => item.errors.length === 0)).toBe(true);
  });

  it("normalises decomposed Vietnamese diacritics, non-breaking spaces and a BOM", () => {
    // "Về tàu" written with combining marks (e + circumflex + grave, a + grave)
    const decomposed = "V" + "ề" + " t" + "à" + "u";
    const [q] = parseQuizImport(`﻿${decomposed}?\n* A. Có\n- Không`);
    expect(q!.draft.text).toBe("Về tàu?");
    expect(q!.draft.options).toEqual(["Có", "Không"]);
    expect(q!.errors).toEqual([]);
  });

  it("strips a leading question number such as Câu 1: or 2.", () => {
    const items = parseQuizImport("Câu 1: Hàm nào trả về số?\n* A. len\n- B. print\n\n2. Kiểu nào là số nguyên?\n* A. int\n- B. str");
    expect(items.map((item) => item.draft.text)).toEqual(["Hàm nào trả về số?", "Kiểu nào là số nguyên?"]);
  });

  it("does not strip decimals that start a question", () => {
    const [q] = parseQuizImport("2.5 giây bằng bao nhiêu ms?\n* A. 2500\n- B. 25");
    expect(q!.draft.text).toBe("2.5 giây bằng bao nhiêu ms?");
  });

  it("joins a multi-line question before the options", () => {
    const [q] = parseQuizImport("Đoạn code sau in ra gì\n`print(1)`?\n* A. 1\n- B. 2");
    expect(q!.draft.text).toBe("Đoạn code sau in ra gì `print(1)`?");
    expect(q!.errors).toEqual([]);
  });

  it("reports a question without a correct marker", () => {
    const [q] = parseQuizImport("Câu thiếu đáp án?\nA. Một\nB. Hai");
    expect(q!.draft.correctIndex).toBe(-1);
    expect(q!.errors).toEqual([expect.stringContaining("Chưa có đáp án đúng")]);
  });

  it("reports more than one marked correct option", () => {
    const [q] = parseQuizImport("Hai đáp án?\n* A. Một\n* B. Hai");
    expect(q!.errors).toEqual([expect.stringContaining("nhiều hơn một đáp án")]);
  });

  it("reports a question with a single option", () => {
    const [q] = parseQuizImport("Chỉ một lựa chọn?\n* A. Duy nhất");
    expect(q!.errors).toEqual([expect.stringContaining("Cần ít nhất 2 phương án")]);
  });

  it("reports more options than the builder allows", () => {
    const lines = ["Quá nhiều?", "* A. 1", "- 2", "- 3", "- 4", "- 5", "- 6", "- 7"];
    const [q] = parseQuizImport(lines.join("\n"));
    expect(q!.draft.options).toHaveLength(7);
    expect(q!.errors).toEqual([expect.stringContaining("Tối đa 6 phương án")]);
    expect(parseQuizImport(lines.join("\n"), { maxOptions: 7 })[0]!.errors).toEqual([]);
  });

  it("reports an empty question text in a tab row", () => {
    const [q] = parseQuizImport("\tA1\tA2\tA");
    expect(q!.errors).toEqual([expect.stringContaining("Thiếu nội dung câu hỏi")]);
  });

  it("reports an empty option marker", () => {
    const [q] = parseQuizImport("Có phương án trống?\n* A.\n- B. Khác");
    expect(q!.errors).toEqual(expect.arrayContaining([expect.stringContaining("Có phương án còn trống")]));
  });

  it("reports an unrecognised line after the options", () => {
    const [q] = parseQuizImport("Dòng lạ?\n* A. Một\n- B. Hai\nkhông có dấu đầu dòng");
    expect(q!.errors).toEqual([expect.stringContaining("Dòng không nhận dạng")]);
  });

  it("returns no items for blank input", () => {
    expect(parseQuizImport("")).toEqual([]);
    expect(parseQuizImport("  \n\n \t \n")).toEqual([]);
  });
});

describe("parseQuizImport: semicolon between questions", () => {
  it("splits questions on ; when that separator is chosen", () => {
    const items = parseQuizImport("Q1?\n* A. a\n- B. b;Q2?\n- A. c\n* B. d", { questionSeparator: "semicolon" });
    expect(items.map((item) => item.draft.text)).toEqual(["Q1?", "Q2?"]);
    expect(items[1]!.draft).toMatchObject({ options: ["c", "d"], correctIndex: 1 });
    expect(items.every((item) => item.errors.length === 0)).toBe(true);
  });

  it("does not split on ; when the blank-line separator is chosen", () => {
    const items = parseQuizImport("Q1?\n* A. a\n- B. b;Q2?\n- A. c\n* B. d", { questionSeparator: "blank" });
    expect(items).toHaveLength(1);
  });
});

describe("parseQuizImport: tab rows from a spreadsheet", () => {
  it("reads a row with the answer letter and no explanation", () => {
    const [q] = parseQuizImport("Hook lưu state?\tuseState\tuseEffect\tA");
    expect(q!.draft).toEqual({ text: "Hook lưu state?", options: ["useState", "useEffect"], correctIndex: 0, explanation: "" });
    expect(q!.errors).toEqual([]);
  });

  it("accepts a lowercase letter, a letter with a dot, and a 1-based index", () => {
    const items = parseQuizImport(["Q1\ta\tb\tb", "Q2\ta\tb\tB.", "Q3\ta\tb\t2"].join("\n"));
    expect(items.map((item) => item.draft.correctIndex)).toEqual([1, 1, 1]);
    expect(items.every((item) => item.errors.length === 0)).toBe(true);
  });

  it("reads a row with four options and a 1-based index, without explanation", () => {
    const [q] = parseQuizImport("Props là gì?\tTrạng thái\tDữ liệu từ cha\tHàm sự kiện\tBiến\t2");
    expect(q!.draft.options).toEqual(["Trạng thái", "Dữ liệu từ cha", "Hàm sự kiện", "Biến"]);
    expect(q!.draft.correctIndex).toBe(1);
    expect(q!.draft.explanation).toBe("");
  });

  it("reads the explanation column when it follows the answer", () => {
    const [q] = parseQuizImport("Props là gì?\tTrạng thái\tDữ liệu từ cha\tB\tProps do cha truyền xuống");
    expect(q!.draft).toEqual({
      text: "Props là gì?",
      options: ["Trạng thái", "Dữ liệu từ cha"],
      correctIndex: 1,
      explanation: "Props do cha truyền xuống",
    });
    expect(q!.errors).toEqual([]);
  });

  it("reads the explanation when there are three options", () => {
    const [q] = parseQuizImport("Đâu là kiểu số?\tstring\tbool\tint\t3\tint là số nguyên");
    expect(q!.draft.options).toEqual(["string", "bool", "int"]);
    expect(q!.draft.correctIndex).toBe(2);
    expect(q!.draft.explanation).toBe("int là số nguyên");
  });

  it("ignores trailing empty cells that spreadsheets add", () => {
    const [q] = parseQuizImport("Q?\tA1\tA2\tB\t\t\t");
    expect(q!.draft).toEqual({ text: "Q?", options: ["A1", "A2"], correctIndex: 1, explanation: "" });
    expect(q!.errors).toEqual([]);
  });

  it("reads Vietnamese cells and a CRLF paste with several rows", () => {
    const items = parseQuizImport(
      "Thủ đô Việt Nam?\tHuế\tHà Nội\tB\r\n\r\nSông dài nhất?\tSông Hồng\tSông Mê Kông\tSông Đà\t2\tSông Mê Kông dài khoảng 4.350 km\r\n",
    );
    expect(items).toHaveLength(2);
    expect(items[0]!.draft).toMatchObject({ text: "Thủ đô Việt Nam?", options: ["Huế", "Hà Nội"], correctIndex: 1 });
    expect(items[1]!.draft).toMatchObject({ correctIndex: 1, explanation: "Sông Mê Kông dài khoảng 4.350 km" });
    expect(items.every((item) => item.errors.length === 0)).toBe(true);
  });

  it("reports an answer cell that matches no option", () => {
    const [q] = parseQuizImport("Q?\tA1\tA2\tE");
    expect(q!.draft.correctIndex).toBe(-1);
    expect(q!.errors).toEqual(expect.arrayContaining([expect.stringContaining('Đáp án "E" không khớp')]));
  });

  it("reports an index outside the option range", () => {
    const [q] = parseQuizImport("Q?\tA1\tA2\t5");
    expect(q!.errors).toEqual(expect.arrayContaining([expect.stringContaining('Đáp án "5" không khớp')]));
  });

  it("reports a row that is too short to hold options and an answer", () => {
    const [q] = parseQuizImport("Chỉ có câu hỏi\tMột phương án");
    expect(q!.errors[0]).toContain("Dòng cần có câu hỏi");
  });

  it("reports an empty option inside the row", () => {
    const [q] = parseQuizImport("Q?\tA1\t\tC\tA");
    expect(q!.errors).toEqual([expect.stringContaining("Có phương án còn trống")]);
  });

  it("splits rows on ; when that separator is chosen", () => {
    const items = parseQuizImport("Q1\ta\tb\tA;Q2\tc\td\tB", { questionSeparator: "semicolon" });
    expect(items.map((item) => item.draft.text)).toEqual(["Q1", "Q2"]);
    expect(items.map((item) => item.draft.correctIndex)).toEqual([0, 1]);
  });

  it("treats every line as a row when the tab separator is forced", () => {
    const items = parseQuizImport("Không có tab ở đây\n", { termSeparator: "tab" });
    expect(items[0]!.errors.length).toBeGreaterThan(0);
  });

  it("does not read tab rows when the block format is forced", () => {
    const [q] = parseQuizImport("Q?\tA1\tA2\tB", { termSeparator: "line" });
    expect(q!.draft.text).toBe("Q?\tA1\tA2\tB");
    expect(q!.errors).toEqual(expect.arrayContaining([expect.stringContaining("Chưa có đáp án đúng")]));
  });

  it("numbers items in order across both formats", () => {
    const items = parseQuizImport("Block?\n* A. a\n- B. b\n\nRow?\tx\ty\tA");
    expect(items.map((item) => item.index)).toEqual([1, 2]);
  });
});

describe("validateQuestionDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateQuestionDraft({ text: "Q?", options: ["a", "b"], correctIndex: 1 })).toEqual([]);
  });

  it("flags every rule the builder enforces", () => {
    const errors = validateQuestionDraft({ text: "  ", options: ["a", " ", "c", "d", "e", "f", "g"], correctIndex: 1 }, 6);
    expect(errors).toEqual([
      "Thiếu nội dung câu hỏi.",
      "Tối đa 6 phương án mỗi câu.",
      "Có phương án còn trống.",
      expect.stringContaining("Chưa có đáp án đúng"),
    ]);
  });

  it("flags a correct index that points at an empty option", () => {
    expect(validateQuestionDraft({ text: "Q", options: ["a", ""], correctIndex: 1 })).toEqual([
      "Cần ít nhất 2 phương án.",
      "Có phương án còn trống.",
      expect.stringContaining("Chưa có đáp án đúng"),
    ]);
  });
});
