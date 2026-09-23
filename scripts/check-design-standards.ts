import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

interface Issue {
  file: string;
  line: number;
  category: "HARDCODED_COLOR" | "RAW_SVG" | "RAW_CARD" | "HARDCODED_URL";
  message: string;
  matched: string;
}

// Allowed exceptions (e.g. brand colors and official brand logos like Google / GitHub)
const ALLOWED_EXCEPTIONS = [
  "google-button.tsx", // Google official brand colors and SVG logo
  "github-button.tsx", // GitHub official brand SVG logo
];

// Patterns for hardcoded primitive Tailwind colors that violate design tokens
const PRIMITIVE_COLOR_REGEX =
  /\b(?:bg|text|border|ring)-(?:slate|zinc|neutral|stone|gray|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/g;

// Suggestions mapping for common color violations
const TOKEN_SUGGESTIONS: Record<string, string> = {
  "text-red-": "text-destructive",
  "bg-red-": "bg-destructive",
  "text-blue-": "text-primary",
  "bg-blue-": "bg-primary/10",
  "text-emerald-": "text-primary (or semantic token)",
  "bg-emerald-": "bg-primary/10",
  "border-slate-": "border-border",
  "bg-slate-": "bg-muted or bg-card",
};

function scanDir(dir: string, issues: Issue[]) {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === ".next" ||
        entry === ".git" ||
        entry === "dist" ||
        entry === "build"
      ) {
        continue;
      }
      scanDir(fullPath, issues);
    } else if (stat.isFile() && (entry.endsWith(".tsx") || entry.endsWith(".ts"))) {
      if (ALLOWED_EXCEPTIONS.some((exc) => fullPath.includes(exc))) {
        continue;
      }
      checkFile(fullPath, issues);
    }
  }
}

function checkFile(filePath: string, issues: Issue[]) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // 1. Check for hardcoded primitive Tailwind colors
    let match: RegExpExecArray | null;
    PRIMITIVE_COLOR_REGEX.lastIndex = 0;
    while ((match = PRIMITIVE_COLOR_REGEX.exec(line)) !== null) {
      const matched = match[0];
      let suggestion = "Use semantic design token (e.g. text-destructive, bg-primary, border-border)";
      for (const [pattern, rec] of Object.entries(TOKEN_SUGGESTIONS)) {
        if (matched.includes(pattern)) {
          suggestion = `Replace with '${rec}'`;
          break;
        }
      }

      issues.push({
        file: filePath,
        line: lineNum,
        category: "HARDCODED_COLOR",
        message: `Found primitive color '${matched}'. ${suggestion}`,
        matched,
      });
    }

    // 2. Check for inline raw SVG (pages/components should prefer lucide-react)
    if (line.includes("<svg") && !filePath.includes("ui") && !filePath.includes("google")) {
      issues.push({
        file: filePath,
        line: lineNum,
        category: "RAW_SVG",
        message: "Found inline <svg>. Consider importing an icon from 'lucide-react'.",
        matched: "<svg",
      });
    }

    // 3. Check for raw card container instead of <Card> component
    if (
      (line.includes("bg-card border rounded-") || line.includes("bg-card border shadow-")) &&
      !filePath.includes("card.tsx")
    ) {
      issues.push({
        file: filePath,
        line: lineNum,
        category: "RAW_CARD",
        message: "Found raw card container div. Use '<Card>' from '@codi-1/ui/components/card'.",
        matched: line.trim(),
      });
    }

    // 4. Check for hardcoded localhost URLs in app components
    if (
      line.includes("http://localhost:") &&
      !filePath.includes(".env") &&
      !filePath.includes("test") &&
      !filePath.includes("sync-vercel-env")
    ) {
      issues.push({
        file: filePath,
        line: lineNum,
        category: "HARDCODED_URL",
        message: "Hardcoded localhost URL. Use dynamic baseURL or environment variables.",
        matched: line.trim(),
      });
    }
  });
}

function run() {
  console.log("🔍 Running Code Standards & Design Token Audit...\n");

  const issues: Issue[] = [];
  scanDir(join(process.cwd(), "apps", "web", "src"), issues);

  if (issues.length === 0) {
    console.log("✅ Audit Passed! 0 violations found.");
    console.log("   - All components use semantic design tokens.");
    console.log("   - No hardcoded primitive colors.");
    console.log("   - No raw card containers or inline SVGs.");
    process.exit(0);
  }

  console.error(`❌ Found ${issues.length} design standard violation(s):\n`);

  for (const issue of issues) {
    const relPath = relative(process.cwd(), issue.file);
    console.error(`  [${issue.category}] ${relPath}:${issue.line}`);
    console.error(`  ↳ ${issue.message}\n`);
  }

  process.exit(1);
}

run();
