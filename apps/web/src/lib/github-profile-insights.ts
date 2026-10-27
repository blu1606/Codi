import type { GithubProfileProjection } from "./github-profile-analysis-contract";
import { GITHUB_USAGE_LABELS } from "./github-profile-analysis-contract";

/** Month boundaries and "last 12 months" are read in the learner's timezone. */
export const GITHUB_INSIGHT_TIME_ZONE = "Asia/Bangkok";

/** Test tooling named by the dependency map; used only for an evidence-scoped absence note. */
const TEST_TOOLS = ["Vitest", "Jest", "Playwright"] as const;
const RECENT_WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;

type Projection = GithubProfileProjection;
type Technology = Projection["technologies"][number];
type Repository = Projection["limitations"]["repositories"][number];

export interface LanguageShare {
  name: string;
  bytes: number;
  /** Share of the positive observed language bytes, 0-100. Not a proficiency measure. */
  share: number;
  repositoryCount: number;
  repositoryIds: number[];
}

/** Positive observed language bytes only, largest share first. Shares sum to 100 when any exist. */
export function languageShares(profile: Projection): LanguageShare[] {
  const rows = profile.technologies.flatMap((technology) =>
    technology.observations
      .filter(
        (item) =>
          item.kind === "language" &&
          item.signal === "language_bytes" &&
          Number.isFinite(item.languageBytes) &&
          (item.languageBytes ?? 0) > 0,
      )
      .map((item) => ({
        name: item.technology,
        bytes: item.languageBytes!,
        repositoryIds: [...item.repositoryIds],
      })),
  );
  const total = rows.reduce((sum, row) => sum + row.bytes, 0);
  if (!total) return [];
  return rows
    .map((row) => ({
      name: row.name,
      bytes: row.bytes,
      share: (row.bytes / total) * 100,
      repositoryCount: row.repositoryIds.length,
      repositoryIds: row.repositoryIds,
    }))
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name, "en"));
}

export interface TechnologyRow {
  technologyId: string;
  name: string;
  kind: "language" | "framework" | "tool";
  repositoryCount: number;
  repositoryIds: number[];
  usage: Technology["usage"];
  usageSource: Technology["usageSource"];
  learnerEdited: boolean;
  confidence: "low" | "medium" | "high" | null;
  usageLabel: string;
}

const USAGE_RANK = { deep: 3, regular: 2, tried: 1 } as const;

export function technologyRows(profile: Projection): TechnologyRow[] {
  return profile.technologies
    .filter((technology) => technology.observations.length > 0)
    .map((technology) => {
      const first = technology.observations[0]!;
      const repositoryIds = [
        ...new Set(technology.observations.flatMap((item) => item.repositoryIds)),
      ].sort((a, b) => a - b);
      return {
        technologyId: technology.technologyId,
        name: first.technology,
        kind: first.kind,
        repositoryCount: repositoryIds.length,
        repositoryIds,
        usage: technology.usage,
        usageSource: technology.usageSource,
        learnerEdited: technology.learnerEdited,
        confidence: technology.inference?.confidence ?? null,
        usageLabel: technology.usage
          ? GITHUB_USAGE_LABELS[technology.usage]
          : "Chưa đủ bằng chứng về mức dùng",
      };
    })
    .sort(
      (a, b) =>
        (b.usage ? USAGE_RANK[b.usage] : 0) - (a.usage ? USAGE_RANK[a.usage] : 0) ||
        b.repositoryCount - a.repositoryCount ||
        a.name.localeCompare(b.name, "en"),
    );
}

export interface MonthlyPushActivity {
  /** Year-month key in GITHUB_INSIGHT_TIME_ZONE, e.g. "2026-10". */
  key: string;
  month: number;
  year: number;
  count: number;
}

export interface PushActivity {
  months: MonthlyPushActivity[];
  /** Selected repositories whose last push is after the window (cannot be placed). */
  outsideWindow: number;
  /** Selected repositories without a parseable last-push time. */
  undated: number;
}

function zonedYearMonth(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GITHUB_INSIGHT_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return { year, month };
}

/**
 * Counts selected repositories by the month of their last push over the `months` months ending
 * at the analysis month. The reference is the analysis time, so output is deterministic for a stored profile.
 */
export function monthlyPushActivity(
  profile: Projection,
  months = 12,
): PushActivity {
  const reference = zonedYearMonth(new Date(profile.collectedAt));
  const buckets: MonthlyPushActivity[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const index = reference.year * 12 + (reference.month - 1) - offset;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    buckets.push({
      key: `${year}-${String(month).padStart(2, "0")}`,
      year,
      month,
      count: 0,
    });
  }
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  let outsideWindow = 0;
  let undated = 0;
  for (const repo of selectedRepositories(profile)) {
    const pushed = repo.pushedAt ? new Date(repo.pushedAt) : null;
    if (!pushed || Number.isNaN(pushed.valueOf())) {
      undated += 1;
      continue;
    }
    const zoned = zonedYearMonth(pushed);
    const bucket = byKey.get(
      `${zoned.year}-${String(zoned.month).padStart(2, "0")}`,
    );
    if (bucket) bucket.count += 1;
    else outsideWindow += 1;
  }
  return { months: buckets, outsideWindow, undated };
}

export function selectedRepositories(profile: Projection): Repository[] {
  return profile.limitations.repositories.filter(
    (repo) => repo.disposition === "selected" && !repo.excluded,
  );
}

export function repositoryLabel(repo: Pick<Repository, "owner" | "name" | "id">) {
  return repo.owner && repo.name ? `${repo.owner}/${repo.name}` : `Repo #${repo.id}`;
}

/** Whole days from a push time to the analysis time; null when either time is unknown. */
export function daysBeforeAnalysis(
  pushedAt: string | null,
  analysedAt: string,
): number | null {
  const pushed = pushedAt ? Date.parse(pushedAt) : NaN;
  const analysed = Date.parse(analysedAt);
  if (!Number.isFinite(pushed) || !Number.isFinite(analysed)) return null;
  return Math.max(0, Math.floor((analysed - pushed) / DAY_MS));
}

/** Whole days from the latest selected push to analysis; null when no push time is known. */
export function daysSinceLastPush(profile: Projection): number | null {
  const days = selectedRepositories(profile)
    .map((repo) => daysBeforeAnalysis(repo.pushedAt, profile.collectedAt))
    .filter((value): value is number => value !== null);
  return days.length ? Math.min(...days) : null;
}

export function relativeDaysLabel(days: number | null): string {
  if (days === null) return "Chưa rõ";
  if (days === 0) return "Hôm nay";
  if (days < 60) return `${days} ngày trước`;
  return `${Math.floor(days / 30)} tháng trước`;
}

export interface GithubInsight {
  id: string;
  text: string;
  /** Human-readable basis, shown beside the sentence so each claim can be traced. */
  basis: string[];
}

function repoNames(profile: Projection, ids: number[]) {
  const byId = new Map(profile.limitations.repositories.map((repo) => [repo.id, repo]));
  return ids
    .map((id) => byId.get(id))
    .filter((repo): repo is Repository => repo !== undefined)
    .map(repositoryLabel);
}

/**
 * Deterministic sentences computed from the projection only. Usage levels appear only when a
 * validated analysis supplied them; absence of evidence is never phrased as weakness.
 */
export function githubInsights(profile: Projection): GithubInsight[] {
  const insights: GithubInsight[] = [];
  const languages = languageShares(profile);
  const rows = technologyRows(profile);
  const frameworks = rows.filter((row) => row.kind === "framework");
  const tools = rows.filter((row) => row.kind === "tool");

  const main = languages[0];
  if (main) {
    const concentrated = main.share >= 70;
    insights.push({
      id: "main-language",
      text: `${main.name} chiếm ${formatShare(main.share)}% lượng code theo GitHub${concentrated ? ", code của bạn tập trung chủ yếu vào ngôn ngữ này" : ""}. Đây không phải mức thành thạo.`,
      basis: [
        `Tỉ lệ code GitHub ghi nhận · ${main.repositoryCount} repo`,
        ...repoNames(profile, main.repositoryIds),
      ],
    });
  }

  if (main && languages.length >= 3) {
    insights.push({
      id: "breadth",
      text: `Bạn dùng ${languages.length} ngôn ngữ trên các repo đã phân tích, ${main.name} là trọng tâm. Đào sâu một hướng sẽ giúp kỹ năng được chứng minh rõ hơn.`,
      basis: [`Số ngôn ngữ có tỉ lệ code GitHub ghi nhận · ${languages.length}`],
    });
  }

  const deepest = [...frameworks].sort(
    (a, b) =>
      (b.usage ? USAGE_RANK[b.usage] : 0) - (a.usage ? USAGE_RANK[a.usage] : 0) ||
      b.repositoryCount - a.repositoryCount,
  )[0];
  if (deepest) {
    const estimate = deepest.usage && deepest.confidence !== "low"
      ? `Codi ước tính mức ${GITHUB_USAGE_LABELS[deepest.usage].toLowerCase()} (độ tin cậy ${deepest.confidence === "high" ? "cao" : "trung bình"}, chưa kiểm chứng).`
      : "Chưa có ước tính mức dùng đủ tin cậy.";
    insights.push({
      id: "deepest-framework",
      text: `${deepest.name} được khai báo trong ${deepest.repositoryCount} repo. ${estimate}`,
      basis: [`Khai báo phụ thuộc · ${deepest.repositoryCount} repo`, ...repoNames(profile, deepest.repositoryIds)],
    });
  }

  const manifestRead = profile.limitations.repositories.some(
    (repo) => repo.disposition === "selected" && repo.files.some((file) => file.state === "collected"),
  );
  const hasTestTool = tools.some((tool) =>
    (TEST_TOOLS as readonly string[]).includes(tool.name),
  );
  if (manifestRead && !hasTestTool) {
    insights.push({
      id: "no-test-tool-seen",
      text: "Chưa thấy công cụ kiểm thử (Vitest, Jest, Playwright) trong các file cấu hình đã đọc. Điều này chỉ nói về file đã đọc, không có nghĩa là bạn không viết test.",
      basis: ["File cấu hình đã đọc thành công (package.json / requirements.txt)"],
    });
  }

  const recent = selectedRepositories(profile).filter((repo) => {
    if (!repo.pushedAt) return false;
    const pushed = Date.parse(repo.pushedAt);
    const analysed = Date.parse(profile.collectedAt);
    return Number.isFinite(pushed) && Number.isFinite(analysed) && analysed - pushed <= RECENT_WINDOW_DAYS * DAY_MS && pushed <= analysed;
  });
  const selected = profile.limitations.coverage.selected;
  if (selected > 0) {
    insights.push({
      id: "recent-activity",
      text: `${recent.length}/${selected} repo được đẩy code trong ${RECENT_WINDOW_DAYS} ngày trước lần phân tích${recent.length === 0 ? ". Thiếu lần đẩy gần đây không chứng minh bạn ngừng học" : "."}`,
      basis: [`Thời điểm đẩy code gần nhất của từng repo đã chọn`],
    });
  }

  return insights.slice(0, 4);
}

function formatShare(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value);
}

/** Human size for bytes, used only inside tooltips and evidence, never as a skill measure. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}
