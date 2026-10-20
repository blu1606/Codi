import type {
  GithubCollectionSnapshot,
  GithubTechnologyObservation,
} from "./github-profile-contract";

const DEPENDENCIES: Record<
  string,
  { technology: string; kind: "framework" | "tool" }
> = {
  react: { technology: "React", kind: "framework" },
  next: { technology: "Next.js", kind: "framework" },
  vue: { technology: "Vue", kind: "framework" },
  express: { technology: "Express", kind: "framework" },
  "@nestjs/core": { technology: "NestJS", kind: "framework" },
  django: { technology: "Django", kind: "framework" },
  fastapi: { technology: "FastAPI", kind: "framework" },
  flask: { technology: "Flask", kind: "framework" },
  typescript: { technology: "TypeScript", kind: "tool" },
  vitest: { technology: "Vitest", kind: "tool" },
  jest: { technology: "Jest", kind: "tool" },
  "@playwright/test": { technology: "Playwright", kind: "tool" },
  "drizzle-orm": { technology: "Drizzle ORM", kind: "tool" },
  prisma: { technology: "Prisma", kind: "tool" },
};

function declaredDependencies(path: string, text: string): string[] {
  if (path === "package.json") {
    try {
      const manifest: unknown = JSON.parse(text);
      if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
        return [];
      const record = manifest as Record<string, unknown>;
      return [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ].flatMap((key) => {
        const section = record[key];
        if (!section || typeof section !== "object" || Array.isArray(section))
          return [];
        return Object.entries(section)
          .filter(([, value]) => typeof value === "string")
          .map(([name]) => name);
      });
    } catch {
      return [];
    }
  }
  // Deliberately narrow: no include/URL execution, fuzzy prose matching, or version interpretation.
  if (path === "requirements.txt") {
    return text.split(/\r?\n/).flatMap((line) => {
      const match =
        /^\s*([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\[[^\]]+\])?\s*(?:[<>=!~;#]|$)/.exec(
          line,
        );
      return match ? [match[1]!.toLowerCase()] : [];
    });
  }
  return [];
}

/** Positive observations only. Recompute learner exclusions without any network reads. */
export function extractGithubTechnologies(
  snapshot: GithubCollectionSnapshot,
  excludedRepositoryIds: readonly number[] = [],
): GithubTechnologyObservation[] {
  const excluded = new Set(excludedRepositoryIds);
  const selected = new Set(
    snapshot.repositories
      .filter((repo) => repo.disposition === "selected")
      .map((repo) => repo.id),
  );
  const observations = new Map<string, GithubTechnologyObservation>();
  const add = (
    technology: string,
    kind: GithubTechnologyObservation["kind"],
    signal: GithubTechnologyObservation["signal"],
    repositoryId: number,
    evidenceId: string,
    bytes?: number,
  ) => {
    const key = `${signal}:${technology}`;
    const item = observations.get(key) ?? {
      technology,
      kind,
      signal,
      repositoryIds: [],
      evidenceIds: [],
      ...(bytes === undefined ? {} : { languageBytes: 0 }),
    };
    if (!item.repositoryIds.includes(repositoryId))
      item.repositoryIds.push(repositoryId);
    if (!item.evidenceIds.includes(evidenceId)) {
      item.evidenceIds.push(evidenceId);
      if (bytes !== undefined)
        item.languageBytes = (item.languageBytes ?? 0) + bytes;
    }
    observations.set(key, item);
  };
  for (const evidence of snapshot.evidence) {
    if (
      excluded.has(evidence.repositoryId) ||
      !selected.has(evidence.repositoryId)
    )
      continue;
    if (evidence.kind === "languages") {
      for (const [name, bytes] of Object.entries(evidence.bytes)) {
        if (Number.isSafeInteger(bytes) && bytes > 0)
          add(
            name,
            "language",
            "language_bytes",
            evidence.repositoryId,
            evidence.id,
            bytes,
          );
      }
    } else {
      for (const dependency of declaredDependencies(
        evidence.path,
        evidence.text,
      )) {
        if (!Object.hasOwn(DEPENDENCIES, dependency)) continue;
        const mapped = DEPENDENCIES[dependency]!;
        add(
          mapped.technology,
          mapped.kind,
          "declared_dependency",
          evidence.repositoryId,
          evidence.id,
        );
      }
    }
  }
  return [...observations.values()]
    .map((item) => ({
      ...item,
      repositoryIds: item.repositoryIds.sort((a, b) => a - b),
      evidenceIds: item.evidenceIds.sort(),
    }))
    .sort(
      (a, b) =>
        a.technology.localeCompare(b.technology, "en") ||
        a.signal.localeCompare(b.signal, "en"),
    );
}
