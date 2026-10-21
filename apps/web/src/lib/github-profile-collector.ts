import { createHash } from "node:crypto";
import { z } from "zod";

import {
  GITHUB_MANIFEST_PATHS,
  GITHUB_PROFILE_LIMITS,
} from "./github-profile-contract";
import type {
  GithubCollectionSnapshot,
  GithubProfileLimits,
  GithubReadCode,
  GithubReadIssue,
  GithubRepositorySnapshot,
} from "./github-profile-contract";

const loginSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/);
const idSchema = z.number().int().positive().safe();
const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const nameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]{1,100}$/)
  .refine((name) => name !== "." && name !== "..");
const branchSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (branch) =>
      !branch
        .split("/")
        .some((part) => !part || part === "." || part === "..") &&
      !/[\x00-\x1f\x7f]/.test(branch),
  );
const identitySchema = z.object({ databaseId: idSchema, login: loginSchema });
const repoSchema = z.object({
  databaseId: idSchema,
  name: nameSchema,
  owner: identitySchema,
  isPrivate: z.literal(false),
  visibility: z.literal("PUBLIC"),
  isFork: z.boolean(),
  isEmpty: z.boolean(),
  diskUsage: z.number().int().nonnegative().safe().nullable(),
  pushedAt: z.iso.datetime({ offset: true }).nullable(),
  defaultBranchRef: z
    .object({
      name: branchSchema,
      target: z.object({ __typename: z.literal("Commit"), oid: shaSchema }),
    })
    .nullable(),
  // Validate separately so unavailable/truncated languages do not erase safe file evidence.
  languages: z.unknown(),
});
const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().min(1).max(1024).nullable(),
});
const languagesSchema = z.object({
  edges: z
    .array(
      z.object({
        size: z.number().int().nonnegative().safe(),
        node: z.object({ name: z.string().min(1).max(80) }),
      }),
    )
    .max(100),
  pageInfo: z.object({ hasNextPage: z.boolean() }),
});
// Only public owned metadata. Never add contribution aggregates or private content here.
const repositoryQuery = `query CodiPublicProfile($first: Int!, $after: String) {
  viewer {
    databaseId login
    repositories(first: $first, after: $after, privacy: PUBLIC,
      ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        databaseId name isPrivate visibility isFork isEmpty diskUsage pushedAt
        owner { login ... on User { databaseId } }
        defaultBranchRef { name target { __typename ... on Commit { oid } } }
        languages(first: 100, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name } }
          pageInfo { hasNextPage }
        }
      }
    }
  }
}`;
const graphqlEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        type: z.string().optional(),
        extensions: z
          .object({
            type: z.string().optional(),
            code: z.string().optional(),
          })
          .passthrough()
          .optional(),
      }),
    )
    .min(1)
    .optional(),
});
const directorySchema = z
  .array(
    z.object({
      name: z.string().max(255),
      type: z.string().max(30),
      sha: z.string().max(64),
      size: z.number().nonnegative().safe(),
    }),
  )
  .max(1000);
const fileSchema = z.object({
  type: z.literal("file"),
  sha: shaSchema,
  size: z.number().int().nonnegative().safe(),
  encoding: z.literal("base64"),
  content: z.string(),
});
const publicAccessSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("anonymous") }),
  z.strictObject({
    mode: z.literal("oauth_app"),
    clientId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9_-]+$/),
    clientSecret: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[\x21-\x7e]+$/),
  }),
]);

export type GithubPublicAccess = z.infer<typeof publicAccessSchema>;

export interface GithubCollectorInput {
  /** Immutable GitHub numeric subject, NOT the Better Auth local account-row ID. */
  githubUserId: string;
  accessToken: string;
  /** Trusted public REST access mode; GraphQL always uses the linked-user bearer. */
  publicAccess: GithubPublicAccess;
}

export interface GithubCollectorOptions {
  /** Transport seam for deterministic tests; callers must not supply an untrusted transport. */
  fetch?: typeof globalThis.fetch;
  /** May lower, never raise, the accepted safety ceilings. */
  limits?: Partial<GithubProfileLimits>;
}

class ReadFailure extends Error {
  constructor(
    readonly code: GithubReadCode,
    readonly httpStatus?: number,
    readonly retryAt?: string,
  ) {
    super(code);
  }
}

function rateLimitTime(headers: Headers): string | undefined {
  const retry = headers.get("retry-after");
  const reset = headers.get("x-ratelimit-reset");
  const retryMs =
    retry && /^\d+$/.test(retry)
      ? Date.now() + Number(retry) * 1000
      : retry
        ? Date.parse(retry)
        : NaN;
  const resetMs = reset && /^\d+$/.test(reset) ? Number(reset) * 1000 : NaN;
  const timestamp = Math.max(
    Number.isFinite(retryMs) ? retryMs : 0,
    Number.isFinite(resetMs) ? resetMs : 0,
  );
  return timestamp > 0 && timestamp <= 8.64e15
    ? new Date(timestamp).toISOString()
    : undefined;
}

/**
 * Server-only collector. Caller establishes session-owned linkage and analysis consent first.
 * Two repository workers share request/byte/time ceilings; identity/listing finish first.
 */
export async function collectGithubProfile(
  input: GithubCollectorInput,
  options: GithubCollectorOptions = {},
): Promise<GithubCollectionSnapshot> {
  const started = performance.now();
  const limits = { ...GITHUB_PROFILE_LIMITS, ...options.limits };
  const snapshot: GithubCollectionSnapshot = {
    version: 1,
    status: "failed",
    identity: null,
    collectedAt: new Date().toISOString(),
    repositories: [],
    evidence: [],
    issues: [],
    coverage: {
      publicAccess:
        input.publicAccess?.mode === "oauth_app"
          ? "oauth_app"
          : input.publicAccess?.mode === "anonymous"
            ? "anonymous"
            : null,
      listingComplete: false,
      listed: 0,
      selected: 0,
      requests: 0,
      responseBytes: 0,
      elapsedMs: 0,
      limits,
    },
  };
  const publicAccess = publicAccessSchema.safeParse(input.publicAccess);
  if (
    typeof window !== "undefined" ||
    !/^[1-9]\d*$/.test(input.githubUserId) ||
    !Number.isSafeInteger(Number(input.githubUserId)) ||
    typeof input.accessToken !== "string" ||
    !input.accessToken ||
    input.accessToken.length > 8192 ||
    /[\s\x00-\x1f\x7f]/.test(input.accessToken) ||
    !publicAccess.success ||
    Object.entries(limits).some(
      ([key, value]) =>
        !Number.isSafeInteger(value) ||
        value < 1 ||
        value > GITHUB_PROFILE_LIMITS[key as keyof GithubProfileLimits],
    )
  ) {
    snapshot.issues.push({ operation: "identity", code: "invalid_input" });
    return snapshot;
  }
  const appCredentials =
    publicAccess.data.mode === "oauth_app" ? publicAccess.data : null;
  const basic = appCredentials
    ? Buffer.from(
        `${appCredentials.clientId}:${appCredentials.clientSecret}`,
      ).toString("base64")
    : null;
  const credentials = [
    input.accessToken,
    ...(appCredentials ? [appCredentials.clientSecret, basic!] : []),
  ];
  const containsCredentials = (text: string) =>
    credentials.some((credential) => text.includes(credential));
  const containsStructuredCredentials = (value: unknown) => {
    const pending: unknown[] = [value];
    while (pending.length) {
      const item = pending.pop();
      if (typeof item === "string" && containsCredentials(item)) return true;
      if (item && typeof item === "object") {
        for (const [key, nested] of Object.entries(item)) {
          if (containsCredentials(key)) return true;
          pending.push(nested);
        }
      }
    }
    return false;
  };
  const transport = options.fetch ?? globalThis.fetch;
  let stopped = false;
  const issue = (scope: Omit<GithubReadIssue, "code">, error: unknown) => {
    const failure =
      error instanceof ReadFailure
        ? error
        : new ReadFailure("invalid_response");
    snapshot.issues.push({
      ...scope,
      code: failure.code,
      ...(failure.httpStatus === undefined
        ? {}
        : { httpStatus: failure.httpStatus }),
      ...(failure.retryAt === undefined ? {} : { retryAt: failure.retryAt }),
    });
    if (
      [
        "rate_limited",
        "connection_expired",
        "identity_mismatch",
        "app_auth_failed",
        "request_limit",
        "aggregate_limit",
        "total_timeout",
      ].includes(failure.code)
    )
      stopped = true;
    return failure.code;
  };
  const request = async (
    path: string,
    variables?: { first: number; after: string | null },
  ): Promise<unknown> => {
    const graphql = variables !== undefined;
    const remainingMs = limits.totalMs - (performance.now() - started);
    if (remainingMs <= 0) throw new ReadFailure("total_timeout");
    if (snapshot.coverage.requests >= limits.requests)
      throw new ReadFailure("request_limit");
    if (snapshot.coverage.responseBytes >= limits.aggregateBytes)
      throw new ReadFailure("aggregate_limit");
    const url = new URL(`https://api.github.com${path}`);
    // Paths are constructed below, never sourced from Link, html_url or download_url.
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      url.origin !== "https://api.github.com" ||
      url.username ||
      url.password
    )
      throw new ReadFailure("invalid_response");
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadlineCode =
      remainingMs <= limits.requestMs ? "total_timeout" : "request_timeout";
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          controller.abort();
          reject(new ReadFailure(deadlineCode));
        },
        Math.min(remainingMs, limits.requestMs),
      );
    });
    snapshot.coverage.requests++;
    try {
      return await Promise.race([
        timeout,
        (async () => {
          const response = await transport(url.toString(), {
            method: graphql ? "POST" : "GET",
            ...(graphql
              ? {
                  body: JSON.stringify({
                    query: repositoryQuery,
                    operationName: "CodiPublicProfile",
                    variables,
                  }),
                }
              : {}),
            redirect: "error",
            credentials: "omit",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "Codi-GitHub-Profile",
              ...(graphql ? { "Content-Type": "application/json" } : {}),
              ...(graphql
                ? { Authorization: `Bearer ${input.accessToken}` }
                : basic
                  ? { Authorization: `Basic ${basic}` }
                  : {}),
            },
          });
          // A custom transport can finish after abort; do not consume or mutate the snapshot then.
          if (controller.signal.aborted) {
            void response.body?.cancel().catch(() => undefined);
            throw new ReadFailure(deadlineCode);
          }
          if (
            response.redirected ||
            (response.status >= 300 && response.status < 400) ||
            (response.url && response.url !== url.toString())
          )
            throw new ReadFailure("redirect_rejected", response.status);
          if (
            response.status === 429 ||
            (response.status === 403 &&
              (response.headers.get("x-ratelimit-remaining") === "0" ||
                response.headers.has("retry-after")))
          ) {
            throw new ReadFailure(
              "rate_limited",
              response.status,
              rateLimitTime(response.headers),
            );
          }
          if (!response.ok && response.status !== 403)
            throw new ReadFailure(
              response.status === 401
                ? graphql
                  ? "connection_expired"
                  : appCredentials
                    ? "app_auth_failed"
                    : "http_error"
                : response.status === 404
                  ? "not_found"
                  : "http_error",
              response.status,
            );
          const declared = response.headers.get("content-length");
          if (declared && /^\d+$/.test(declared)) {
            if (Number(declared) > limits.responseBytes)
              throw new ReadFailure("response_limit");
            if (
              Number(declared) >
              limits.aggregateBytes - snapshot.coverage.responseBytes
            )
              throw new ReadFailure("aggregate_limit");
          }
          if (!response.body) throw new ReadFailure("invalid_response");
          reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const chunk = await reader.read();
            if (controller.signal.aborted) throw new ReadFailure(deadlineCode);
            if (chunk.done) break;
            const aggregateRemaining =
              limits.aggregateBytes - snapshot.coverage.responseBytes;
            const responseRemaining = limits.responseBytes - size;
            snapshot.coverage.responseBytes += Math.min(
              chunk.value.byteLength,
              aggregateRemaining,
              responseRemaining,
            );
            if (chunk.value.byteLength > aggregateRemaining)
              throw new ReadFailure("aggregate_limit");
            if (chunk.value.byteLength > responseRemaining)
              throw new ReadFailure("response_limit");
            size += chunk.value.byteLength;
            chunks.push(chunk.value);
          }
          const text = Buffer.concat(chunks, size).toString("utf8");
          let parsed: unknown;
          try {
            parsed = JSON.parse(text) as unknown;
          } catch {
            throw new ReadFailure(
              response.status === 403 ? "http_error" : "invalid_response",
              response.status,
            );
          }
          if (graphql) {
            const validated = graphqlEnvelopeSchema.safeParse(parsed);
            if (!validated.success) throw new ReadFailure("invalid_response");
            const envelope = validated.data;
            if (envelope.errors) {
              const labels = envelope.errors
                .flatMap((error) => [
                  error.type,
                  error.extensions?.type,
                  error.extensions?.code,
                  error.message,
                ])
                .filter((label): label is string => typeof label === "string");
              if (
                labels.some((label) =>
                  /rate[_ -]?limit|abuse detection/i.test(label),
                )
              )
                throw new ReadFailure(
                  "rate_limited",
                  response.status,
                  rateLimitTime(response.headers) ??
                    new Date(Date.now() + 60_000).toISOString(),
                );
              if (
                labels.some((label) =>
                  /^(?:UNAUTHENTICATED|BAD_CREDENTIALS)$|bad credentials|requires authentication|token (?:has )?expired/i.test(
                    label,
                  ),
                )
              )
                throw new ReadFailure("connection_expired", response.status);
              // Discard the entire errored page, retaining only earlier validated pages.
              throw new ReadFailure(
                envelope.data == null ? "graphql_error" : "graphql_partial",
                response.status,
              );
            }
          }
          if (response.status === 403) {
            const message = z.object({ message: z.string() }).safeParse(parsed);
            if (
              message.success &&
              /(?:secondary rate limit|api rate limit exceeded|abuse detection)/i.test(
                message.data.message,
              )
            ) {
              throw new ReadFailure(
                "rate_limited",
                403,
                rateLimitTime(response.headers) ??
                  new Date(Date.now() + 60_000).toISOString(),
              );
            }
            throw new ReadFailure(
              appCredentials && !graphql ? "app_auth_failed" : "http_error",
              403,
            );
          }
          // Do not echo credential-bearing upstream text, even from a test/custom transport.
          if (
            containsCredentials(text) ||
            containsStructuredCredentials(parsed)
          )
            throw new ReadFailure("invalid_response");
          return parsed;
        })(),
      ]);
    } catch (error) {
      throw error instanceof ReadFailure
        ? error
        : new ReadFailure(
            controller.signal.aborted ? deadlineCode : "network_error",
          );
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      if (reader) void reader.cancel().catch(() => undefined);
    }
  };
  const finish = () => {
    snapshot.coverage.elapsedMs = Math.round(performance.now() - started);
    snapshot.coverage.listed = snapshot.repositories.length;
    snapshot.coverage.selected = snapshot.repositories.filter(
      (repo) => repo.disposition === "selected",
    ).length;
    snapshot.status = !snapshot.identity
      ? "failed"
      : snapshot.issues.length ||
          !snapshot.coverage.listingComplete ||
          snapshot.repositories.some((repo) => repo.disposition === "capped")
        ? "partial"
        : "complete";
    return snapshot;
  };
  const seen = new Set<number>();
  const cursors = new Set<string>();
  const repositoryLanguages = new Map<
    number,
    { value: unknown; collectedAt: string }
  >();
  let after: string | null = null;
  for (
    let page = 1;
    !stopped && snapshot.repositories.length < limits.listedRepos;
    page++
  ) {
    const perPage = Math.min(
      100,
      limits.listedRepos - snapshot.repositories.length,
    );
    try {
      const response = z
        .object({
          data: z.object({
            viewer: z.object({
              databaseId: idSchema,
              login: loginSchema,
              repositories: z.unknown(),
            }),
          }),
        })
        .parse(await request("/graphql", { first: perPage, after }));
      const viewer = response.data.viewer;
      if (
        String(viewer.databaseId) !== input.githubUserId ||
        (snapshot.identity &&
          viewer.login.toLowerCase() !== snapshot.identity.login.toLowerCase())
      )
        throw new ReadFailure("identity_mismatch");
      snapshot.identity = {
        id: String(viewer.databaseId),
        login: viewer.login,
      };
      const connection = z
        .object({
          nodes: z.array(repoSchema).max(perPage),
          pageInfo: pageInfoSchema,
        })
        .parse(viewer.repositories);
      const data = connection.nodes;
      if (
        data.some(
          (repo) =>
            String(repo.owner.databaseId) !== input.githubUserId ||
            repo.owner.login.toLowerCase() !== viewer.login.toLowerCase() ||
            seen.has(repo.databaseId),
        ) ||
        new Set(data.map((repo) => repo.databaseId)).size !== data.length
      )
        throw new ReadFailure("invalid_response");
      const { hasNextPage, endCursor } = connection.pageInfo;
      if (hasNextPage && (!data.length || !endCursor || cursors.has(endCursor)))
        throw new ReadFailure("invalid_response");
      const collectedAt = new Date().toISOString();
      for (const repo of data) {
        seen.add(repo.databaseId);
        repositoryLanguages.set(repo.databaseId, {
          value: repo.languages,
          collectedAt,
        });
        snapshot.repositories.push({
          id: repo.databaseId,
          owner: repo.owner.login,
          name: repo.name,
          pushedAt: repo.pushedAt,
          // Empty repositories may have no default ref; no branch is invented.
          defaultBranch: repo.defaultBranchRef?.name ?? "",
          disposition: repo.isFork ? "fork" : repo.isEmpty ? "empty" : "capped",
          commitSha: repo.defaultBranchRef?.target.oid ?? null,
          files: [],
        });
      }
      if (!hasNextPage) {
        snapshot.coverage.listingComplete = true;
        break;
      }
      after = endCursor;
      cursors.add(endCursor!);
      if (
        page >= Math.ceil(limits.listedRepos / 100) ||
        snapshot.repositories.length >= limits.listedRepos
      ) {
        issue({ operation: "listing" }, new ReadFailure("pagination_limit"));
        break;
      }
    } catch (error) {
      issue({ operation: snapshot.identity ? "listing" : "identity" }, error);
      break;
    }
  }
  if (!snapshot.identity) return finish();
  snapshot.repositories.sort(
    (a, b) =>
      (b.pushedAt ? Date.parse(b.pushedAt) : 0) -
        (a.pushedAt ? Date.parse(a.pushedAt) : 0) || a.id - b.id,
  );
  const selected = snapshot.repositories
    .filter((repo) => repo.disposition === "capped")
    .slice(0, limits.selectedRepos);
  for (const repo of selected) repo.disposition = "selected";
  // Language observations were batched with metadata, not fetched from repository files.
  for (const repo of selected) {
    try {
      const observation = repositoryLanguages.get(repo.id)!;
      const languages = languagesSchema.parse(observation.value);
      if (languages.pageInfo.hasNextPage)
        throw new ReadFailure("language_limit");
      const names = languages.edges.map((edge) => edge.node.name);
      if (new Set(names).size !== names.length)
        throw new ReadFailure("invalid_response");
      const collectedAt = observation.collectedAt;
      snapshot.evidence.push({
        id: `repo:${repo.id}:languages:${collectedAt}`,
        kind: "languages",
        repositoryId: repo.id,
        collectedAt,
        // Official equivalent language-byte evidence endpoint, not a claim of REST transport.
        sourceUrl: `https://api.github.com/repos/${repo.owner}/${repo.name}/languages`,
        bytes: Object.fromEntries(
          languages.edges
            .sort((a, b) => a.node.name.localeCompare(b.node.name, "en"))
            .map((edge) => [edge.node.name, edge.size]),
        ),
      });
    } catch (error) {
      issue({ repositoryId: repo.id, operation: "languages" }, error);
    }
  }
  const collectRepository = async (repo: GithubRepositorySnapshot) => {
    if (stopped) return;
    const scope = { repositoryId: repo.id };
    const base = `/repos/${repo.owner}/${repo.name}`;
    if (!repo.commitSha) {
      issue(
        { ...scope, operation: "ref" },
        new ReadFailure("invalid_response"),
      );
      return;
    }
    let directory: z.infer<typeof directorySchema>;
    try {
      directory = directorySchema.parse(
        await request(`${base}/contents?ref=${repo.commitSha}`),
      );
    } catch (error) {
      issue({ ...scope, operation: "directory" }, error);
      return;
    }
    // The Contents API caps directories at 1000 entries. Absence at that ceiling is unknown.
    const directoryCapped = directory.length === 1000;
    if (directoryCapped)
      issue(
        { ...scope, operation: "directory" },
        new ReadFailure("directory_limit"),
      );
    const readme =
      directory
        .filter((entry) =>
          /^readme(?:\.(?:md|markdown|rst|txt))?$/i.test(entry.name),
        )
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))[0]
        ?.name ?? "README.md";
    for (const path of [...GITHUB_MANIFEST_PATHS, readme]) {
      const entry = directory.find((item) => item.name === path);
      const file: GithubRepositorySnapshot["files"][number] = {
        path,
        state: entry || directoryCapped ? "unavailable" : "missing",
      };
      repo.files.push(file);
      if (!entry || stopped) continue;
      if (entry.type !== "file" || !shaSchema.safeParse(entry.sha).success) {
        issue(
          { ...scope, operation: "file", path },
          new ReadFailure("invalid_response"),
        );
        continue;
      }
      if (entry.size > limits.fileBytes) {
        issue(
          { ...scope, operation: "file", path },
          new ReadFailure("file_limit"),
        );
        continue;
      }
      try {
        const data = fileSchema.parse(
          await request(
            `${base}/contents/${encodeURIComponent(path)}?ref=${repo.commitSha}`,
          ),
        );
        const encoded = data.content.replace(/\n/g, "");
        if (
          data.size > limits.fileBytes ||
          encoded.length > Math.ceil(limits.fileBytes / 3) * 4
        )
          throw new ReadFailure("file_limit");
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            encoded,
          )
        )
          throw new ReadFailure("invalid_response");
        const decoded = Buffer.from(encoded, "base64");
        if (decoded.length > limits.fileBytes)
          throw new ReadFailure("file_limit");
        const sha = createHash("sha1")
          .update(`blob ${decoded.length}\0`)
          .update(decoded)
          .digest("hex");
        if (
          data.sha !== entry.sha ||
          sha !== data.sha ||
          decoded.length !== data.size ||
          data.size !== entry.size
        )
          throw new ReadFailure("invalid_response");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
        if (containsCredentials(text))
          throw new ReadFailure("invalid_response");
        const evidenceId = `repo:${repo.id}:commit:${repo.commitSha}:file:${path}:blob:${data.sha}`;
        snapshot.evidence.push({
          id: evidenceId,
          kind: "file",
          repositoryId: repo.id,
          path,
          commitSha: repo.commitSha,
          blobSha: data.sha,
          text,
          collectedAt: new Date().toISOString(),
          sourceUrl: `https://github.com/${repo.owner}/${repo.name}/blob/${repo.commitSha}/${encodeURIComponent(path)}`,
        });
        file.state = "collected";
        file.evidenceId = evidenceId;
      } catch (error) {
        const code = issue({ ...scope, operation: "file", path }, error);
        if (code === "not_found") file.state = "missing";
      }
    }
  };
  let nextRepository = 0;
  const worker = async () => {
    while (!stopped && nextRepository < selected.length) {
      const repo = selected[nextRepository++];
      if (repo) await collectRepository(repo);
    }
  };
  await Promise.all([worker(), worker()]);
  // Completion order must not affect downstream observation selection.
  const order = new Map(selected.map((repo, index) => [repo.id, index]));
  snapshot.evidence.sort(
    (a, b) =>
      (order.get(a.repositoryId) ?? 0) - (order.get(b.repositoryId) ?? 0) ||
      a.id.localeCompare(b.id),
  );
  return finish();
}
