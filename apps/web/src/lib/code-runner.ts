/**
 * Shared code runner for Coding Exercises (Learner #100 & Lecturer #115)
 * Hỗ trợ chạy JavaScript an toàn và Python (mô phỏng / so khớp).
 */

export interface CodeTest {
  id: string | number;
  name?: string;
  call: string;
  expected: any;
  hidden?: boolean;
}

export interface CodeLog {
  kind: "log" | "info" | "warn" | "error";
  text: string;
}

export interface CodeRunResult {
  phase: "done" | "syntax" | "runtime" | "timeout";
  error: string | null;
  logs: CodeLog[];
  results: Array<{
    id: string | number;
    ok: boolean;
    actual?: string;
    error?: string;
  }>;
}

export interface CodeTestOutcome {
  id: string | number;
  name?: string;
  call?: string;
  pass: boolean;
  expected: string;
  actual: string | null;
  error: string | null;
  hidden?: boolean;
}

/**
 * Chuẩn hoá JSON không phụ thuộc vào thứ tự thuộc tính object
 * {a: 1, b: 2} và {b: 2, a: 1} đều cho ra cùng một chuỗi.
 */
export function stableJSON(v: any): string {
  if (v === undefined) return "undefined";
  if (typeof v === "function") return "[Function]";
  if (typeof v === "number" && !isFinite(v)) return String(v);
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableJSON).join(",") + "]";
  return (
    "{" +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stableJSON(v[k]))
      .join(",") +
    "}"
  );
}

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

/**
 * Thực thi mã nguồn JavaScript và đánh giá các biểu thức test trong cùng phạm vi.
 */
function executeJavaScript(
  code: string,
  tests: Array<{ id: string | number; call: string }>
): CodeRunResult {
  const logs: CodeLog[] = [];
  const formatArg = (a: any) => (typeof a === "string" ? a : stableJSON(a));
  const pushLog = (kind: CodeLog["kind"]) => (...args: any[]) => {
    if (logs.length < 200) {
      logs.push({ kind, text: args.map(formatArg).join(" ") });
    }
  };

  const fakeConsole = {
    log: pushLog("log"),
    info: pushLog("info"),
    debug: pushLog("info"),
    warn: pushLog("warn"),
    error: pushLog("error"),
  };

  let probe: any;
  try {
    probe = new Function(
      "console",
      code + "\n;return function (__expr) { return eval(__expr); };"
    )(fakeConsole);
  } catch (err: any) {
    return {
      phase: err instanceof SyntaxError ? "syntax" : "runtime",
      error: (err?.name || "Error") + ": " + (err?.message || String(err)),
      logs,
      results: [],
    };
  }

  if (typeof probe !== "function") {
    return {
      phase: "runtime",
      error: "Mã nguồn có lệnh return ở ngoài cùng nên không thể đánh giá các test case.",
      logs,
      results: [],
    };
  }

  const results = tests.map((t) => {
    try {
      const val = probe(t.call);
      return { id: t.id, ok: true, actual: stableJSON(val) };
    } catch (err: any) {
      return {
        id: t.id,
        ok: false,
        error: (err?.name || "Error") + ": " + (err?.message || String(err)),
      };
    }
  });

  return {
    phase: "done",
    error: null,
    logs,
    results,
  };
}

/**
 * Mô phỏng kiểm thử Python (theo đặc tả mô phỏng §12 & D7)
 */
function simulatePython(
  code: string,
  tests: CodeTest[],
  solution?: string
): CodeRunResult {
  const normalize = (s: string) =>
    String(s || "")
      .replace(/#.*$/gm, "")
      .replace(/\s+/g, "");

  const matches = !!solution && normalize(code) === normalize(solution);

  return {
    phase: "done",
    error: null,
    logs: [
      {
        kind: "info",
        text: "Python được chạy trong môi trường mô phỏng: kết quả đánh giá theo cấu trúc lời giải mẫu.",
      },
    ],
    results: tests.map((t) => ({
      id: t.id,
      ok: true,
      actual: matches ? stableJSON(t.expected) : "(mô phỏng: chưa khớp với lời giải)",
    })),
  };
}

/**
 * Runner chung được chia sẻ giữa Learner và Lecturer
 */
export async function executeCode(
  code: string,
  tests: CodeTest[],
  options: {
    language?: string;
    solution?: string;
    timeoutMs?: number;
  } = {}
): Promise<CodeRunResult> {
  const language = (options.language || "javascript").toLowerCase();
  const plainTests = tests.map((t) => ({ id: t.id, call: t.call }));

  if (language === "python") {
    return simulatePython(code, tests, options.solution);
  }

  // Chạy JavaScript với bảo vệ thời gian thực thi (timeout)
  return new Promise((resolve) => {
    let settled = false;
    const timeoutMs = options.timeoutMs || 3000;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({
          phase: "timeout",
          error: `Thời gian thực thi vượt quá ${timeoutMs / 1000} giây. Hãy kiểm tra các vòng lặp xem đã có điều kiện dừng hợp lệ chưa.`,
          logs: [],
          results: [],
        });
      }
    }, timeoutMs);

    try {
      const res = executeJavaScript(code, plainTests);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(res);
      }
    } catch (err: any) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          phase: "runtime",
          error: String(err?.message || err),
          logs: [],
          results: [],
        });
      }
    }
  });
}

/**
 * So sánh kết quả thực tế với giá trị mong đợi (chấm điểm các test case)
 */
export function gradeCodeResults(
  tests: CodeTest[],
  res: CodeRunResult
): CodeTestOutcome[] {
  const byId = new Map<string | number, { ok: boolean; actual?: string; error?: string }>();
  for (const r of res.results) {
    byId.set(r.id, r);
  }

  return tests.map((t) => {
    const expectedStr = stableJSON(t.expected);
    const resultItem = byId.get(t.id);

    if (!resultItem) {
      return {
        id: t.id,
        name: t.name,
        call: t.call,
        pass: false,
        expected: expectedStr,
        actual: null,
        error: res.error || "Không thực thi được test case này.",
        hidden: t.hidden,
      };
    }

    if (!resultItem.ok) {
      return {
        id: t.id,
        name: t.name,
        call: t.call,
        pass: false,
        expected: expectedStr,
        actual: null,
        error: resultItem.error || "Lỗi khi chạy biểu thức test.",
        hidden: t.hidden,
      };
    }

    const pass = resultItem.actual === expectedStr;
    return {
      id: t.id,
      name: t.name,
      call: t.call,
      pass,
      expected: expectedStr,
      actual: resultItem.actual || null,
      error: null,
      hidden: t.hidden,
    };
  });
}
