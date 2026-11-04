import type { Database } from "@codi-1/db";
import {
  GITHUB_CONFIDENCE_LABELS,
  GITHUB_OVERALL_LABELS,
  GITHUB_USAGE_LABELS,
  GITHUB_USAGE_LEVELS,
  projectGithubProfile,
  type GithubProfileProjection,
} from "./github-profile-analysis-contract";
import { createGithubProfileStore } from "./github-profile-store";

/**
 * Course guidance from the learner's published GitHub profile, used only after the learner granted AI guidance.
 * What leaves the server is this summary: technology names with usage, area labels with confidence, the overall
 * level. Never code, quotes, repository names or evidence links.
 */
type Usage = (typeof GITHUB_USAGE_LEVELS)[number];
type Level = keyof typeof GITHUB_OVERALL_LABELS;
type Confidence = keyof typeof GITHUB_CONFIDENCE_LABELS;

export interface GuidanceProfile {
  level: Level | null;
  levelConfidence: Confidence | null;
  technologies: { name: string; usage: Usage | null }[];
  areas: { label: string; confidence: Confidence }[];
}

const MAX_TECHNOLOGIES = 20;
const MAX_AREAS = 8;
const AREA_LABEL_MAX = 80;
const usageRank = (usage: Usage | null) => (usage ? GITHUB_USAGE_LEVELS.indexOf(usage) + 1 : 0);

/** The compact summary of a projection (learner corrections already applied: hidden items are gone). */
export function guidanceProfile(projection: GithubProfileProjection): GuidanceProfile {
  const byName = new Map<string, Usage | null>();
  for (const tech of projection.technologies) {
    const name = tech.observations[0]?.technology;
    if (!name) continue;
    // The same name can be a language and a declared tool (TypeScript); keep the stronger usage.
    const current = byName.get(name);
    if (current === undefined || usageRank(tech.usage) > usageRank(current)) byName.set(name, tech.usage);
  }
  const technologies = [...byName]
    .map(([name, usage]) => ({ name, usage }))
    .sort((a, b) => usageRank(b.usage) - usageRank(a.usage) || a.name.localeCompare(b.name, "en"))
    .slice(0, MAX_TECHNOLOGIES);
  return {
    level: projection.overall?.level ?? null,
    levelConfidence: projection.overall?.confidence ?? null,
    technologies,
    areas: projection.areas.slice(0, MAX_AREAS).map((area) => ({
      label: area.label.replace(/\s+/g, " ").slice(0, AREA_LABEL_MAX),
      confidence: area.confidence,
    })),
  };
}

/** One system-prompt line block; empty when the profile has nothing to say. */
export function githubGuidanceNote(profile: GuidanceProfile): string {
  if (!profile.technologies.length && !profile.areas.length && !profile.level) return "";
  const lines = [
    "Hồ sơ GitHub của học viên (học viên đã đồng ý dùng để gợi ý khoá; ước tính từ repo công khai, chưa kiểm chứng, không phải điểm):",
  ];
  if (profile.level)
    lines.push(
      `- Mức tổng thể ước tính: ${GITHUB_OVERALL_LABELS[profile.level]}${profile.levelConfidence ? ` (độ tin cậy ${GITHUB_CONFIDENCE_LABELS[profile.levelConfidence].toLowerCase()})` : ""}`,
    );
  if (profile.technologies.length)
    lines.push(
      `- Công nghệ: ${profile.technologies.map((t) => `${t.name} (${t.usage ? GITHUB_USAGE_LABELS[t.usage].toLowerCase() : "chưa rõ mức dùng"})`).join(", ")}`,
    );
  if (profile.areas.length)
    lines.push(
      `- Mảng: ${profile.areas.map((a) => `${a.label} (độ tin cậy ${GITHUB_CONFIDENCE_LABELS[a.confidence].toLowerCase()})`).join(", ")}`,
    );
  lines.push(
    "Khi học viên hỏi nên học khoá nào: gọi recommend_courses_for_profile, giải thích khoá nào xây tiếp trên thứ học viên đã dùng và khoá nào bổ sung kỹ năng còn thiếu. Thiếu một công nghệ trên GitHub không có nghĩa là học viên yếu phần đó.",
  );
  return lines.join("\n");
}

/** The consented summary for the chat, or null (no published profile, undecided, declined, or unreadable). */
export async function readGithubGuidance(db: Database, userId: string): Promise<GuidanceProfile | null> {
  try {
    const store = createGithubProfileStore(db);
    const consent = await store.aiGuidance(userId);
    if (consent?.state !== "granted") return null;
    const stored = await store.read(userId);
    if (!stored) return null;
    return guidanceProfile(projectGithubProfile(stored.snapshot, stored.analysis, stored.corrections));
  } catch (error) {
    // Guidance is optional context: the chat answers without it rather than failing the turn.
    console.error("Failed to read GitHub guidance profile", error);
    return null;
  }
}

// ───────────────────────── deterministic course matching ─────────────────────────
export interface GuidanceCourse {
  id: string;
  title: string;
  slug: string;
  description: string;
  level: string;
  skills: string[];
}
export interface CourseMatch {
  courseId: string;
  /** Technologies from the profile this course works with. */
  builds: string[];
  /** Course skills not shown by the profile and not already mastered on Codi. */
  fills: string[];
  levelFit: 0 | 1 | 2;
  score: number;
}

export const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

// Common short forms that course titles, slugs and descriptions use for a technology.
const ALIASES: Record<string, string[]> = {
  javascript: ["js"],
  typescript: ["ts"],
  "next.js": ["nextjs", "next"],
  "node.js": ["nodejs", "node"],
  react: ["reactjs"],
  "vue.js": ["vue", "vuejs"],
  postgresql: ["postgres"],
};
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-term match: "Java" never matches "JavaScript", "C" never matches "CSS". */
function mentions(haystack: string, technology: string) {
  const name = fold(technology);
  return [name, ...(ALIASES[name] ?? [])].some((term) =>
    new RegExp(`(^|[^a-z0-9+#])${escapeRegex(term)}($|[^a-z0-9+#])`).test(haystack),
  );
}

// Filler words of a Vietnamese question that say nothing about the topic.
const GOAL_STOPWORDS = new Set(["khoa", "hoc", "tiep", "theo", "nen", "nao", "cho", "minh", "muon", "lap", "trinh", "the"]);
const COURSE_RANK: Record<string, number> = { Beginner: 0, Intermediate: 1, Advanced: 2 };
const LEARNER_RANK: Record<Level, number> = { new: 0, basic: 1, solid: 2 };
// A technology only tried is worth deepening; one used deeply is mostly known already.
const BUILD_VALUE: Record<Usage | "none", number> = { tried: 3, regular: 2, deep: 0.5, none: 2 };

/**
 * Ranks unowned courses against the profile: courses that deepen what the learner already uses, at a level that
 * fits, then by how many new skills they add. Pure and deterministic (ties by title).
 */
export function matchCoursesToProfile(
  profile: GuidanceProfile,
  catalog: GuidanceCourse[],
  options: { owned: ReadonlySet<string>; masteredSkills: readonly string[]; query?: string; limit?: number },
): CourseMatch[] {
  const mastered = new Set(options.masteredSkills.map(fold));
  const queryTerms = fold(options.query ?? "")
    .split(/[^\p{L}\p{N}+#.]+/u)
    .filter((term) => term.length >= 3 && !GOAL_STOPWORDS.has(term));
  const learner = profile.level ? LEARNER_RANK[profile.level] : null;
  const matches = catalog
    .filter((course) => !options.owned.has(course.id))
    .map((course): CourseMatch & { title: string; queryHits: number } => {
      const haystack = fold(`${course.title} ${course.slug.replace(/-/g, " ")} ${course.description} ${course.skills.join(" ")}`);
      const built = profile.technologies.filter((tech) => mentions(haystack, tech.name));
      const fills = course.skills.filter(
        (skill) => !mastered.has(fold(skill)) && !profile.technologies.some((tech) => mentions(fold(skill), tech.name)),
      );
      const rank = COURSE_RANK[course.level];
      const levelFit = (learner === null || rank === undefined ? 1 : Math.max(0, 2 - Math.abs(rank - learner))) as 0 | 1 | 2;
      const buildScore = Math.min(6, built.reduce((sum, tech) => sum + BUILD_VALUE[tech.usage ?? "none"], 0));
      const queryHits = queryTerms.filter((term) => haystack.includes(term)).length;
      return {
        courseId: course.id,
        title: course.title,
        builds: built.map((tech) => tech.name),
        fills,
        levelFit,
        queryHits,
        // A goal the learner states outweighs what the profile suggests.
        score: buildScore + levelFit * 2 + Math.min(3, fills.length * 0.5) + queryHits * 5,
      };
    })
    // A course must relate to the profile or to the asked goal; level fit alone is not a reason.
    .filter((match) => match.builds.length > 0 || match.fills.length > 0 || match.queryHits > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "vi"));
  return matches.slice(0, options.limit ?? 4).map(({ title: _title, queryHits: _hits, ...match }) => match);
}

/** The card line that says why a course was picked, from the match only. */
export function matchReason(match: CourseMatch, profile: GuidanceProfile): string {
  const parts: string[] = [];
  if (match.builds.length) parts.push(`Xây tiếp trên ${match.builds.slice(0, 3).join(", ")} bạn đã dùng`);
  if (match.fills.length)
    parts.push(`Bổ sung ${match.fills.slice(0, 3).join(", ")}${match.fills.length > 3 ? ` và ${match.fills.length - 3} kỹ năng khác` : ""}`);
  if (profile.level && match.levelFit === 2) parts.push(`Hợp mức ${GITHUB_OVERALL_LABELS[profile.level].toLowerCase()}`);
  return parts.join(" · ");
}
