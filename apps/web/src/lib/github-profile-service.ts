import { z } from "zod";
import {
  collectGithubProfile,
  type GithubPublicAccess,
} from "./github-profile-collector";
import type { GithubCollectionSnapshot } from "./github-profile-contract";
import {
  projectGithubProfile,
  type GithubProfileProjection,
} from "./github-profile-analysis-contract";
import {
  generateGithubProfileAnalysis,
  GithubProfileAiError,
  githubProfileAiDiagnosticsSchema,
  type GithubProfileAiDiagnostics,
  type GithubProfileAiOptions,
  type GithubProfileAiResult,
} from "./github-profile-ai";

export const GITHUB_PROFILE_SERVICE_LIMITS = Object.freeze({
  totalMs: 55_000,
  collectionMs: 25_000,
  aiMs: 25_000,
});

const requestSchema = z.strictObject({
  consentVersion: z.literal("public-github-v1"),
  githubProfileInput: z.string().max(300).optional().default(""),
});
const loginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

function intentLogin(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (loginPattern.test(value)) return value.toLowerCase();
  // Reject extra/raw path syntax before URL normalization can erase it.
  if (!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/?$/i.test(value))
    throw new Error("invalid_intent");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !/^\/[A-Za-z0-9-]+\/?$/.test(url.pathname)
  )
    throw new Error("invalid_intent");
  const login = url.pathname.replace(/^\/|\/$/g, "");
  if (!loginPattern.test(login)) throw new Error("invalid_intent");
  return login.toLowerCase();
}

/** Validate user consent and profile intent before storing a background job. */
export function parseGithubProfileInput(input: unknown) {
  const parsed = requestSchema.parse(input);
  intentLogin(parsed.githubProfileInput);
  return parsed;
}

export interface GithubProfileLinkedAccount {
  /** Better Auth LOCAL row ID: only this value goes to the token accessor. */
  accountRowId: string;
  /** Immutable provider subject from that session-owned linked account. */
  githubUserId: string;
}

export interface GithubProfileServiceOptions {
  abortSignal: AbortSignal;
  /** A trusted server runtime selection, never read from request JSON. */
  background?: boolean;
  /** Trusted, session-bound adapters. Neither is invoked before request validation. */
  getLinkedAccount: (
    signal: AbortSignal,
  ) => Promise<GithubProfileLinkedAccount | null>;
  getAccessToken: (
    accountRowId: string,
    signal: AbortSignal,
  ) => Promise<string | null>;
  publicAccess: GithubPublicAccess;
  ai: Pick<GithubProfileAiOptions, "apiKey" | "reserveGeneration" | "fetch">;
  /** Trusted offline transport seam; never supplied by a client. */
  githubFetch?: typeof globalThis.fetch;
}

const messages = {
  invalid_input: "Yêu cầu hoặc tên tài khoản GitHub không hợp lệ.",
  consent_required: "Vui lòng xác nhận cho phép phân tích GitHub.",
  github_not_linked: "Bạn chưa liên kết GitHub với tài khoản Codi này.",
  account_unavailable: "Chưa đọc được tài khoản GitHub liên kết.",
  connection_expired: "Kết nối GitHub đã hết hiệu lực. Vui lòng kết nối lại.",
  identity_mismatch: "Tài khoản GitHub không khớp với tài khoản đã liên kết.",
  intent_mismatch: "Tên GitHub đã nhập không khớp với tài khoản đã liên kết.",
  app_auth_failed: "Chưa xác thực được lượt đọc GitHub công khai.",
  rate_limited: "GitHub đang giới hạn lượt đọc. Vui lòng thử lại sau.",
  collection_failed: "Chưa thu thập được dữ liệu GitHub hợp lệ.",
  collection_timeout: "Đã hết thời gian thu thập GitHub. Không tự thử lại.",
  ai_failed: "Chưa tạo được hồ sơ năng lực. Không tự thử lại.",
  ai_timeout: "Đã hết thời gian tạo hồ sơ năng lực. Không tự thử lại.",
  request_timeout: "Đã hết thời gian xử lý yêu cầu. Không tự thử lại.",
  aborted: "Yêu cầu đã dừng. Chưa xác nhận được kết quả.",
} as const;
const collectionFailures = {
  identity_mismatch: "identity_mismatch",
  connection_expired: "connection_expired",
  app_auth_failed: "app_auth_failed",
  rate_limited: "rate_limited",
  total_timeout: "collection_timeout",
  request_timeout: "collection_timeout",
  invalid_input: "collection_failed",
} as const satisfies Record<string, GithubProfileServiceFailureCode>;
export type GithubProfileServiceFailureCode = keyof typeof messages;
export type GithubProfileServiceResult =
  | {
      ok: true;
      outcome: "analysed" | "no_observations";
      profile: GithubProfileProjection;
      snapshot: GithubCollectionSnapshot;
      generation: GithubProfileAiResult | null;
    }
  | {
      ok: false;
      code: GithubProfileServiceFailureCode;
      error: string;
      retryAt?: string;
      snapshot?: GithubCollectionSnapshot;
      /** Unknown/consumed must never be refunded or retried automatically. */
      reservationState?: GithubProfileAiError["reservationState"];
      diagnostics?: GithubProfileAiDiagnostics;
    };

function deadline(ms: number, parent: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent.addEventListener("abort", abort, { once: true });
  if (parent.aborted) abort();
  const timer = setTimeout(abort, ms);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      parent.removeEventListener("abort", abort);
      controller.abort();
    },
  };
}

/** Bounds even a trusted adapter that fails to acknowledge abort. No late value is used. */
function untilAborted<T>(
  operation: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new Error("aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return operation();
      })
      .then(
        (value) => {
          signal.removeEventListener("abort", abort);
          if (signal.aborted) abort();
          else resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
  });
}

function scopedFetch(
  transport: typeof globalThis.fetch,
  signal: AbortSignal,
): typeof globalThis.fetch {
  return (url, init) => {
    const combined = AbortSignal.any(
      init?.signal ? [signal, init.signal] : [signal],
    );
    return untilAborted(async () => {
      const response = await transport(url, { ...init, signal: combined });
      if (combined.aborted) {
        void response.body?.cancel().catch(() => undefined);
        combined.throwIfAborted();
      }
      return response;
    }, combined);
  };
}

/** Private server-only orchestration, not an HTTP response or persistence operation.
 * Caller owns session/role/origin checks, durable attempt accounting and save fencing.
 * Adapters may still finish an already-started transaction after abort; reconcile it
 * durably. This function never retries, refunds, persists or schedules anything. */
export async function runGithubProfileRequest(
  input: unknown,
  options: GithubProfileServiceOptions,
): Promise<GithubProfileServiceResult> {
  const fail = (
    code: GithubProfileServiceFailureCode,
    detail: Omit<
      Extract<GithubProfileServiceResult, { ok: false }>,
      "ok" | "code" | "error"
    > = {},
  ): GithubProfileServiceResult => ({
    ok: false,
    code,
    error: messages[code],
    ...detail,
  });
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    const consent =
      input && typeof input === "object"
        ? (input as Record<string, unknown>).consentVersion
        : undefined;
    return fail(
      consent !== "public-github-v1" ? "consent_required" : "invalid_input",
    );
  }
  let intent: string | null;
  try {
    intent = intentLogin(parsed.data.githubProfileInput);
  } catch {
    return fail("invalid_input");
  }
  const request = deadline(
    options.background ? 175_000 : GITHUB_PROFILE_SERVICE_LIMITS.totalMs,
    options.abortSignal,
  );
  let phase: "account" | "token" | "collection" | "ai" = "account";
  let snapshot: GithubCollectionSnapshot | undefined;
  let phaseDeadline: ReturnType<typeof deadline> | undefined;
  let aiStarted: number | undefined;
  try {
    const account = await untilAborted(
      () => options.getLinkedAccount(request.signal),
      request.signal,
    );
    if (!account) return fail("github_not_linked");
    // Copy trusted identifiers before awaiting token retrieval; never accept client IDs.
    const { accountRowId, githubUserId } = account;
    if (
      !accountRowId?.trim() ||
      !/^[1-9]\d*$/.test(githubUserId) ||
      !Number.isSafeInteger(Number(githubUserId))
    )
      return fail("account_unavailable");
    phase = "token";
    const token = await untilAborted(
      () => options.getAccessToken(accountRowId, request.signal),
      request.signal,
    );
    if (!token) return fail("connection_expired");
    phase = "collection";
    phaseDeadline = deadline(
      options.background ? 90_000 : GITHUB_PROFILE_SERVICE_LIMITS.collectionMs,
      request.signal,
    );
    const collectionSignal = phaseDeadline.signal;
    snapshot = await untilAborted(
      () =>
        collectGithubProfile(
          {
            githubUserId,
            accessToken: token,
            publicAccess: options.publicAccess,
          },
          {
            limits: { totalMs: options.background ? 90_000 : GITHUB_PROFILE_SERVICE_LIMITS.collectionMs },
            fetch: scopedFetch(
              options.githubFetch ?? globalThis.fetch,
              collectionSignal,
            ),
          },
        ),
      collectionSignal,
    );
    phaseDeadline.dispose();
    phaseDeadline = undefined;
    request.signal.throwIfAborted();
    const detail = { snapshot };
    if (snapshot.identity && snapshot.identity.id !== githubUserId)
      return fail("identity_mismatch", detail);
    const fatal = snapshot.issues.find((issue) =>
      Object.hasOwn(collectionFailures, issue.code),
    );
    if (fatal) {
      const code =
        collectionFailures[fatal.code as keyof typeof collectionFailures];
      return fail(code, {
        ...detail,
        ...(fatal.retryAt ? { retryAt: fatal.retryAt } : {}),
      });
    }
    if (!snapshot.identity || snapshot.status === "failed")
      return fail("collection_failed", detail);
    if (intent && intent !== snapshot.identity.login.toLowerCase())
      return fail("intent_mismatch", detail);
    const facts = projectGithubProfile(snapshot, null);
    if (facts.observationAvailability === "none_observed")
      return {
        ok: true,
        outcome: "no_observations",
        profile: facts,
        snapshot,
        generation: null,
      };
    phase = "ai";
    aiStarted = performance.now();
    phaseDeadline = deadline(
      options.background ? 75_000 : GITHUB_PROFILE_SERVICE_LIMITS.aiMs,
      request.signal,
    );
    const aiSignal = phaseDeadline.signal;
    const generation = await untilAborted(
      () =>
        generateGithubProfileAnalysis(snapshot!, {
          ...options.ai,
          ...(options.background ? { timeoutMs: 75_000 } : {}),
          abortSignal: aiSignal,
          fetch: scopedFetch(options.ai.fetch ?? globalThis.fetch, aiSignal),
        }),
      aiSignal,
    );
    request.signal.throwIfAborted();
    return {
      ok: true,
      outcome: "analysed",
      snapshot,
      generation,
      profile: projectGithubProfile(snapshot, generation.analysis),
    };
  } catch (error) {
    const diagnostic = githubProfileAiDiagnosticsSchema.safeParse(
      error instanceof GithubProfileAiError ? error.diagnostics : undefined,
    );
    const detail = {
      ...(snapshot ? { snapshot } : {}),
      ...(diagnostic.success
        ? { diagnostics: diagnostic.data }
        : phase === "ai" && aiStarted !== undefined
          ? {
              diagnostics: {
                phase: "ai" as const,
                category:
                  options.abortSignal.aborted ||
                  request.signal.aborted ||
                  phaseDeadline?.signal.aborted
                    ? ("aborted" as const)
                    : ("unknown" as const),
                elapsedMs: Math.max(
                  0,
                  Math.floor(performance.now() - aiStarted),
                ),
                httpStatus: null,
              },
            }
          : {}),
    };
    if (options.abortSignal.aborted)
      return fail("aborted", {
        ...detail,
        ...(phase === "ai" ? { reservationState: "unknown" } : {}),
      });
    if (request.signal.aborted)
      return fail("request_timeout", {
        ...detail,
        ...(phase === "ai" ? { reservationState: "unknown" } : {}),
      });
    if (phaseDeadline?.signal.aborted)
      return fail(phase === "ai" ? "ai_timeout" : "collection_timeout", {
        ...detail,
        ...(phase === "ai" ? { reservationState: "unknown" } : {}),
      });
    if (error instanceof GithubProfileAiError)
      return fail("ai_failed", {
        ...detail,
        reservationState: error.reservationState,
      });
    return fail(
      phase === "account"
        ? "account_unavailable"
        : phase === "token"
          ? "connection_expired"
          : phase === "collection"
            ? "collection_failed"
            : "ai_failed",
      detail,
    );
  } finally {
    phaseDeadline?.dispose();
    request.dispose();
  }
}
