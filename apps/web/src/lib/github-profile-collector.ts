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

const GRAPHQL_URL = "https://api.github.com/graphql";
// Upper bound on repository aliases per batched query; a batch is split, never truncated.
const MAX_ALIASES_PER_QUERY = 100;
const REPOSITORIES_PER_PAGE = 25;
// Regular git blobs only. Symlinks (120000) and gitlinks (160000) are never read.
const REGULAR_FILE_MODES = new Set([0o100644, 0o100755]);
const RATE_LIMIT_MESSAGE =
  /(?:secondary rate limit|api rate limit exceeded|abuse detection)/i;

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
        path: z.array(z.union([z.string(), z.number()])).optional(),
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
const ownerSchema = z.object({
  login: loginSchema,
  databaseId: idSchema.optional(),
});
const treeEntrySchema = z.object({
  name: z.string().max(255),
  type: z.string().max(30),
  mode: z.number().int().nonnegative().safe(),
  oid: shaSchema,
  object: z
    .object({
      byteSize: z.number().int().nonnegative().safe().optional(),
      isBinary: z.boolean().nullish(),
    })
    .nullable(),
});
type TreeEntry = z.infer<typeof treeEntrySchema>;
const treeAliasSchema = z
  .object({
    databaseId: idSchema,
    owner: ownerSchema,
    tree: z.object({ entries: z.array(treeEntrySchema).nullable() }).nullable(),
  })
  .nullable();
const blobAliasSchema = z
  .object({
    databaseId: idSchema,
    blob: z
      .object({
        oid: shaSchema,
        byteSize: z.number().int().nonnegative().safe(),
        isBinary: z.boolean().nullable(),
        isTruncated: z.boolean(),
        text: z.string().nullable(),
      })
      .nullable(),
  })
  .nullable();
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
  /**
   * Trusted operator configuration. GraphQL always uses the linked-user bearer; the app
   * secret is only retained for credential redaction and coverage reporting.
   */
  publicAccess: GithubPublicAccess;
}

export interface GithubCollectorOptions {
  /** Transport seam for deterministic tests; callers must not supply an untrusted transport. */
  fetch?: typeof globalThis.fetch;
  /** May lower, never raise, the accepted safety ceilings. */
  limits?: Partial<GithubProfileLimits>;
  /** Server-owned observer; no identity, query variables, credentials or content. */
  onRequest?: (event: GithubRequestTiming) => void;
}

export interface GithubRequestTiming {
  operation: "listing" | "tree" | "blob";
  ordinal: number;
  elapsedMs: number;
  collectionElapsedMs: number;
  headersMs: number | null;
  httpStatus: number | null;
  outcome: "ok" | GithubReadCode;
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

interface BatchEnvelope {
  data: unknown;
  /** Per-alias GraphQL errors that were attributable to exactly one repository read. */
  aliasErrors: Map<string, ReadFailure>;
}

interface BatchItem {
  repo: GithubRepositorySnapshot;
  expression: string;
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

// Secondary-limit 403 bodies carry no reset header; retry no sooner than a minute out.
const rateLimitRetry = (headers: Headers) =>
  rateLimitTime(headers) ?? new Date(Date.now() + 60_000).toISOString();

/** Query text for one batch; every repository and path value enters via variables. */
function batchQuery(kind: "tree" | "blob", count: number): string {
  const declarations = Array.from(
    { length: count },
    (_, index) =>
      `$o${index}: String!, $n${index}: String!, $e${index}: String!`,
  ).join(", ");
  const selections = Array.from({ length: count }, (_, index) =>
    kind === "tree"
      ? `t${index}: repository(owner: $o${index}, name: $n${index}) { databaseId owner { login ... on User { databaseId } } tree: object(expression: $e${index}) { ... on Tree { entries { name type mode oid object { ... on Blob { byteSize isBinary } } } } } }`
      : `f${index}: repository(owner: $o${index}, name: $n${index}) { databaseId blob: object(expression: $e${index}) { ... on Blob { oid byteSize isBinary isTruncated text } } }`,
  );
  const name = kind === "tree" ? "CodiPublicTrees" : "CodiPublicBlobs";
  return `query ${name}(${declarations}) {\n  ${selections.join("\n  ")}\n}`;
}

/**
 * Server-only collector. Caller establishes session-owned linkage and analysis consent first.
 * Reads are batched GraphQL: listing pages, then one tree query and blob queries per batch.
 * Batches run sequentially, so one request is in flight at a time.
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
  // Redaction set only: the app secret is never sent, but must never be echoed back.
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
  const send = async (
    operationName: string,
    query: string,
    variables: Record<string, unknown>,
    isolatedAliases?: ReadonlySet<string>,
  ): Promise<BatchEnvelope> => {
    const remainingMs = limits.totalMs - (performance.now() - started);
    if (remainingMs <= 0) throw new ReadFailure("total_timeout");
    if (snapshot.coverage.requests >= limits.requests)
      throw new ReadFailure("request_limit");
    if (snapshot.coverage.responseBytes >= limits.aggregateBytes)
      throw new ReadFailure("aggregate_limit");
    const controller = new AbortController();
    const requestStarted = performance.now();
    let headersMs: number | null = null;
    let httpStatus: number | null = null;
    let outcome: GithubRequestTiming["outcome"] = "ok";
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
          const response = await transport(GRAPHQL_URL, {
            method: "POST",
            body: JSON.stringify({ query, operationName, variables }),
            redirect: "error",
            credentials: "omit",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "Codi-GitHub-Profile",
              "Content-Type": "application/json",
              Authorization: `Bearer ${input.accessToken}`,
            },
          });
          // A custom transport can finish after abort; do not consume or mutate the snapshot then.
          headersMs = Math.round(performance.now() - requestStarted);
          httpStatus = response.status;
          if (controller.signal.aborted) {
            void response.body?.cancel().catch(() => undefined);
            throw new ReadFailure(deadlineCode);
          }
          if (
            response.redirected ||
            (response.status >= 300 && response.status < 400) ||
            (response.url && response.url !== GRAPHQL_URL)
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
                ? "connection_expired"
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
          if (response.status === 403) {
            const message = z.object({ message: z.string() }).safeParse(parsed);
            if (
              message.success &&
              RATE_LIMIT_MESSAGE.test(message.data.message)
            )
              throw new ReadFailure(
                "rate_limited",
                403,
                rateLimitRetry(response.headers),
              );
          }
          const validated = graphqlEnvelopeSchema.safeParse(parsed);
          if (!validated.success) throw new ReadFailure("invalid_response");
          const envelope = validated.data;
          const aliasErrors = new Map<string, ReadFailure>();
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
                rateLimitRetry(response.headers),
              );
            if (
              labels.some((label) =>
                /^(?:UNAUTHENTICATED|BAD_CREDENTIALS)$|bad credentials|requires authentication|token (?:has )?expired/i.test(
                  label,
                ),
              )
            )
              throw new ReadFailure("connection_expired", response.status);
            // Only errors attributed to a batched alias are isolated; anything else discards the page.
            const keys = envelope.errors.map((error) => {
              const key = error.path?.[0];
              return typeof key === "string" && isolatedAliases?.has(key)
                ? key
                : undefined;
            });
            if (envelope.data == null || keys.includes(undefined))
              throw new ReadFailure(
                envelope.data == null ? "graphql_error" : "graphql_partial",
                response.status,
              );
            envelope.errors.forEach((error, index) =>
              aliasErrors.set(
                keys[index]!,
                new ReadFailure(
                  error.type === "NOT_FOUND" ||
                    error.extensions?.code === "NOT_FOUND"
                    ? "not_found"
                    : "graphql_partial",
                  response.status,
                ),
              ),
            );
          }
          if (response.status === 403) throw new ReadFailure("http_error", 403);
          // Do not echo credential-bearing upstream text, even from a test/custom transport.
          if (
            containsCredentials(text) ||
            containsStructuredCredentials(parsed)
          )
            throw new ReadFailure("invalid_response");
          return { data: envelope.data, aliasErrors };
        })(),
      ]);
    } catch (error) {
      const failure =
        error instanceof ReadFailure
          ? error
          : new ReadFailure(
              controller.signal.aborted ? deadlineCode : "network_error",
            );
      outcome = failure.code;
      throw failure;
    } finally {
      if (timer) clearTimeout(timer);
      controller.abort();
      if (reader) void reader.cancel().catch(() => undefined);
      // Logging failures must not change collection or cause another upstream request.
      try {
        options.onRequest?.({
          operation:
            operationName === "CodiPublicProfile"
              ? "listing"
              : operationName === "CodiPublicTrees"
                ? "tree"
                : "blob",
          ordinal: snapshot.coverage.requests,
          elapsedMs: Math.round(performance.now() - requestStarted),
          collectionElapsedMs: Math.round(performance.now() - started),
          headersMs,
          httpStatus,
          outcome,
        });
      } catch {
        /* Observability is best effort. */
      }
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
      REPOSITORIES_PER_PAGE,
      limits.listedRepos - snapshot.repositories.length,
    );
    try {
      const result = await send("CodiPublicProfile", repositoryQuery, {
        first: perPage,
        after,
      });
      const response = z
        .object({
          viewer: z.object({
            databaseId: idSchema,
            login: loginSchema,
            repositories: z.unknown(),
          }),
        })
        .parse(result.data);
      const viewer = response.viewer;
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
        page >= Math.ceil(limits.listedRepos / REPOSITORIES_PER_PAGE) ||
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
        // Official equivalent language-byte evidence endpoint, not a claim of GraphQL transport.
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

  // Runs one batched query. Per-alias failures stay on their item; a response that overflows
  // the ceiling is split in half and retried so one large repository cannot discard the batch.
  const readBatch = async <T extends BatchItem>(
    kind: "tree" | "blob",
    items: readonly T[],
    accept: (item: T, value: unknown) => void,
    reject: (item: T, error: unknown) => void,
  ): Promise<void> => {
    if (stopped || items.length === 0) return;
    const prefix = kind === "tree" ? "t" : "f";
    const alias = (index: number) => `${prefix}${index}`;
    const variables = Object.fromEntries(
      items.flatMap((item, index) => [
        [`o${index}`, item.repo.owner],
        [`n${index}`, item.repo.name],
        [`e${index}`, item.expression],
      ]),
    );
    let envelope: BatchEnvelope;
    try {
      envelope = await send(
        kind === "tree" ? "CodiPublicTrees" : "CodiPublicBlobs",
        batchQuery(kind, items.length),
        variables,
        new Set(items.map((_, index) => alias(index))),
      );
    } catch (error) {
      if (
        error instanceof ReadFailure &&
        error.code === "response_limit" &&
        items.length > 1
      ) {
        const middle = Math.ceil(items.length / 2);
        await readBatch(kind, items.slice(0, middle), accept, reject);
        await readBatch(kind, items.slice(middle), accept, reject);
        return;
      }
      for (const item of items) reject(item, error);
      return;
    }
    items.forEach((item, index) => {
      try {
        const failure = envelope.aliasErrors.get(alias(index));
        if (failure) throw failure;
        accept(
          item,
          z.record(z.string(), z.unknown()).parse(envelope.data)[alias(index)],
        );
      } catch (error) {
        reject(item, error);
      }
    });
  };

  // Stage 1: root trees pinned to each commit. Entries give file presence, mode and size.
  const readable = selected.flatMap((repo) => {
    if (repo.commitSha) return [{ repo, expression: `${repo.commitSha}:` }];
    issue(
      { repositoryId: repo.id, operation: "ref" },
      new ReadFailure("invalid_response"),
    );
    return [];
  });
  const trees = new Map<number, TreeEntry[]>();
  for (let start = 0; start < readable.length; start += MAX_ALIASES_PER_QUERY) {
    await readBatch(
      "tree",
      readable.slice(start, start + MAX_ALIASES_PER_QUERY),
      (item, value) => {
        const parsed = treeAliasSchema.parse(value);
        if (!parsed) throw new ReadFailure("not_found");
        if (
          parsed.databaseId !== item.repo.id ||
          parsed.owner.login.toLowerCase() !== item.repo.owner.toLowerCase() ||
          String(parsed.owner.databaseId) !== input.githubUserId
        )
          throw new ReadFailure("invalid_response");
        // A pinned commit that no longer resolves is absence of evidence, not a missing file.
        if (!parsed.tree) throw new ReadFailure("not_found");
        if (!parsed.tree.entries) throw new ReadFailure("invalid_response");
        trees.set(item.repo.id, parsed.tree.entries);
      },
      (item, error) =>
        issue({ repositoryId: item.repo.id, operation: "directory" }, error),
    );
  }

  // Stage 2 planning: decide from tree metadata alone, so oversized and binary blobs are never
  // requested as text.
  type BlobItem = BatchItem & {
    path: string;
    file: GithubRepositorySnapshot["files"][number];
    oid: string;
    byteSize: number;
  };
  const planned: BlobItem[] = [];
  for (const repo of selected) {
    const entries = trees.get(repo.id);
    if (!entries || !repo.commitSha) continue;
    const readme =
      entries
        .filter((entry) =>
          /^readme(?:\.(?:md|markdown|rst|txt))?$/i.test(entry.name),
        )
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))[0]
        ?.name ?? "README.md";
    for (const path of [...GITHUB_MANIFEST_PATHS, readme]) {
      const entry = entries.find((item) => item.name === path);
      const file: GithubRepositorySnapshot["files"][number] = {
        path,
        state: entry ? "unavailable" : "missing",
      };
      repo.files.push(file);
      if (!entry) continue;
      const scope = { repositoryId: repo.id, operation: "file" as const, path };
      const blob = entry.object;
      if (
        entry.type !== "blob" ||
        !REGULAR_FILE_MODES.has(entry.mode) ||
        blob?.byteSize === undefined
      ) {
        issue(scope, new ReadFailure("invalid_response"));
        continue;
      }
      if (blob.byteSize > limits.fileBytes) {
        issue(scope, new ReadFailure("file_limit"));
        continue;
      }
      if (blob.isBinary === true) {
        issue(scope, new ReadFailure("invalid_response"));
        continue;
      }
      planned.push({
        repo,
        expression: `${repo.commitSha}:${path}`,
        path,
        file,
        oid: entry.oid,
        byteSize: blob.byteSize,
      });
    }
  }

  // Stage 2: blob text, packed by estimated JSON size (escaping can expand text, so the
  // estimate is generous and readBatch splits any batch that still overflows).
  const batches: BlobItem[][] = [];
  let batch: BlobItem[] = [];
  let estimated = 0;
  for (const item of planned) {
    const cost = item.byteSize * 2 + 1024;
    if (
      batch.length &&
      (batch.length === MAX_ALIASES_PER_QUERY ||
        estimated + cost > limits.responseBytes)
    ) {
      batches.push(batch);
      batch = [];
      estimated = 0;
    }
    batch.push(item);
    estimated += cost;
  }
  if (batch.length) batches.push(batch);
  for (const items of batches) {
    await readBatch(
      "blob",
      items,
      (item, value) => {
        const parsed = blobAliasSchema.parse(value);
        if (!parsed) throw new ReadFailure("not_found");
        if (parsed.databaseId !== item.repo.id)
          throw new ReadFailure("invalid_response");
        if (!parsed.blob) throw new ReadFailure("not_found");
        const blob = parsed.blob;
        if (blob.oid !== item.oid || blob.byteSize !== item.byteSize)
          throw new ReadFailure("invalid_response");
        // Truncated text is only a prefix and cannot prove the blob.
        if (blob.isTruncated) throw new ReadFailure("file_limit");
        if (blob.isBinary === true || blob.text === null)
          throw new ReadFailure("invalid_response");
        const decoded = Buffer.from(blob.text, "utf8");
        const sha = createHash("sha1")
          .update(`blob ${decoded.length}\0`)
          .update(decoded)
          .digest("hex");
        if (decoded.length !== blob.byteSize || sha !== blob.oid)
          throw new ReadFailure("invalid_response");
        if (containsCredentials(blob.text))
          throw new ReadFailure("invalid_response");
        const evidenceId = `repo:${item.repo.id}:commit:${item.repo.commitSha}:file:${item.path}:blob:${blob.oid}`;
        snapshot.evidence.push({
          id: evidenceId,
          kind: "file",
          repositoryId: item.repo.id,
          path: item.path,
          commitSha: item.repo.commitSha!,
          blobSha: blob.oid,
          text: blob.text,
          collectedAt: new Date().toISOString(),
          sourceUrl: `https://github.com/${item.repo.owner}/${item.repo.name}/blob/${item.repo.commitSha}/${encodeURIComponent(item.path)}`,
        });
        item.file.state = "collected";
        item.file.evidenceId = evidenceId;
      },
      (item, error) => {
        const code = issue(
          { repositoryId: item.repo.id, operation: "file", path: item.path },
          error,
        );
        if (code === "not_found") item.file.state = "missing";
      },
    );
  }
  // Completion order must not affect downstream observation selection.
  const order = new Map(selected.map((repo, index) => [repo.id, index]));
  snapshot.evidence.sort(
    (a, b) =>
      (order.get(a.repositoryId) ?? 0) - (order.get(b.repositoryId) ?? 0) ||
      a.id.localeCompare(b.id),
  );
  return finish();
}
