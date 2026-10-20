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
const repoSchema = z.object({
  id: idSchema,
  name: nameSchema,
  owner: z.object({ id: idSchema, login: loginSchema }),
  private: z.boolean(),
  visibility: z.string().optional(),
  fork: z.boolean(),
  size: z.number().nonnegative().safe(),
  pushed_at: z.iso.datetime({ offset: true }).nullable(),
  default_branch: z
    .string()
    .min(1)
    .max(255)
    .refine(
      (branch) =>
        !branch
          .split("/")
          .some((part) => !part || part === "." || part === "..") &&
        !/[\x00-\x1f\x7f]/.test(branch),
    ),
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
  /** Trusted server input. Anonymous collection must also be selected explicitly. */
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
 * Sequential reads intentionally stay below the two-request concurrency ceiling.
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
        "app_auth_failed",
        "request_limit",
        "aggregate_limit",
        "total_timeout",
      ].includes(failure.code)
    )
      stopped = true;
    return failure.code;
  };
  const request = async (path: string, identity = false): Promise<unknown> => {
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
            method: "GET",
            redirect: "error",
            credentials: "omit",
            cache: "no-store",
            signal: controller.signal,
            headers: {
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "User-Agent": "Codi-GitHub-Profile",
              ...(identity
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
                ? identity
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
              appCredentials && !identity ? "app_auth_failed" : "http_error",
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
  try {
    const identity = z
      .object({ id: idSchema, login: loginSchema })
      .parse(await request("/user", true));
    if (String(identity.id) !== input.githubUserId)
      throw new ReadFailure("identity_mismatch");
    snapshot.identity = { id: String(identity.id), login: identity.login };
  } catch (error) {
    issue({ operation: "identity" }, error);
    return finish();
  }

  const seen = new Set<number>();
  for (
    let page = 1;
    !stopped && snapshot.repositories.length < limits.listedRepos;
    page++
  ) {
    const perPage = Math.min(
      100,
      limits.listedRepos - snapshot.repositories.length,
    );
    // A constant per_page avoids shifting page offsets when the listed limit is not a multiple of 100.
    try {
      const data = z
        .array(repoSchema)
        .max(100)
        .parse(
          await request(
            `/users/${snapshot.identity.login}/repos?type=owner&sort=pushed&direction=desc&per_page=100&page=${page}`,
          ),
        );
      if (
        data.some(
          (repo) =>
            repo.private ||
            (repo.visibility && repo.visibility !== "public") ||
            String(repo.owner.id) !== input.githubUserId ||
            repo.owner.login.toLowerCase() !==
              snapshot.identity!.login.toLowerCase(),
        )
      )
        throw new ReadFailure("invalid_response");
      for (const repo of data.slice(0, perPage)) {
        if (seen.has(repo.id)) continue;
        seen.add(repo.id);
        snapshot.repositories.push({
          id: repo.id,
          owner: repo.owner.login,
          name: repo.name,
          pushedAt: repo.pushed_at,
          defaultBranch: repo.default_branch,
          disposition: repo.fork
            ? "fork"
            : repo.size === 0
              ? "empty"
              : "capped",
          commitSha: null,
          files: [],
        });
      }
      if (data.length < 100 && data.length <= perPage) {
        snapshot.coverage.listingComplete = true;
        break;
      }
      if (page >= Math.ceil(limits.listedRepos / 100)) break;
    } catch (error) {
      issue({ operation: "listing" }, error);
      break;
    }
  }
  snapshot.repositories.sort(
    (a, b) =>
      (b.pushedAt ? Date.parse(b.pushedAt) : 0) -
        (a.pushedAt ? Date.parse(a.pushedAt) : 0) || a.id - b.id,
  );
  const selected = snapshot.repositories
    .filter((repo) => repo.disposition === "capped")
    .slice(0, limits.selectedRepos);
  for (const repo of selected) repo.disposition = "selected";
  for (const repo of selected) {
    if (stopped) break;
    const scope = { repositoryId: repo.id };
    const base = `/repos/${repo.owner}/${repo.name}`;
    try {
      const ref = z
        .object({
          object: z.object({ type: z.literal("commit"), sha: shaSchema }),
        })
        .parse(
          await request(
            `${base}/git/ref/heads/${encodeURIComponent(repo.defaultBranch)}`,
          ),
        );
      repo.commitSha = ref.object.sha;
    } catch (error) {
      issue({ ...scope, operation: "ref" }, error);
    }
    if (stopped) break;
    try {
      const bytes = z
        .record(
          z.string().min(1).max(80),
          z.number().int().nonnegative().safe(),
        )
        .parse(await request(`${base}/languages`));
      const collectedAt = new Date().toISOString();
      snapshot.evidence.push({
        id: `repo:${repo.id}:languages:${collectedAt}`,
        kind: "languages",
        repositoryId: repo.id,
        collectedAt,
        sourceUrl: `https://api.github.com${base}/languages`,
        bytes,
      });
    } catch (error) {
      issue({ ...scope, operation: "languages" }, error);
    }
    if (stopped || !repo.commitSha) continue;
    let directory: z.infer<typeof directorySchema>;
    try {
      directory = directorySchema.parse(
        await request(`${base}/contents?ref=${repo.commitSha}`),
      );
    } catch (error) {
      issue({ ...scope, operation: "directory" }, error);
      continue;
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
  }
  return finish();
}
