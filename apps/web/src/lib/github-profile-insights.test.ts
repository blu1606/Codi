import { describe, expect, it } from "vitest";
import { projectGithubProfile } from "./github-profile-analysis-contract";
import {
  GITHUB_PROFILE_LIMITS,
  type GithubCollectionSnapshot,
  type GithubRepositorySnapshot,
} from "./github-profile-contract";
import {
  daysSinceLastPush,
  formatBytes,
  githubInsights,
  languageShares,
  monthlyPushActivity,
  relativeDaysLabel,
  technologyRows,
} from "./github-profile-insights";

const COLLECTED_AT = "2026-10-20T00:00:00.000Z";

function repo(
  id: number,
  name: string,
  pushedAt: string | null,
  overrides: Partial<GithubRepositorySnapshot> = {},
): GithubRepositorySnapshot {
  return {
    id,
    owner: "learner",
    name,
    pushedAt,
    defaultBranch: "main",
    disposition: "selected",
    commitSha: null,
    files: [],
    ...overrides,
  };
}

function snapshot(
  repositories: GithubRepositorySnapshot[],
  evidence: GithubCollectionSnapshot["evidence"] = [],
): GithubCollectionSnapshot {
  return {
    version: 1,
    status: "complete",
    identity: { id: "1", login: "learner" },
    collectedAt: COLLECTED_AT,
    repositories,
    evidence,
    issues: [],
    coverage: {
      publicAccess: "oauth_app",
      listingComplete: true,
      listed: repositories.length,
      selected: repositories.filter((item) => item.disposition === "selected").length,
      requests: 3,
      responseBytes: 100,
      elapsedMs: 10,
      limits: GITHUB_PROFILE_LIMITS,
    },
  };
}

const languages = (
  id: number,
  name: string,
  bytes: Record<string, number>,
) => ({
  id: `languages-${id}`,
  kind: "languages" as const,
  repositoryId: id,
  bytes,
  sourceUrl: `https://api.github.com/repos/learner/${name}/languages`,
  collectedAt: COLLECTED_AT,
});

describe("languageShares", () => {
  it("returns percentage shares of positive observed bytes, largest first", () => {
    const profile = projectGithubProfile(
      snapshot(
        [repo(1, "a", "2026-10-01T00:00:00Z"), repo(2, "b", "2026-09-01T00:00:00Z")],
        [
          languages(1, "a", { TypeScript: 600, CSS: 0 }),
          languages(2, "b", { TypeScript: 200, Python: 200 }),
        ],
      ),
      null,
    );
    const shares = languageShares(profile);
    expect(shares.map((item) => item.name)).toEqual(["TypeScript", "Python"]);
    expect(shares[0]!.share).toBeCloseTo(80);
    expect(shares[0]!.repositoryCount).toBe(2);
    expect(shares[1]!.share).toBeCloseTo(20);
    expect(shares.some((item) => item.name === "CSS")).toBe(false);
  });

  it("returns nothing without positive language bytes", () => {
    const profile = projectGithubProfile(
      snapshot([repo(1, "a", null)], []),
      null,
    );
    expect(languageShares(profile)).toEqual([]);
  });
});

describe("monthlyPushActivity", () => {
  it("buckets pushes by the Asia/Bangkok month across twelve months", () => {
    const profile = projectGithubProfile(
      snapshot([
        // 2026-09-30T18:00Z is 2026-10-01 01:00 in Bangkok, so it belongs to October.
        repo(1, "late-utc", "2026-09-30T18:00:00Z"),
        repo(2, "mid", "2026-06-10T00:00:00Z"),
        repo(3, "old", "2025-01-01T00:00:00Z"),
        repo(4, "undated", null),
      ]),
      null,
    );
    const activity = monthlyPushActivity(profile);
    expect(activity.months).toHaveLength(12);
    expect(activity.months[0]!.key).toBe("2025-11");
    expect(activity.months[11]!.key).toBe("2026-10");
    expect(activity.months.find((item) => item.key === "2026-10")!.count).toBe(1);
    expect(activity.months.find((item) => item.key === "2026-06")!.count).toBe(1);
    expect(activity.outsideWindow).toBe(1);
    expect(activity.undated).toBe(1);
  });

  it("ignores repositories that are not analysed", () => {
    const profile = projectGithubProfile(
      snapshot([
        repo(1, "kept", "2026-10-02T00:00:00Z"),
        repo(2, "fork", "2026-10-02T00:00:00Z", { disposition: "fork" }),
      ]),
      null,
    );
    const total = monthlyPushActivity(profile).months.reduce(
      (sum, item) => sum + item.count,
      0,
    );
    expect(total).toBe(1);
  });
});

describe("recency helpers", () => {
  it("measures whole days from the latest selected push to analysis", () => {
    const profile = projectGithubProfile(
      snapshot([
        repo(1, "a", "2026-10-10T12:00:00Z"),
        repo(2, "b", "2026-09-01T00:00:00Z"),
      ]),
      null,
    );
    expect(daysSinceLastPush(profile)).toBe(9);
    expect(relativeDaysLabel(9)).toBe("9 ngày trước");
    expect(relativeDaysLabel(0)).toBe("Hôm nay");
    expect(relativeDaysLabel(null)).toBe("Chưa rõ");
    expect(relativeDaysLabel(400)).toBe("13 tháng trước");
  });

  it("returns null when no selected repository has a push time", () => {
    const profile = projectGithubProfile(snapshot([repo(1, "a", null)]), null);
    expect(daysSinceLastPush(profile)).toBeNull();
  });
});

describe("technologyRows", () => {
  it("counts repositories per technology and labels usage only when present", () => {
    const profile = projectGithubProfile(
      snapshot(
        [repo(1, "a", "2026-10-01T00:00:00Z"), repo(2, "b", "2026-10-01T00:00:00Z")],
        [languages(1, "a", { TypeScript: 10 }), languages(2, "b", { TypeScript: 10 })],
      ),
      null,
    );
    const [row] = technologyRows(profile);
    expect(row).toMatchObject({
      name: "TypeScript",
      kind: "language",
      repositoryCount: 2,
      usage: null,
      usageLabel: "Chưa đủ bằng chứng về mức dùng",
    });
  });
});

describe("githubInsights", () => {
  it("cites the main language repositories and keeps the share disclaimer", () => {
    const profile = projectGithubProfile(
      snapshot(
        [repo(1, "web-app", "2026-10-01T00:00:00Z")],
        [languages(1, "web-app", { TypeScript: 900, CSS: 100 })],
      ),
      null,
    );
    const [first] = githubInsights(profile);
    expect(first!.id).toBe("main-language");
    expect(first!.text).toContain("TypeScript chiếm 90%");
    expect(first!.text).toContain("không phải mức thành thạo");
    expect(first!.basis).toContain("learner/web-app");
  });

  it("states no test tool only when manifests were actually read", () => {
    const withManifest = projectGithubProfile(
      snapshot([
        repo(1, "a", "2026-10-01T00:00:00Z", {
          commitSha: "a".repeat(40),
          files: [{ path: "package.json", state: "collected", evidenceId: "f1" }],
        }),
      ]),
      null,
    );
    expect(githubInsights(withManifest).map((item) => item.id)).toContain(
      "no-test-tool-seen",
    );
    const withoutManifest = projectGithubProfile(
      snapshot([repo(1, "a", "2026-10-01T00:00:00Z", { files: [{ path: "package.json", state: "missing" }] })]),
      null,
    );
    expect(githubInsights(withoutManifest).map((item) => item.id)).not.toContain(
      "no-test-tool-seen",
    );
  });

  it("never phrases absent evidence as weakness", () => {
    const profile = projectGithubProfile(
      snapshot([repo(1, "a", null)]),
      null,
    );
    const text = githubInsights(profile).map((item) => item.text).join(" ");
    expect(text).not.toMatch(/yếu|kém/);
  });
});

describe("formatBytes", () => {
  it("formats bytes for tooltips and evidence only", () => {
    expect(formatBytes(100)).toBe("100 B");
    expect(formatBytes(1_363_148)).toBe("1,3 MB");
    expect(formatBytes(18_450)).toBe("18 KB");
  });
});
