import { z } from "zod";
import { ONBOARDING_LEVELS } from "@codi-1/db/schema/onboarding-values";
import type {
  GithubCollectionSnapshot,
  GithubEvidence,
  GithubTechnologyObservation,
} from "./github-profile-contract";
import { extractGithubTechnologies } from "./github-profile-extraction";

export const GITHUB_USAGE_LEVELS = ["tried", "regular", "deep"] as const;
export const GITHUB_USAGE_LABELS = {
  tried: "Đã thử",
  regular: "Dùng thường xuyên",
  deep: "Dùng sâu",
} as const;
export const GITHUB_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export const GITHUB_CONFIDENCE_LABELS = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
} as const;
export const GITHUB_OVERALL_LABELS: Record<
  (typeof ONBOARDING_LEVELS)[number],
  string
> = {
  new: "Mới bắt đầu",
  basic: "Cơ bản",
  solid: "Vững",
};

const identifier = z.string().min(1).max(300);
const areaIdentifier = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
  .max(100);
const repositoryId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
// No model-authored URL is accepted, even in prose; retained source URLs are resolved below.
const prose = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine(
    (value) => !/(?:https?:\/\/|www\.)/i.test(value),
    "Model prose must not contain URLs",
  );
const support = z
  .object({
    observationId: identifier,
    evidenceId: identifier,
    repositoryId,
    quote: z.string().min(1).max(1000).optional(),
  })
  .strict();
const supports = z.array(support).min(1).max(200);

/** Structural validation only. Semantic truth of free text is NOT automatically verified. */
export const githubProfileAnalysisSchema = z
  .object({
    technologies: z
      .array(
        z
          .object({
            technologyId: identifier,
            usage: z.enum(GITHUB_USAGE_LEVELS),
            confidence: z.enum(GITHUB_CONFIDENCE_LEVELS),
            explanation: prose,
            supports,
          })
          .strict(),
      )
      .max(200),
    areas: z
      .array(
        z
          .object({
            // Stable caller/model taxonomy keys, not per-generation UUIDs or array positions.
            areaId: areaIdentifier,
            label: prose,
            confidence: z.enum(GITHUB_CONFIDENCE_LEVELS),
            explanation: prose,
            supports,
          })
          .strict(),
      )
      .max(50),
    overall: z
      .object({
        level: z.enum(ONBOARDING_LEVELS),
        confidence: z.enum(GITHUB_CONFIDENCE_LEVELS),
        summary: prose,
        supports,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type GithubProfileAnalysis = z.infer<typeof githubProfileAnalysisSchema>;

export const githubProfileCorrectionsSchema = z
  .object({
    excludedRepositoryIds: z.array(repositoryId).max(300).default([]),
    technologies: z
      .array(
        z
          .object({
            technologyId: identifier,
            usage: z.enum(GITHUB_USAGE_LEVELS).optional(),
            hidden: z.boolean().optional(),
          })
          .strict(),
      )
      .max(200)
      .default([]),
    areas: z
      .array(z.object({ areaId: areaIdentifier, hidden: z.boolean() }).strict())
      .max(50)
      .default([]),
  })
  .strict();
export type GithubProfileCorrections = z.infer<
  typeof githubProfileCorrectionsSchema
>;

export class GithubProfileAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubProfileAnalysisError";
  }
}

/** Kind keeps a declared TypeScript tool distinct from a language-byte observation. */
export function githubTechnologyId(
  observation: Pick<GithubTechnologyObservation, "technology" | "kind">,
) {
  return `${observation.kind}:${encodeURIComponent(observation.technology)}`;
}
export function githubObservationId(observation: GithubTechnologyObservation) {
  return `${githubTechnologyId(observation)}:${observation.signal}`;
}

function assertUnique(values: readonly (string | number)[], name: string) {
  if (new Set(values).size !== values.length)
    throw new GithubProfileAnalysisError(`Duplicate ${name}`);
}

function evidenceIndex(snapshot: GithubCollectionSnapshot) {
  assertUnique(
    snapshot.repositories.map((repo) => repo.id),
    "repository ID",
  );
  assertUnique(
    snapshot.evidence.map((item) => item.id),
    "evidence ID",
  );
  const repos = new Map(snapshot.repositories.map((repo) => [repo.id, repo]));
  const evidence = new Map<string, GithubEvidence>();
  for (const item of snapshot.evidence) {
    const repo = repos.get(item.repositoryId);
    // Skipped repositories never become supporting evidence.
    if (!repo || repo.disposition !== "selected") continue;
    const base = `https://github.com/${repo.owner}/${repo.name}`;
    if (item.kind === "file") {
      const file = repo.files.find((entry) => entry.path === item.path);
      if (
        !repo.commitSha ||
        item.commitSha !== repo.commitSha ||
        !/^[a-f0-9]{40}$/i.test(item.commitSha) ||
        !/^[a-f0-9]{40}$/i.test(item.blobSha) ||
        !file ||
        file.state !== "collected" ||
        file.evidenceId !== item.id ||
        item.sourceUrl !==
          `${base}/blob/${item.commitSha}/${encodeURIComponent(item.path)}`
      ) {
        throw new GithubProfileAnalysisError(
          "Mismatched retained file evidence",
        );
      }
    } else if (
      item.sourceUrl !==
      `https://api.github.com/repos/${repo.owner}/${repo.name}/languages`
    ) {
      throw new GithubProfileAnalysisError("Mismatched language evidence URL");
    }
    evidence.set(item.id, item);
  }
  return evidence;
}

function observationsFor(
  snapshot: GithubCollectionSnapshot,
  excluded: readonly number[],
) {
  const evidence = evidenceIndex(snapshot);
  // The extractor stays unchanged; this boundary admits only consistent retained evidence.
  const safeSnapshot = { ...snapshot, evidence: [...evidence.values()] };
  return extractGithubTechnologies(safeSnapshot, excluded);
}

function validateSupports(
  refs: GithubProfileAnalysis["areas"][number]["supports"],
  observations: GithubTechnologyObservation[],
  evidence: Map<string, GithubEvidence>,
  technologyId?: string,
) {
  for (const ref of refs) {
    const observation = observations.find(
      (item) => githubObservationId(item) === ref.observationId,
    );
    const source = evidence.get(ref.evidenceId);
    if (
      !observation ||
      !source ||
      source.repositoryId !== ref.repositoryId ||
      !observation.evidenceIds.includes(ref.evidenceId) ||
      (technologyId !== undefined &&
        githubTechnologyId(observation) !== technologyId)
    ) {
      throw new GithubProfileAnalysisError(
        "Unsupported observation/evidence attribution",
      );
    }
    if (
      ref.quote !== undefined &&
      (source.kind !== "file" || !source.text.includes(ref.quote))
    ) {
      throw new GithubProfileAnalysisError(
        "Quote is not an exact retained file excerpt",
      );
    }
  }
}

/** Rejects unknown/excluded evidence and cross-technology or cross-repository attribution. */
export function validateGithubProfileAnalysis(
  snapshot: GithubCollectionSnapshot,
  input: unknown,
  excludedRepositoryIds: readonly number[] = [],
): GithubProfileAnalysis {
  const analysis = githubProfileAnalysisSchema.parse(input);
  const evidence = evidenceIndex(snapshot);
  const observations = observationsFor(snapshot, excludedRepositoryIds);
  assertUnique(
    analysis.technologies.map((item) => item.technologyId),
    "technology inference",
  );
  assertUnique(
    analysis.areas.map((item) => item.areaId),
    "area inference",
  );
  for (const item of analysis.technologies)
    validateSupports(item.supports, observations, evidence, item.technologyId);
  for (const item of analysis.areas)
    validateSupports(item.supports, observations, evidence);
  if (analysis.overall)
    validateSupports(analysis.overall.supports, observations, evidence);
  return analysis;
}

export interface GithubProfileCitation {
  evidenceId: string;
  repositoryId: number;
  sourceUrl: string;
  collectedAt: string;
  kind: GithubEvidence["kind"];
  path?: string;
  commitSha?: string;
  quote?: string;
}

function citation(
  source: GithubEvidence,
  quote?: string,
): GithubProfileCitation {
  return {
    evidenceId: source.id,
    repositoryId: source.repositoryId,
    sourceUrl: source.sourceUrl,
    collectedAt: source.collectedAt,
    kind: source.kind,
    ...(source.kind === "file"
      ? { path: source.path, commitSha: source.commitSha }
      : {}),
    ...(quote === undefined ? {} : { quote }),
  };
}

function inference<T extends { supports: z.infer<typeof supports> }>(
  item: T,
  evidence: Map<string, GithubEvidence>,
) {
  return {
    ...item,
    kind: "inference" as const,
    semanticVerification: "unverified" as const,
    citations: item.supports.map((ref) =>
      citation(evidence.get(ref.evidenceId)!, ref.quote),
    ),
  };
}

/** Pure private projection; authorization, persistence and product workflow remain caller-owned. */
export function projectGithubProfile(
  snapshot: GithubCollectionSnapshot,
  input: unknown | null,
  correctionInput: unknown = {},
) {
  const corrections = githubProfileCorrectionsSchema.parse(correctionInput);
  assertUnique(
    corrections.technologies.map((item) => item.technologyId),
    "technology correction",
  );
  assertUnique(
    corrections.areas.map((item) => item.areaId),
    "area correction",
  );
  // Validate the original generation first. Exclusions below invalidate rather than repair its claims.
  const analysis =
    input === null ? null : validateGithubProfileAnalysis(snapshot, input);
  const evidence = evidenceIndex(snapshot);
  const observations = observationsFor(
    snapshot,
    corrections.excludedRepositoryIds,
  );
  const hidden = new Set(
    corrections.technologies
      .filter((item) => item.hidden)
      .map((item) => item.technologyId),
  );
  const visible = observations.filter(
    (item) => !hidden.has(githubTechnologyId(item)),
  );
  const refsSurvive = (refs: z.infer<typeof supports>) =>
    refs.every((ref) =>
      visible.some(
        (item) =>
          githubObservationId(item) === ref.observationId &&
          item.evidenceIds.includes(ref.evidenceId),
      ),
    );
  const editedTechnologyIds = new Set(
    corrections.technologies
      .filter((item) => item.usage !== undefined)
      .map((item) => item.technologyId),
  );
  const refsEdited = (refs: z.infer<typeof supports>) =>
    refs.some((ref) =>
      visible.some(
        (item) =>
          githubObservationId(item) === ref.observationId &&
          editedTechnologyIds.has(githubTechnologyId(item)),
      ),
    );
  const facts = visible.map((item) => ({
    ...item,
    id: githubObservationId(item),
    technologyId: githubTechnologyId(item),
    epistemicKind: "observation" as const,
    text:
      item.signal === "language_bytes"
        ? `${item.technology}: ${item.languageBytes} byte được GitHub ghi nhận trong ${item.repositoryIds.length} repo.`
        : `${item.technology}: được khai báo trong file phụ thuộc của ${item.repositoryIds.length} repo.`,
    citations: item.evidenceIds.map((id) => citation(evidence.get(id)!)),
  }));
  const technologyIds = [...new Set(visible.map(githubTechnologyId))];
  const technologies = technologyIds
    .map((id) => {
      const correction = corrections.technologies.find(
        (item) => item.technologyId === id,
      );
      const proposed = analysis?.technologies.find(
        (item) => item.technologyId === id,
      );
      const valid =
        proposed && refsSurvive(proposed.supports) ? proposed : null;
      return {
        technologyId: id,
        observations: facts.filter((item) => item.technologyId === id),
        inference:
          valid && correction?.usage === undefined
            ? inference(valid, evidence)
            : null,
        usage: correction?.usage ?? valid?.usage ?? null,
        usageSource: correction?.usage
          ? ("learner" as const)
          : valid
            ? ("inference" as const)
            : null,
        learnerEdited: correction?.usage !== undefined,
      };
    })
    .sort(
      (a, b) =>
        (b.usage === null ? -1 : GITHUB_USAGE_LEVELS.indexOf(b.usage)) -
          (a.usage === null ? -1 : GITHUB_USAGE_LEVELS.indexOf(a.usage)) ||
        a.technologyId.localeCompare(b.technologyId, "en"),
    );
  const areas = (analysis?.areas ?? [])
    .filter(
      (item) =>
        !corrections.areas.find((edit) => edit.areaId === item.areaId)
          ?.hidden &&
        refsSurvive(item.supports) &&
        !refsEdited(item.supports),
    )
    .map((item) => inference(item, evidence));
  const overall = analysis?.overall;
  // Do not silently display generation prose that contradicts effective learner corrections.
  const overallValid =
    overall &&
    refsSurvive(overall.supports) &&
    !refsEdited(overall.supports) &&
    !corrections.areas.some(
      (item) =>
        item.hidden &&
        analysis?.areas.some((area) => area.areaId === item.areaId),
    );
  return {
    version: 1 as const,
    identity: snapshot.identity ? { ...snapshot.identity } : null,
    collectedAt: snapshot.collectedAt,
    collectionStatus: snapshot.status,
    observationAvailability: observations.length
      ? ("observed" as const)
      : ("none_observed" as const),
    technologies,
    areas,
    overall: overallValid ? inference(overall, evidence) : null,
    summaryState: overall
      ? overallValid
        ? ("provided" as const)
        : ("invalidated" as const)
      : ("not_provided" as const),
    // A factual offline replacement, not a fabricated inference or stale AI summary.
    factualSummary: facts.map((item) => item.text),
    corrections,
    limitations: {
      collectionStatus: snapshot.status,
      coverage: {
        ...snapshot.coverage,
        limits: { ...snapshot.coverage.limits },
      },
      listingComplete: snapshot.coverage.listingComplete,
      issues: snapshot.issues.map((item) => ({ ...item })),
      repositories: snapshot.repositories.map((repo) => ({
        id: repo.id,
        disposition: repo.disposition,
        excluded: corrections.excludedRepositoryIds.includes(repo.id),
        files: repo.files.map((file) => ({
          path: file.path,
          state: file.state,
        })),
      })),
      noObservationsDoesNotProveWeakness: true as const,
      freeTextSemanticsVerified: false as const,
    },
  };
}
export type GithubProfileProjection = ReturnType<typeof projectGithubProfile>;
