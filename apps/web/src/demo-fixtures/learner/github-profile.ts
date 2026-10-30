import { GITHUB_PROFILE_LIMITS, type GithubCollectionSnapshot, type GithubEvidence, type GithubRepositorySnapshot } from "@/lib/github-profile-contract";
import {
  githubObservationId,
  githubTechnologyId,
  projectGithubProfile,
  type GithubProfileAnalysis,
} from "@/lib/github-profile-analysis-contract";
import { extractGithubTechnologies } from "@/lib/github-profile-extraction";

const COLLECTED_AT = "2026-10-20T08:00:00.000Z";
const OWNER = "minhan-dev";

/** Deterministic 40-hex digest stand-in for pinned commit and blob identifiers. */
const hex40 = (byte: number) => byte.toString(16).padStart(2, "0").repeat(20);

const coverage = (listed: number, selected: number): GithubCollectionSnapshot["coverage"] => ({
  publicAccess: "oauth_app",
  listingComplete: true,
  listed,
  selected,
  requests: 14,
  responseBytes: 220_000,
  elapsedMs: 4200,
  limits: { ...GITHUB_PROFILE_LIMITS },
});

type RepoSpec = {
  id: number;
  name: string;
  pushedAt: string | null;
  bytes: Record<string, number>;
  manifest?: { path: "package.json" | "requirements.txt"; text: string };
};

const npm = (dependencies: string[], devDependencies: string[] = []) =>
  JSON.stringify({
    name: "demo",
    dependencies: Object.fromEntries(dependencies.map((name) => [name, "^1.0.0"])),
    devDependencies: Object.fromEntries(devDependencies.map((name) => [name, "^1.0.0"])),
  });

/** Eight analysed repositories across the last 12 months, plus one fork and one empty repo that are skipped. */
const SELECTED: RepoSpec[] = [
  { id: 101, name: "format-price", pushedAt: "2026-10-12T14:20:00.000Z", bytes: { TypeScript: 18450, CSS: 1200 }, manifest: { path: "package.json", text: npm(["react"], ["vitest"]) } },
  { id: 102, name: "todo-react", pushedAt: "2026-09-30T09:05:00.000Z", bytes: { TypeScript: 52000, JavaScript: 3100 }, manifest: { path: "package.json", text: npm(["react", "next"]) } },
  { id: 103, name: "lms-dashboard", pushedAt: "2026-08-14T10:00:00.000Z", bytes: { TypeScript: 98000, CSS: 9000, HTML: 1400 }, manifest: { path: "package.json", text: npm(["react", "next", "drizzle-orm"]) } },
  { id: 104, name: "api-gateway-practice", pushedAt: "2026-07-02T16:45:00.000Z", bytes: { JavaScript: 40000 }, manifest: { path: "package.json", text: npm(["express"], ["jest"]) } },
  { id: 105, name: "py-scraper", pushedAt: "2026-05-19T08:30:00.000Z", bytes: { Python: 61000 }, manifest: { path: "requirements.txt", text: "fastapi>=0.110\nrequests==2.32.0\n" } },
  { id: 106, name: "portfolio-site", pushedAt: "2026-03-03T12:00:00.000Z", bytes: { HTML: 22000, CSS: 15000, JavaScript: 2000 } },
  { id: 107, name: "sql-notes", pushedAt: "2025-12-20T19:10:00.000Z", bytes: { SQL: 4200 } },
  { id: 108, name: "algorithms", pushedAt: "2025-11-01T07:00:00.000Z", bytes: { Python: 9000, "C++": 16000 } },
];

const repoBase = (spec: RepoSpec, index: number): GithubRepositorySnapshot => ({
  id: spec.id,
  owner: OWNER,
  name: spec.name,
  pushedAt: spec.pushedAt,
  defaultBranch: "main",
  disposition: "selected",
  commitSha: hex40(index + 1),
  files: [],
});

function buildSnapshot(): GithubCollectionSnapshot {
  const evidence: GithubEvidence[] = [];
  const repositories: GithubRepositorySnapshot[] = SELECTED.map((spec, index) => {
    const repo = repoBase(spec, index);
    evidence.push({
      id: `ev-lang-${spec.id}`,
      kind: "languages",
      repositoryId: spec.id,
      collectedAt: COLLECTED_AT,
      sourceUrl: `https://api.github.com/repos/${OWNER}/${spec.name}/languages`,
      bytes: spec.bytes,
    });
    if (spec.manifest) {
      const evidenceId = `ev-file-${spec.id}`;
      evidence.push({
        id: evidenceId,
        kind: "file",
        repositoryId: spec.id,
        collectedAt: COLLECTED_AT,
        sourceUrl: `https://github.com/${OWNER}/${spec.name}/blob/${repo.commitSha}/${spec.manifest.path}`,
        path: spec.manifest.path,
        commitSha: repo.commitSha!,
        blobSha: hex40(index + 101),
        text: spec.manifest.text,
      });
      repo.files = [{ path: spec.manifest.path, state: "collected", evidenceId }];
    } else {
      repo.files = [{ path: "package.json", state: "missing" }];
    }
    return repo;
  });
  repositories.push(
    { id: 109, owner: OWNER, name: "forked-utils", pushedAt: "2026-07-01T10:00:00.000Z", defaultBranch: "main", disposition: "fork", commitSha: null, files: [] },
    { id: 110, owner: OWNER, name: "empty-sandbox", pushedAt: "2026-10-02T10:00:00.000Z", defaultBranch: "main", disposition: "empty", commitSha: null, files: [] },
  );
  return {
    version: 1,
    status: "complete",
    identity: { id: "583211", login: OWNER },
    collectedAt: COLLECTED_AT,
    repositories,
    evidence,
    issues: [{ operation: "file", code: "not_found", repositoryId: 106, path: "package.json" }],
    coverage: coverage(repositories.length, SELECTED.length),
  };
}

/** A complete collection: eight analysed repositories in several languages, one fork and one empty repo skipped. */
export const githubSnapshotComplete = buildSnapshot();

/** Collection finished but found no usable repository. */
export const githubSnapshotEmpty: GithubCollectionSnapshot = {
  ...githubSnapshotComplete,
  repositories: [],
  evidence: [],
  coverage: coverage(0, 0),
};

/** Same data as the complete snapshot, collected more than 90 days ago. */
export const githubSnapshotStale: GithubCollectionSnapshot = {
  ...githubSnapshotComplete,
  collectedAt: "2026-06-01T08:00:00.000Z",
};

/** Generation output the server would accept for the complete snapshot: usage levels at all three depths. */
function buildAnalysis(snapshot: GithubCollectionSnapshot): GithubProfileAnalysis {
  const observations = extractGithubTechnologies(snapshot);
  const find = (technology: string, signal: "language_bytes" | "declared_dependency") => {
    const observation = observations.find((item) => item.technology === technology && item.signal === signal);
    if (!observation) throw new Error(`Fixture observation missing: ${technology}`);
    return observation;
  };
  const supportsFor = (observation: ReturnType<typeof find>) =>
    observation.evidenceIds.map((evidenceId) => ({
      observationId: githubObservationId(observation),
      evidenceId,
      repositoryId: snapshot.evidence.find((item) => item.id === evidenceId)!.repositoryId,
    }));
  const technology = (
    name: string,
    signal: "language_bytes" | "declared_dependency",
    usage: "tried" | "regular" | "deep",
    confidence: "low" | "medium" | "high",
    explanation: string,
  ) => {
    const observation = find(name, signal);
    return {
      technologyId: githubTechnologyId(observation),
      usage,
      confidence,
      explanation,
      supports: supportsFor(observation),
    };
  };
  const react = find("React", "declared_dependency");
  const express = find("Express", "declared_dependency");
  const fastapi = find("FastAPI", "declared_dependency");
  return {
    technologies: [
      technology("TypeScript", "language_bytes", "deep", "high", "Phần lớn byte code nằm trong ba repo giao diện và dashboard."),
      technology("React", "declared_dependency", "deep", "high", "React được khai báo trong ba repo, cùng lúc với các thư viện giao diện khác."),
      technology("Next.js", "declared_dependency", "regular", "medium", "Next.js xuất hiện trong hai repo gần đây."),
      technology("Drizzle ORM", "declared_dependency", "regular", "medium", "Drizzle ORM được khai báo trong dashboard học tập."),
      technology("Vitest", "declared_dependency", "regular", "medium", "Vitest được khai báo trong repo định dạng giá."),
      technology("Express", "declared_dependency", "tried", "low", "Express chỉ xuất hiện trong một repo thực hành."),
      technology("FastAPI", "declared_dependency", "tried", "low", "FastAPI xuất hiện trong một repo cào dữ liệu."),
    ],
    areas: [
      {
        areaId: "frontend",
        label: "Xây dựng giao diện",
        confidence: "medium",
        explanation: "React và Next.js xuất hiện cùng nhau trong các repo giao diện.",
        supports: [...supportsFor(react), ...supportsFor(find("Next.js", "declared_dependency"))],
      },
      {
        areaId: "backend-api",
        label: "Xây dựng API",
        confidence: "low",
        explanation: "Chỉ có một vài repo khai báo framework API; cần thêm bằng chứng.",
        supports: [...supportsFor(express), ...supportsFor(fastapi)],
      },
      {
        areaId: "testing",
        label: "Kiểm thử",
        confidence: "low",
        explanation: "Chỉ một repo khai báo công cụ kiểm thử trong package.json.",
        supports: supportsFor(find("Vitest", "declared_dependency")),
      },
    ],
    overall: {
      level: "basic",
      confidence: "medium",
      summary:
        "Bạn viết TypeScript và React khá đều trên nhiều repo, với Next.js xuất hiện trong các dự án gần đây. Phần backend và kiểm thử còn ít bằng chứng công khai. Đây chỉ là ước tính từ repo công khai, chưa kiểm chứng bằng bài kiểm tra.",
      supports: [...supportsFor(react), ...supportsFor(find("TypeScript", "language_bytes"))],
    },
  };
}

export const githubAnalysisReady = buildAnalysis(githubSnapshotComplete);

/** Projection the profile page receives for a linked, analysed account. */
export const githubProfileReady = projectGithubProfile(githubSnapshotComplete, githubAnalysisReady, {});
export const githubProfileInsufficient = projectGithubProfile(githubSnapshotEmpty, null, {});
export const githubProfileStale = projectGithubProfile(githubSnapshotStale, githubAnalysisReady, {});
