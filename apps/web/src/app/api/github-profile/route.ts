import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { APIError } from "better-auth/api";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { ENV } from "@/env.server";
import { runGithubProfileRequest } from "@/lib/github-profile-service";
import {
  createGithubProfileStore,
  GithubProfileStoreError,
  type GithubProfileRequest,
  type GithubProfileTrustedBudget,
} from "@/lib/github-profile-store";
import { projectGithubProfile } from "@/lib/github-profile-analysis-contract";
import { githubProfileAiDiagnosticsSchema } from "@/lib/github-profile-ai";

export const runtime = "nodejs";
export const maxDuration = 60;
const privateHeaders = { "Cache-Control": "private, no-store" };
const failure = (code: string, error: string, status: number) =>
  NextResponse.json({ code, error }, { status, headers: privateHeaders });

async function viewer(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const roles = await getActiveRoles(db, session.user.id);
  return roles.includes(ROLE.LEARNER) ? session.user.id : null;
}

// Runtime-only operator settings. Missing settings fail closed; never read from request JSON.
function trustedBudget(): GithubProfileTrustedBudget | undefined {
  const budgetKey = process.env.GITHUB_PROFILE_BUDGET_KEY;
  const slot = process.env.GITHUB_PROFILE_BUDGET_SLOT;
  const candidateSha = process.env.GITHUB_PROFILE_CANDIDATE_SHA;
  if (
    !budgetKey ||
    budgetKey.length > 300 ||
    !slot ||
    (slot !== "pre-integration" &&
      slot !== "diagnostic-preintegration" &&
      slot !== "integrated" &&
      !(slot.trim() === slot && /^test-[a-z0-9-]{1,64}$/.test(slot))) ||
    !candidateSha ||
    !/^[0-9a-f]{40}$/.test(candidateSha)
  )
    return;
  return { budgetKey, slot, candidateSha };
}

function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("aborted"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) reject(new Error("aborted"));
        else resolve(value);
      },
      () => {
        signal.removeEventListener("abort", abort);
        reject(new Error("operation_failed"));
      },
    );
  });
}

async function inputBody(request: NextRequest, signal: AbortSignal) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("invalid_body");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const item = await bounded(reader.read(), signal);
      if (item.done) break;
      size += item.value.byteLength;
      if (size > 2048) throw new Error("body_limit");
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    void reader.cancel().catch(() => undefined);
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = await viewer(request);
    if (!userId)
      return failure(
        "unauthorized",
        "Vui lòng đăng nhập bằng tài khoản học viên.",
        401,
      );
    const stored = await createGithubProfileStore(db).read(userId);
    return NextResponse.json(
      {
        profile: stored
          ? projectGithubProfile(
              stored.snapshot,
              stored.analysis,
              stored.corrections,
            )
          : null,
      },
      { headers: privateHeaders },
    );
  } catch {
    return failure("store_failed", "Chưa tải được hồ sơ đã lưu.", 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (
    request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return failure("invalid_origin", "Yêu cầu không hợp lệ.", 403);
  // No client-supplied account identity, credentials or options are accepted.
  if (request.body !== null || request.nextUrl.search)
    return failure("invalid_input", "Yêu cầu ngắt kết nối không hợp lệ.", 400);
  try {
    const userId = await viewer(request);
    if (!userId)
      return failure(
        "unauthorized",
        "Vui lòng đăng nhập bằng tài khoản học viên.",
        401,
      );
    const linked = await createGithubProfileStore(db).getLinkedAccount(userId);
    if (linked) {
      // Better Auth rechecks ownership, session freshness and the last-account guard.
      // Account deletion cascades to github_profiles; no learning data is deleted.
      const result = await auth.api.unlinkAccount({
        headers: request.headers,
        body: { accountId: linked.accountId },
      });
      if (!result.status) throw new Error("unlink_failed");
    }
    return NextResponse.json(
      { disconnected: true } satisfies { disconnected: true },
      { headers: privateHeaders },
    );
  } catch (error) {
    if (error instanceof APIError) {
      switch (error.body?.code) {
        case "FAILED_TO_UNLINK_LAST_ACCOUNT":
          return failure(
            "last_sign_in_method",
            "Đặt mật khẩu trước khi ngắt kết nối GitHub.",
            409,
          );
        case "SESSION_NOT_FRESH":
          return failure(
            "session_not_fresh",
            "Vui lòng đăng nhập lại trước khi ngắt kết nối GitHub.",
            403,
          );
        case "UNAUTHORIZED":
          return failure("unauthorized", "Vui lòng đăng nhập lại.", 401);
        case "ACCOUNT_NOT_FOUND":
          return failure(
            "github_not_linked",
            "Kết nối GitHub đã thay đổi. Vui lòng tải lại trang.",
            409,
          );
      }
    }
    return failure(
      "disconnect_failed",
      "Chưa ngắt được kết nối GitHub. Vui lòng tải lại trang trước khi thử lại.",
      503,
    );
  }
}

export async function POST(request: NextRequest) {
  const started = performance.now();
  const correlationId = randomUUID();
  const observe = (event: Record<string, unknown>) => {
    try {
      console.info(
        "github-profile-timing",
        JSON.stringify({ correlationId, ...event }),
      );
    } catch {
      /* Logging must not affect profile publication or reservations. */
    }
  };
  // Reject cross-origin and missing-origin mutations before session, token or GitHub access.
  if (
    request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return failure("invalid_origin", "Yêu cầu không hợp lệ.", 403);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  const signal = AbortSignal.any([controller.signal, request.signal]);
  let claim: GithubProfileRequest | undefined;
  let activeConflict = false;
  let store: ReturnType<typeof createGithubProfileStore> | undefined;
  try {
    const userId = await bounded(viewer(request), signal);
    if (!userId)
      return failure(
        "unauthorized",
        "Vui lòng đăng nhập bằng tài khoản học viên.",
        401,
      );
    let input: unknown;
    try {
      input = await inputBody(request, signal);
    } catch {
      return failure("invalid_input", "Dữ liệu gửi lên không hợp lệ.", 400);
    }
    const budget = trustedBudget();
    if (
      !budget ||
      ENV.AI_PROVIDER !== "openai" ||
      ENV.AI_MODEL !== "gpt-6-luna" ||
      !ENV.OPENAI_API_KEY ||
      !ENV.GITHUB_CLIENT_ID ||
      !ENV.GITHUB_CLIENT_SECRET
    )
      return failure(
        "not_ready",
        "Phân tích GitHub chưa được bật cho lượt chạy này.",
        503,
      );
    store = createGithubProfileStore(db, budget);
    const currentStore = store;
    const result = await bounded(
      runGithubProfileRequest(input, {
        abortSignal: signal,
        onGithubRequest: (event) =>
          observe({
            phase: "github",
            ...event,
            routeElapsedMs: Math.round(performance.now() - started),
          }),
        publicAccess: {
          mode: "oauth_app",
          clientId: ENV.GITHUB_CLIENT_ID,
          clientSecret: ENV.GITHUB_CLIENT_SECRET,
        },
        getLinkedAccount: async (phaseSignal) => {
          phaseSignal.throwIfAborted();
          const linked = await currentStore.getLinkedAccount(userId);
          phaseSignal.throwIfAborted();
          if (!linked) return null;
          let claimed: GithubProfileRequest;
          try {
            claimed = await currentStore.claim({
              userId,
              accountId: linked.accountId,
              githubUserId: linked.githubUserId,
              consentVersion: "public-github-v1",
            });
          } catch (error) {
            activeConflict =
              error instanceof GithubProfileStoreError &&
              error.code === "active_request";
            throw error;
          }
          claim = claimed;
          if (phaseSignal.aborted) {
            await currentStore.release(claimed);
            phaseSignal.throwIfAborted();
          }
          return {
            accountRowId: linked.accountId,
            githubUserId: linked.githubUserId,
          };
        },
        getAccessToken: async (accountRowId, phaseSignal) => {
          phaseSignal.throwIfAborted();
          const token = await auth.api.getAccessToken({
            headers: request.headers,
            body: { accountId: accountRowId },
          });
          phaseSignal.throwIfAborted();
          return token.accessToken ?? null;
        },
        ai: {
          apiKey: ENV.OPENAI_API_KEY,
          reserveGeneration: async (reservation) => {
            signal.throwIfAborted();
            if (!claim) return false;
            return currentStore.reserveGeneration(claim, reservation);
          },
        },
      }),
      signal,
    );
    signal.throwIfAborted();
    if (!result.ok) {
      observe({
        phase: "result",
        code: result.code,
        routeElapsedMs: Math.round(performance.now() - started),
      });
      if (activeConflict)
        return failure("active_request", "Một lượt phân tích đang chạy.", 409);
      const status =
        result.code === "rate_limited"
          ? 429
          : ["invalid_input", "consent_required", "intent_mismatch"].includes(
                result.code,
              )
            ? 400
            : result.code === "github_not_linked"
              ? 409
              : 502;
      const diagnostics = githubProfileAiDiagnosticsSchema.safeParse(
        result.diagnostics,
      );
      return NextResponse.json(
        {
          code: result.code,
          error: result.error,
          ...(result.retryAt ? { retryAt: result.retryAt } : {}),
          ...(diagnostics.success ? { diagnostics: diagnostics.data } : {}),
        },
        { status, headers: privateHeaders },
      );
    }
    if (result.generation && claim) {
      observe({
        phase: "generation",
        reservedMaximumCostMicroUsd:
          result.generation.reservedMaximumCostMicroUsd,
        inputTokens: result.generation.inputTokens,
        outputTokens: result.generation.outputTokens,
        routeElapsedMs: Math.round(performance.now() - started),
      });
      await bounded(
        currentStore.publish(
          claim,
          result.snapshot,
          result.generation.analysis,
        ),
        signal,
      );
    }
    return NextResponse.json(
      { profile: result.profile },
      { headers: privateHeaders },
    );
  } catch (error) {
    if (signal.aborted)
      return failure(
        "request_timeout",
        "Đã hết thời gian xử lý. Không tự thử lại.",
        504,
      );
    if (
      error instanceof GithubProfileStoreError &&
      error.code === "active_request"
    )
      return failure("active_request", "Một lượt phân tích đang chạy.", 409);
    return failure(
      "request_failed",
      "Chưa hoàn tất phân tích GitHub. Không tự thử lại.",
      503,
    );
  } finally {
    clearTimeout(timer);
    if (claim && store)
      await Promise.race([
        store.release(claim).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
  }
}
