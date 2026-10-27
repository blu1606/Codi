import { describe, expect, it } from "vitest";
import {
  GITHUB_PROFILE_LIMITS,
  type GithubCollectionSnapshot,
} from "./github-profile-contract";
import {
  GITHUB_CONFIDENCE_LABELS,
  GITHUB_OVERALL_LABELS,
  GITHUB_USAGE_LABELS,
  GithubProfileAnalysisError,
  githubObservationId,
  githubProfileAnalysisSchema,
  githubTechnologyId,
  projectGithubProfile,
  validateGithubProfileAnalysis,
  type GithubProfileAnalysis,
} from "./github-profile-analysis-contract";
import { extractGithubTechnologies } from "./github-profile-extraction";

// Synthetic retained input tests the pure boundary, not live GitHub or user acceptance.
function snapshot(): GithubCollectionSnapshot {
  const sha = "a".repeat(40);
  return {
    version: 1,
    status: "complete",
    collectedAt: "2026-10-20T00:00:00Z",
    identity: { id: "123", login: "learner" },
    repositories: [1, 2].map((id) => ({
      id,
      owner: "learner",
      name: `project-${id}`,
      pushedAt: null,
      defaultBranch: "main",
      disposition: "selected",
      commitSha: sha,
      files: [
        { path: "package.json", state: "collected", evidenceId: `file-${id}` },
      ],
    })),
    evidence: [1, 2].flatMap((id) => [
      {
        id: `file-${id}`,
        kind: "file" as const,
        repositoryId: id,
        path: "package.json",
        commitSha: sha,
        blobSha: "b".repeat(40),
        text:
          id === 1
            ? '{"dependencies":{"react":"19","vitest":"5"}}'
            : '{"dependencies":{"react":"19","typescript":"6"}}',
        sourceUrl: `https://github.com/learner/project-${id}/blob/${sha}/package.json`,
        collectedAt: "2026-10-20T00:00:00Z",
      },
      {
        id: `languages-${id}`,
        kind: "languages" as const,
        repositoryId: id,
        bytes: { TypeScript: 100 * id },
        sourceUrl: `https://api.github.com/repos/learner/project-${id}/languages`,
        collectedAt: "2026-10-20T00:00:00Z",
      },
    ]),
    issues: [],
    coverage: {
      publicAccess: "oauth_app",
      listingComplete: true,
      listed: 2,
      selected: 2,
      requests: 10,
      responseBytes: 1000,
      elapsedMs: 10,
      limits: GITHUB_PROFILE_LIMITS,
    },
  };
}
const reactRef = (id = 1) => ({
  observationId: "framework:React:declared_dependency",
  evidenceId: `file-${id}`,
  repositoryId: id,
});
function analysis(): GithubProfileAnalysis {
  return {
    technologies: [
      {
        technologyId: "framework:React",
        usage: "regular",
        confidence: "medium",
        explanation: "Ước tính mức sử dụng từ khai báo phụ thuộc.",
        supports: [reactRef()],
      },
    ],
    areas: [
      {
        areaId: "frontend",
        label: "Giao diện web",
        confidence: "low",
        explanation: "Suy luận từ công nghệ được khai báo.",
        supports: [reactRef()],
      },
    ],
    overall: {
      level: "basic",
      confidence: "low",
      summary:
        "Ước tính ban đầu từ repo công khai. Không phải kết quả đo năng lực.",
      supports: [reactRef()],
    },
  };
}

describe("evidence-backed profile projection", () => {
  it("projects positive facts separately from unverified inferred estimates", () => {
    const result = projectGithubProfile(snapshot(), analysis());
    const react = result.technologies.find(
      (item) => item.technologyId === "framework:React",
    )!;
    expect(react.observations[0]).toMatchObject({
      epistemicKind: "observation",
      signal: "declared_dependency",
      repositoryIds: [1, 2],
      text: "React: được khai báo trong file phụ thuộc của 2 repo.",
    });
    expect(react.inference).toMatchObject({
      kind: "inference",
      semanticVerification: "unverified",
    });
    expect(react.usageSource).toBe("inference");
    expect(result.overall).toMatchObject({
      kind: "inference",
      level: "basic",
      semanticVerification: "unverified",
    });
    expect(result.areas[0]).toMatchObject({
      kind: "inference",
      semanticVerification: "unverified",
    });
    expect(result.summaryState).toBe("provided");
  });

  it("keeps TypeScript language bytes and tool declarations distinct", () => {
    const result = projectGithubProfile(snapshot(), null);
    expect(
      result.technologies.find(
        (item) => item.technologyId === "language:TypeScript",
      )?.observations[0],
    ).toMatchObject({
      signal: "language_bytes",
      languageBytes: 300,
    });
    expect(
      result.technologies.find(
        (item) => item.technologyId === "tool:TypeScript",
      )?.observations[0].signal,
    ).toBe("declared_dependency");
    expect(result.technologies.every((item) => item.usage === null)).toBe(true);
    expect(result.overall).toBeNull();
  });

  it("uses stable IDs independent of evidence order and repository exclusions", () => {
    const source = snapshot();
    const observation = extractGithubTechnologies(source).find(
      (item) => item.technology === "React",
    )!;
    const remaining = extractGithubTechnologies(source, [1]).find(
      (item) => item.technology === "React",
    )!;
    expect(githubTechnologyId(observation)).toBe(githubTechnologyId(remaining));
    expect(githubObservationId(observation)).toBe(
      githubObservationId(remaining),
    );
    expect(githubTechnologyId({ technology: "C++", kind: "language" })).toBe(
      "language:C%2B%2B",
    );
  });

  it("uses the canonical product vocabulary without mastery scores", () => {
    expect(Object.values(GITHUB_USAGE_LABELS)).toEqual([
      "Đã thử",
      "Dùng thường xuyên",
      "Dùng sâu",
    ]);
    expect(Object.values(GITHUB_CONFIDENCE_LABELS)).toEqual([
      "Thấp",
      "Trung bình",
      "Cao",
    ]);
    expect(Object.keys(GITHUB_OVERALL_LABELS)).toEqual([
      "new",
      "basic",
      "solid",
    ]);
    const invalid = analysis() as unknown as { overall: { level: string } };
    invalid.overall.level = "expert";
    expect(() => validateGithubProfileAnalysis(snapshot(), invalid)).toThrow();
  });

  it("resolves citations and exact quotes only from the retained snapshot", () => {
    const proposal = analysis();
    proposal.technologies[0]!.supports[0]!.quote = '"react":"19"';
    const result = projectGithubProfile(snapshot(), proposal);
    const reference = result.technologies.find(
      (item) => item.technologyId === "framework:React",
    )!.inference!.citations[0];
    expect(reference).toMatchObject({
      evidenceId: "file-1",
      repositoryId: 1,
      path: "package.json",
      quote: '"react":"19"',
      sourceUrl: `https://github.com/learner/project-1/blob/${"a".repeat(40)}/package.json`,
    });
    expect(reference).not.toHaveProperty("text");
  });

  it.each(["technologies", "areas", "overall"] as const)(
    "requires nonempty supporting evidence for %s",
    (field) => {
      const proposal = analysis();
      if (field === "overall") proposal.overall!.supports = [];
      else proposal[field][0]!.supports = [];
      expect(() =>
        validateGithubProfileAnalysis(snapshot(), proposal),
      ).toThrow();
    },
  );

  it.each([
    ["unknown evidence", { evidenceId: "invented" }],
    [
      "unknown observation",
      { observationId: "framework:Django:declared_dependency" },
    ],
    ["cross-repository attribution", { repositoryId: 2 }],
    ["wrong technology evidence", { evidenceId: "languages-1" }],
    ["fabricated quote", { quote: "expert React developer" }],
    ["normalized rather than exact quote", { quote: '"react": "19"' }],
    ["fabricated citation URL", { sourceUrl: "https://example.invalid/proof" }],
  ])("rejects %s", (_name, change) => {
    const proposal = analysis();
    Object.assign(proposal.technologies[0]!.supports[0]!, change);
    expect(() => validateGithubProfileAnalysis(snapshot(), proposal)).toThrow();
  });

  it("does not let a known observation from another technology support a fabricated identity", () => {
    const proposal = analysis();
    proposal.technologies[0]!.technologyId = "framework:Django";
    expect(() => validateGithubProfileAnalysis(snapshot(), proposal)).toThrow(
      GithubProfileAnalysisError,
    );
  });

  it("rejects quotes on language-byte evidence", () => {
    const proposal = analysis();
    proposal.overall!.supports = [
      {
        observationId: "language:TypeScript:language_bytes",
        evidenceId: "languages-1",
        repositoryId: 1,
        quote: "TypeScript",
      },
    ];
    expect(() => validateGithubProfileAnalysis(snapshot(), proposal)).toThrow(
      GithubProfileAnalysisError,
    );
  });

  it.each(["fork", "empty", "capped"] as const)(
    "rejects references to a %s repository",
    (disposition) => {
      const source = snapshot();
      source.repositories[0]!.disposition = disposition;
      expect(() => validateGithubProfileAnalysis(source, analysis())).toThrow(
        GithubProfileAnalysisError,
      );
    },
  );

  it("rejects references to unlisted repositories", () => {
    const source = snapshot();
    source.repositories = source.repositories.filter((item) => item.id !== 1);
    expect(() => validateGithubProfileAnalysis(source, analysis())).toThrow();
  });

  it("rejects excluded evidence instead of accepting a merely resolvable ID", () => {
    expect(() =>
      validateGithubProfileAnalysis(snapshot(), analysis(), [1]),
    ).toThrow();
  });

  it.each(["missing", "unavailable"] as const)(
    "rejects file evidence whose retained file state is %s",
    (state) => {
      const source = snapshot();
      source.repositories[0]!.files[0]!.state = state;
      expect(() => validateGithubProfileAnalysis(source, analysis())).toThrow();
    },
  );

  it.each([
    "wrong-commit",
    "wrong-file-id",
    "wrong-url",
    "duplicate-evidence",
    "duplicate-repository",
  ])("rejects inconsistent snapshot provenance: %s", (change) => {
    const source = snapshot();
    if (change === "wrong-commit")
      source.repositories[0]!.commitSha = "c".repeat(40);
    if (change === "wrong-file-id")
      source.repositories[0]!.files[0]!.evidenceId = "other";
    if (change === "wrong-url")
      source.evidence[0]!.sourceUrl =
        "https://github.com/learner/project-2/blob/fake/package.json";
    if (change === "duplicate-evidence")
      source.evidence.push(source.evidence[0]!);
    if (change === "duplicate-repository")
      source.repositories.push(source.repositories[0]!);
    expect(() => projectGithubProfile(source, analysis())).toThrow();
  });

  it.each([
    "weaknesses",
    "missingTests",
    "mastery",
    "score",
    "gaps",
    "sourceUrl",
  ])("rejects unsupported structural claim %s", (field) => {
    expect(() =>
      validateGithubProfileAnalysis(snapshot(), {
        ...analysis(),
        [field]: "no evidence therefore weak",
      }),
    ).toThrow();
    const proposal = analysis();
    Object.assign(proposal.technologies[0]!, {
      [field]: "no evidence therefore weak",
    });
    expect(() => validateGithubProfileAnalysis(snapshot(), proposal)).toThrow();
  });

  it("rejects model URLs in prose rather than turning them into citations", () => {
    const proposal = analysis();
    proposal.overall!.summary = "Evidence: https://example.invalid/fabricated";
    expect(() => validateGithubProfileAnalysis(snapshot(), proposal)).toThrow();
  });

  it("does not claim arbitrary prose is semantically verified", () => {
    const proposal = analysis();
    // Structurally linked prose is still untrusted; this test documents the semantic limit.
    proposal.overall!.summary = "Không có kiểm thử nên yếu kiểm thử.";
    const result = projectGithubProfile(snapshot(), proposal);
    expect(result.overall?.semanticVerification).toBe("unverified");
    expect(result.limitations.freeTextSemanticsVerified).toBe(false);
  });

  it("recomputes facts and removes entire dependent inferences without a replacement generation", () => {
    const result = projectGithubProfile(snapshot(), analysis(), {
      excludedRepositoryIds: [1],
    });
    const react = result.technologies.find(
      (item) => item.technologyId === "framework:React",
    )!;
    expect(react.observations[0]).toMatchObject({
      repositoryIds: [2],
      evidenceIds: ["file-2"],
    });
    expect(react.inference).toBeNull();
    expect(react.usage).toBeNull();
    expect(result.areas).toEqual([]);
    expect(result.overall).toBeNull();
    expect(result.summaryState).toBe("invalidated");
    expect(result.factualSummary).toContain(
      "React: được khai báo trong file phụ thuộc của 1 repo.",
    );
    expect(
      result.technologies
        .flatMap((item) => item.observations)
        .flatMap((item) => item.citations)
        .every((ref) => ref.repositoryId === 2),
    ).toBe(true);
  });

  it("drops a multi-source inference in full if any supporting source is excluded", () => {
    const proposal = analysis();
    proposal.technologies[0]!.supports.push(reactRef(2));
    expect(
      projectGithubProfile(snapshot(), proposal, {
        excludedRepositoryIds: [1],
      }).technologies.find((item) => item.technologyId === "framework:React")!
        .inference,
    ).toBeNull();
  });

  it("retains unaffected inference when the removed repo was not supporting it", () => {
    const result = projectGithubProfile(snapshot(), analysis(), {
      excludedRepositoryIds: [2],
    });
    expect(result.overall).not.toBeNull();
    expect(result.summaryState).toBe("provided");
  });

  it("hiding a technology removes dependent areas and summary", () => {
    const result = projectGithubProfile(snapshot(), analysis(), {
      technologies: [{ technologyId: "framework:React", hidden: true }],
    });
    expect(
      result.technologies.some(
        (item) => item.technologyId === "framework:React",
      ),
    ).toBe(false);
    expect(result.areas).toEqual([]);
    expect(result.overall).toBeNull();
    expect(result.summaryState).toBe("invalidated");
  });

  it("learner usage wins over generation and invalidates its dependent summary", () => {
    const result = projectGithubProfile(snapshot(), analysis(), {
      technologies: [{ technologyId: "framework:React", usage: "tried" }],
    });
    expect(
      result.technologies.find(
        (item) => item.technologyId === "framework:React",
      ),
    ).toMatchObject({
      usage: "tried",
      usageSource: "learner",
      learnerEdited: true,
    });
    expect(
      result.technologies.find(
        (item) => item.technologyId === "framework:React",
      )?.inference,
    ).toBeNull();
    expect(result.areas).toEqual([]);
    expect(result.overall).toBeNull();
    expect(result.summaryState).toBe("invalidated");
  });

  it("preserves orphan overrides and merges them back after reanalysis", () => {
    const edits = {
      excludedRepositoryIds: [1, 2],
      technologies: [{ technologyId: "framework:React", usage: "tried" }],
      areas: [{ areaId: "frontend", hidden: true }],
    };
    const result = projectGithubProfile(snapshot(), analysis(), edits);
    expect(result.technologies).toEqual([]);
    expect(result.corrections).toEqual(edits);
    const restored = projectGithubProfile(snapshot(), analysis(), {
      ...result.corrections,
      excludedRepositoryIds: [],
    });
    expect(
      restored.technologies.find(
        (item) => item.technologyId === "framework:React",
      )?.usage,
    ).toBe("tried");
    expect(restored.areas).toEqual([]);
  });

  it("keeps learner corrections authoritative over a different later generation", () => {
    const edits = {
      technologies: [{ technologyId: "framework:React", usage: "tried" }],
      areas: [{ areaId: "frontend", hidden: true }],
    };
    const original = projectGithubProfile(snapshot(), analysis(), edits);
    const later = analysis();
    later.technologies[0]!.usage = "deep";
    later.technologies[0]!.supports = [reactRef(2)];
    later.areas[0]!.label = "Giao diện được phân tích lại";
    const result = projectGithubProfile(
      snapshot(),
      later,
      original.corrections,
    );
    expect(
      result.technologies.find(
        (item) => item.technologyId === "framework:React",
      ),
    ).toMatchObject({
      usage: "tried",
      usageSource: "learner",
      inference: null,
    });
    expect(result.areas).toEqual([]);
    expect(result.corrections).toEqual(original.corrections);
  });

  it("hiding an area invalidates the summary without inventing a revised one", () => {
    const result = projectGithubProfile(snapshot(), analysis(), {
      areas: [{ areaId: "frontend", hidden: true }],
    });
    expect(result.areas).toEqual([]);
    expect(result.overall).toBeNull();
    expect(result.summaryState).toBe("invalidated");
    expect(result.factualSummary.length).toBeGreaterThan(0);
  });

  it.each(["complete", "partial", "failed"] as const)(
    "keeps %s collection status separate from no observations",
    (status) => {
      const source = snapshot();
      source.status = status;
      source.evidence = [];
      source.repositories.forEach((item) => {
        item.files = [];
      });
      source.coverage.listingComplete = status === "complete";
      source.issues = [
        {
          operation: "listing",
          code: "rate_limited",
          retryAt: "2026-10-20T01:00:00Z",
        },
      ];
      const result = projectGithubProfile(source, null);
      expect(result.collectionStatus).toBe(status);
      expect(result.observationAvailability).toBe("none_observed");
      expect(result.limitations.issues).toEqual(source.issues);
      expect(result.limitations.noObservationsDoesNotProveWeakness).toBe(true);
      expect(result).not.toHaveProperty("insufficientData");
      expect(result.overall).toBeNull();
    },
  );

  it("does not infer a new/beginner level from an empty evidence set", () => {
    const source = snapshot();
    source.evidence = [];
    expect(() => validateGithubProfileAnalysis(source, analysis())).toThrow();
  });

  it("rejects duplicate generated identities and ambiguous corrections", () => {
    const proposal = analysis();
    proposal.technologies.push(proposal.technologies[0]!);
    expect(() => validateGithubProfileAnalysis(snapshot(), proposal)).toThrow();
    expect(() =>
      projectGithubProfile(snapshot(), null, {
        technologies: [
          { technologyId: "framework:React", usage: "deep" },
          { technologyId: "framework:React", usage: "tried" },
        ],
      }),
    ).toThrow();
    expect(() =>
      projectGithubProfile(snapshot(), null, {
        areas: [
          { areaId: "frontend", hidden: true },
          { areaId: "frontend", hidden: false },
        ],
      }),
    ).toThrow();
  });

  it("never mutates stored snapshot, generation or correction input", () => {
    const source = snapshot();
    const proposal = analysis();
    const edits = {
      technologies: [{ technologyId: "framework:React", usage: "deep" }],
    };
    const before = JSON.stringify([source, proposal, edits]);
    const result = projectGithubProfile(source, proposal, edits);
    result.corrections.technologies[0]!.usage = "tried";
    result.limitations.coverage.limits.requests = 0;
    expect(JSON.stringify([source, proposal, edits])).toBe(before);
  });

  it("accepts an explicitly empty generation without inventing estimates", () => {
    expect(
      githubProfileAnalysisSchema.parse({
        technologies: [],
        areas: [],
        overall: null,
      }),
    ).toEqual({ technologies: [], areas: [], overall: null });
    expect(
      projectGithubProfile(snapshot(), {
        technologies: [],
        areas: [],
        overall: null,
      }).summaryState,
    ).toBe("not_provided");
  });

  it("exposes display-only repository fields with the top language by positive bytes", () => {
    const source = snapshot();
    source.repositories[0]!.pushedAt = "2026-10-01T00:00:00Z";
    const evidence = source.evidence.find(
      (item) => item.repositoryId === 1 && item.kind === "languages",
    );
    if (evidence?.kind !== "languages") throw new Error("fixture changed");
    evidence.bytes = { CSS: 10, TypeScript: 90, Python: 0 };
    const projection = projectGithubProfile(source, null);
    const [first, second] = projection.limitations.repositories;
    expect(first).toMatchObject({
      id: 1,
      owner: "learner",
      name: "project-1",
      pushedAt: "2026-10-01T00:00:00Z",
      topLanguage: "TypeScript",
    });
    expect(second).toMatchObject({ pushedAt: null, owner: "learner" });
  });
});
