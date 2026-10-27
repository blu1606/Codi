"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, ArrowRight, RotateCcw, X } from "lucide-react";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { Sheet } from "@codi-1/ui/components/sheet";
import { Button } from "@codi-1/ui/components/button";
import { Input } from "@codi-1/ui/components/input";
import { Alert, AlertTitle } from "@codi-1/ui/components/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@codi-1/ui/components/dialog";

import { authClient } from "@/lib/auth-client";
import {
  GITHUB_USAGE_LABELS,
  type GithubProfileProjection,
} from "@/lib/github-profile-analysis-contract";
import { dateLabel } from "./github-profile-evidence";
import { LanguageShareSummary } from "./github-profile-stack";
import { ProfileResult, PROFILE_CARD } from "./github-profile-result";

interface Failure {
  error: string;
  code: string;
  retryAt?: string;
  action?: "disconnect";
}

// Same GitHub mark as the existing sign-in button; the installed Lucide has no brand icons.
const GITHUB_MARK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z'/%3E%3C/svg%3E\")";
function GithubMark() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-4 shrink-0 bg-current"
      style={{
        maskImage: GITHUB_MARK,
        maskSize: "contain",
        maskRepeat: "no-repeat",
      }}
    />
  );
}


const WAITING_STEPS = [
  "Đọc hồ sơ công khai",
  "Tải danh sách repo công khai",
  "Thống kê ngôn ngữ",
  "So khớp với khoá học của Codi",
];

function PendingChecklist() {
  const [highlight, setHighlight] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setHighlight((value) => (value + 1) % (WAITING_STEPS.length - 1)),
      2000,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <section
      aria-label="Minh hoạ chờ phân tích"
      aria-busy="true"
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <h3 className="font-semibold" role="status">
        Đang phân tích GitHub…
      </h3>
      <p className="text-sm text-muted-foreground">
        Mô phỏng chờ: các bước chỉ minh hoạ trong khi chờ phản hồi cuối từ máy
        chủ, không phải tiến độ thực tế. Chưa xác nhận bước nào hoàn tất.
      </p>
      <ol className="space-y-2 text-sm">
        {WAITING_STEPS.map((step, index) => (
          <li
            key={step}
            className={
              index === highlight
                ? "flex items-center gap-2 rounded-sm border border-primary bg-card px-3 py-2 font-medium text-foreground"
                : "flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-muted-foreground"
            }
          >
            <span
              aria-hidden="true"
              className={`size-4 shrink-0 rounded-full border ${index === highlight ? "border-primary bg-primary/10 motion-safe:animate-pulse" : "border-border bg-card"}`}
            />
            {step}
            {index === WAITING_STEPS.length - 1 && (
              <span className="text-xs">
                {" "}
                · Chưa được cung cấp trong lượt phân tích này
              </span>
            )}
            <span className="sr-only">
              {" "}
              · {index === highlight ? "Minh hoạ đang chờ" : "Chưa xác nhận"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// DELETE resolves the linked account server-side. No account identifiers or tokens leave this UI.
async function disconnectProfile(signal: AbortSignal): Promise<Failure | null> {
  const response = await fetch("/api/github-profile", {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal,
  });
  if (response.ok) return null;
  const body = (await response
    .json()
    .catch(() => null)) as Partial<Failure> | null;
  return {
    action: "disconnect",
    code: typeof body?.code === "string" ? body.code : "disconnect_failed",
    error:
      typeof body?.error === "string"
        ? body.error
        : "Chưa ngắt kết nối được GitHub. Hồ sơ trước vẫn được giữ lại.",
  };
}

export default function GithubProfilePanel({
  initialProfile = null,
  initialLinked = null,
  initialLinkError = null,
}: {
  initialProfile?: GithubProfileProjection | null;
  initialLinked?: boolean | null;
  initialLinkError?: "denied" | "already_linked" | "failed" | null;
} = {}) {
  const [input, setInput] = useState("");
  const [consent, setConsent] = useState<"analysis" | "link" | null>(null);
  const [profile, setProfile] = useState<GithubProfileProjection | null>(
    initialProfile,
  );
  const [failure, setFailure] = useState<Failure | null>(
    initialLinkError
      ? {
          code: "github_not_linked",
          error:
            initialLinkError === "denied"
              ? "Bạn chưa kết nối GitHub. Codi chưa được GitHub cấp quyền."
              : initialLinkError === "already_linked"
                ? "Tài khoản GitHub đã liên kết với tài khoản Codi khác. Dùng tài khoản GitHub khác."
                : "Chưa hoàn tất kết nối GitHub. Bạn có thể thử lại.",
        }
      : null,
  );
  const [pending, setPending] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(initialLinked);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectConsent, setDisconnectConsent] = useState(false);
  const [flowDismissed, setFlowDismissed] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [insufficient, setInsufficient] =
    useState<GithubProfileProjection | null>(null);
  const [note, setNote] = useState("");
  const active = useRef<{
    controller: AbortController;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);
  const busy = pending || linking || disconnecting;
  const stale =
    profile &&
    Number.isFinite(Date.parse(profile.collectedAt)) &&
    Date.now() - Date.parse(profile.collectedAt) > 90 * 86_400_000;
  useEffect(
    () => () => {
      const request = active.current;
      active.current = null;
      request?.controller.abort();
      if (request?.timer) clearTimeout(request.timer);
    },
    [],
  );

  function stopWaiting() {
    const request = active.current;
    active.current = null;
    request?.controller.abort();
    if (request?.timer) clearTimeout(request.timer);
    setPending(false);
    setFlowDismissed(true);
    setNote(
      "Đã dừng chờ. Chưa xác nhận máy chủ đã hoàn tất hoặc lưu kết quả; không phải huỷ dữ liệu trên máy chủ. Kết quả trước vẫn được giữ lại nếu có. Tải lại trang để xem hồ sơ đã lưu.",
    );
  }

  async function disconnect() {
    if (active.current || linking || disconnecting) return;
    const request = {
      controller: new AbortController(),
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
    active.current = request;
    setDisconnectConsent(false);
    setDisconnecting(true);
    setFailure(null);
    try {
      const error = await Promise.race([
        disconnectProfile(request.controller.signal),
        new Promise<never>((_, reject) => {
          request.timer = setTimeout(() => {
            request.controller.abort();
            reject(new Error("disconnect_timeout"));
          }, 60_000);
        }),
      ]);
      if (active.current !== request) return;
      if (error) setFailure(error);
      else {
        setProfile(null);
        setInsufficient(null);
        setLinked(false);
        setNote("Đã ngắt kết nối GitHub.");
      }
    } catch {
      if (active.current === request)
        setFailure({
          action: "disconnect",
          code: "disconnect_failed",
          error:
            "Chưa xác nhận được việc ngắt kết nối. Hồ sơ trước vẫn được giữ lại; tải lại trang để kiểm tra.",
        });
    } finally {
      if (request.timer) clearTimeout(request.timer);
      if (active.current === request) {
        active.current = null;
        setDisconnecting(false);
      }
    }
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent || active.current || linking || disconnecting) return;
    const action = consent;
    setConsent(null);
    setFailure(null);
    setNote("");
    setFlowDismissed(false);
    setResultOpen(false);
    setInsufficient(null);
    if (action === "link") {
      setLinking(true);
      try {
        const result = await authClient.linkSocial({
          provider: "github",
          callbackURL: "/profile?tab=nang-luc",
          errorCallbackURL: "/profile?tab=nang-luc",
        });
        if (result.error)
          setFailure({
            code: "github_not_linked",
            error:
              "Chưa kết nối được GitHub. Vui lòng kiểm tra tài khoản liên kết và thử lại.",
          });
        else
          setNote(
            "Hoàn tất liên kết trên GitHub rồi quay lại và xác nhận phân tích. Codi không tự phân tích khi bạn quay lại.",
          );
      } catch {
        setFailure({
          code: "github_not_linked",
          error: "Không thể mở kết nối GitHub. Bạn có thể thử lại sau.",
        });
      } finally {
        setLinking(false);
      }
      return;
    }
    const request = {
      controller: new AbortController(),
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
    active.current = request;
    setPending(true);
    let timedOut = false;
    try {
      const result = await Promise.race([
        (async () => {
          const response = await fetch("/api/github-profile", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            redirect: "error",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              consentVersion: "public-github-v1",
              githubProfileInput: input.trim(),
            }),
            signal: request.controller.signal,
          });
          const body = await response.json();
          return { response, body };
        })(),
        new Promise<never>((_, reject) => {
          request.timer = setTimeout(() => {
            timedOut = true;
            request.controller.abort();
            reject(new Error("client_timeout"));
          }, 60_000);
        }),
      ]);
      if (active.current !== request) return;
      if (!result.response.ok) {
        const body = result.body as Partial<Failure> | null;
        setFailure({
          error:
            typeof body?.error === "string"
              ? body.error
              : "Chưa tạo được hồ sơ năng lực. Bạn có thể thử lại.",
          code: typeof body?.code === "string" ? body.code : "request_failed",
          ...(typeof body?.retryAt === "string"
            ? { retryAt: body.retryAt }
            : {}),
        });
      } else if (result.body?.profile?.version === 1) {
        setLinked(true);
        // The owning service returns the accepted projection, not raw model output.
        const latest = result.body.profile as GithubProfileProjection;
        if (latest.observationAvailability === "none_observed") {
          if (profile?.observationAvailability === "observed") {
            setNote(
              "Lượt phân tích mới chưa ghi nhận quan sát công nghệ. Kết quả trước vẫn được giữ lại.",
            );
          } else {
            // This terminal outcome has no generation; the route does not publish it.
            setProfile(null);
            setInsufficient(latest);
          }
        } else {
          setProfile(latest);
          setResultOpen(true);
        }
      } else throw new Error("invalid_response");
    } catch {
      if (active.current === request)
        setFailure({
          code: timedOut ? "client_timeout" : "request_failed",
          error: timedOut
            ? "Đã hết thời gian chờ 60 giây. Chưa xác nhận được kết quả; yêu cầu trên máy chủ có thể vẫn đang hoàn tất. Không tự thử lại."
            : "Chưa tạo được hồ sơ năng lực. Không thể đọc phản hồi máy chủ. Bạn có thể thử lại.",
        });
    } finally {
      if (request.timer) clearTimeout(request.timer);
      if (active.current === request) {
        active.current = null;
        setPending(false);
      }
    }
  }

  return (
    <div className="min-w-0 space-y-8 [overflow-wrap:anywhere]">
      <header
        className="flex min-w-0 flex-wrap items-end justify-between gap-4"
        data-mockup="resultPage.header"
      >
        <div className="flex min-w-0 w-full items-center gap-3 sm:w-auto sm:flex-1">
          {profile?.identity && (
            <span
              aria-hidden="true"
              className="inline-grid size-14 shrink-0 place-items-center rounded-full bg-primary text-xl font-semibold text-primary-foreground"
            >
              {profile.identity.login.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-xl font-semibold">
              {profile?.identity
                ? `@${profile.identity.login}`
                : "Phân tích GitHub"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {profile
                ? `Phân tích lúc ${dateLabel(profile.collectedAt)} · ${profile.limitations.coverage.selected} repo được chọn`
                : linked === true
                  ? "GitHub đã kết nối. Chưa có hồ sơ năng lực đã lưu."
                  : linked === false
                    ? "Kết nối GitHub để Codi hiểu kỹ năng của bạn từ repo công khai."
                    : "Chưa xác nhận trạng thái kết nối GitHub."}
            </p>
          </div>
        </div>
        {(profile || linked === true) && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setConsent("analysis")}
            >
              <RotateCcw aria-hidden="true" />
              {profile ? "Phân tích lại" : "Phân tích GitHub"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setDisconnectConsent(true)}
            >
              <X aria-hidden="true" />
              Ngắt kết nối
            </Button>
          </div>
        )}
      </header>
      {!profile && linked !== true && (
        <Card className={PROFILE_CARD} data-mockup="resultPage.notConnected">
          <CardContent className="space-y-4 px-6">
            <p className="text-sm">
              Codi phân tích danh sách repo công khai và ngôn ngữ đã quan sát,
              chỉ đọc và không ghi lên GitHub. Hồ sơ là ước tính ban đầu, không
              phải đánh giá chính thức.
            </p>
            <p className="text-sm text-muted-foreground">
              Codi chỉ bắt đầu đọc GitHub sau khi bạn xác nhận. Mở trang, nhập
              thông tin hoặc chọn Để sau không bắt đầu phân tích.
            </p>
            <Button
              type="button"
              disabled={busy}
              onClick={() => setConsent(linked === false ? "link" : "analysis")}
            >
              <GithubMark />
              {linked === false ? "Kết nối GitHub" : "Phân tích GitHub"}
            </Button>
          </CardContent>
        </Card>
      )}
      {stale && (
        <p role="status" className="text-sm text-muted-foreground">
          Hồ sơ phân tích hơn 90 ngày trước. Phân tích lại để cập nhật bằng
          chứng.
        </p>
      )}
      {pending && profile && (
        <p role="status" className="border-t-2 border-primary pt-2 text-sm">
          Đang phân tích lại. Kết quả trước vẫn hiển thị bên dưới; chưa được
          thay thế.
        </p>
      )}
      {disconnecting && <p role="status">Đang ngắt kết nối GitHub…</p>}
      {note && (
        <p role="status" className="text-sm">
          {note}
        </p>
      )}
      {failure && (
        <Alert variant="destructive">
          <AlertTitle>
            {failure.code === "rate_limited"
              ? "GitHub đang giới hạn lượt đọc"
              : failure.code === "connection_expired"
                ? "Kết nối GitHub đã hết hiệu lực"
                : failure.action === "disconnect"
                  ? "Chưa ngắt kết nối được GitHub"
                  : "Chưa tạo được hồ sơ năng lực"}
          </AlertTitle>
          <p className="whitespace-pre-wrap break-words">{failure.error}</p>
          {failure.retryAt && (
            <p>
              Có thể thử lại sau {dateLabel(failure.retryAt)}. Codi không tự thử
              lại.
            </p>
          )}
          {(failure.code === "github_not_linked" ||
            failure.code === "connection_expired") && (
            <div className="space-y-2">
              <p>
                Cần liên kết tài khoản GitHub với phiên Codi hiện tại trước khi
                phân tích. Nhập tên người dùng không chứng minh quyền sở hữu.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setConsent("link")}
              >
                {failure.code === "connection_expired"
                  ? "Kết nối lại GitHub"
                  : "Kết nối GitHub"}
              </Button>
            </div>
          )}
          {profile && (
            <p>Kết quả trước vẫn hiển thị bên dưới; chưa được thay thế.</p>
          )}
        </Alert>
      )}
      {profile && <ProfileResult profile={profile} />}
      {insufficient && (
        <Alert aria-label="Kết quả tạm thời chưa đủ bằng chứng">
          <AlertTitle>Chưa đủ dữ liệu để ước tính</AlertTitle>
          <p>
            Kết quả tạm thời, không phải hồ sơ đã lưu. Lượt phân tích này chưa
            ghi nhận quan sát công nghệ.
          </p>
          <p>
            Đã liệt kê {insufficient.limitations.coverage.listed} repo; chọn{" "}
            {insufficient.limitations.coverage.selected} repo.{" "}
            {insufficient.collectionStatus === "partial" ||
            !insufficient.limitations.listingComplete
              ? "Phạm vi thu thập chưa đầy đủ."
              : "Chỉ phản ánh phạm vi đã thu thập."}
          </p>
          <p>
            Thiếu dữ liệu không có nghĩa là năng lực yếu. Kết quả này không được
            lưu để khôi phục sau khi tải lại trang.
          </p>
          <p>
            Bạn có thể phân tích lại sau khi bổ sung code công khai hoặc làm bài
            kiểm tra đầu vào trong khoá học của mình.
          </p>
        </Alert>
      )}
      <Sheet
        open={
          consent !== null ||
          (!flowDismissed && (pending || linking || resultOpen))
        }
        title={
          pending
            ? "Đang phân tích GitHub…"
            : linking
              ? "Đang mở GitHub…"
              : resultOpen && consent === null
                ? "Hồ sơ năng lực đã sẵn sàng"
                : "Kết nối và phân tích GitHub"
        }
        description="Chỉ đọc thông tin công khai sau khi bạn xác nhận."
        className="sm:max-w-[440px] [&>div:first-child]:px-6 [&>div:last-child]:p-6"
        footer={
          pending ? (
            <Button type="button" variant="ghost" onClick={stopWaiting}>
              Dừng chờ
            </Button>
          ) : resultOpen && consent === null ? (
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setResultOpen(false)}
              >
                Đóng
              </Button>
              <Button type="button" onClick={() => setResultOpen(false)}>
                Mở trang phân tích
              </Button>
            </div>
          ) : !linking && consent !== null ? (
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setConsent(null);
                  setNote("Bạn đã chọn Để sau. Không bắt đầu phân tích.");
                }}
              >
                Để sau
              </Button>
              <Button type="submit" form="github-consent-form">
                {consent === "link"
                  ? "Kết nối GitHub"
                  : "Tôi đồng ý · Phân tích"}
              </Button>
            </div>
          ) : undefined
        }
        onOpenChange={(open) => {
          if (!open) {
            if (pending) stopWaiting();
            else {
              setConsent(null);
              setResultOpen(false);
              setFlowDismissed(true);
              if (!linking && consent !== null)
                setNote("Bạn đã chọn Để sau. Không bắt đầu phân tích.");
            }
          }
        }}
      >
        {pending ? (
          <div className="space-y-4">
            <PendingChecklist />
            <p className="text-xs text-muted-foreground">
              Vui lòng giữ trang mở; tối đa 60 giây chờ. Không tự thử lại.{" "}
              {profile && "Kết quả trước vẫn hiển thị bên dưới."}
            </p>
          </div>
        ) : linking ? (
          <p role="status">Đang mở GitHub…</p>
        ) : resultOpen && profile && consent === null ? (
          <div className="space-y-4" data-mockup="resultBody">
            <p className="break-words text-sm">
              <strong>
                {profile.identity
                  ? `@${profile.identity.login}`
                  : "Kết quả từ máy chủ"}
              </strong>{" "}
              · {profile.limitations.coverage.selected} repo được chọn
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">
              {profile.overall?.summary ??
                "Chưa có ước tính tổng thể. Xem quan sát và giới hạn trong trang phân tích."}
            </p>
            <div className="flex flex-wrap gap-2">
              {profile.technologies.map((technology) => (
                <span
                  key={technology.technologyId}
                  className="max-w-full break-words rounded-full border border-border px-3 py-1 text-xs"
                >
                  {technology.observations[0]?.technology} ·{" "}
                  {technology.usage
                    ? GITHUB_USAGE_LABELS[technology.usage]
                    : "Chưa đủ bằng chứng"}
                </span>
              ))}
            </div>
            <section aria-label="Ngôn ngữ trong repo công khai" className="space-y-2">
              <h3 className="text-sm font-semibold">Ngôn ngữ trong repo công khai</h3>
              <LanguageShareSummary profile={profile} />
            </section>
            <p className="text-xs text-muted-foreground">
              Ước tính từ repo công khai, không phải điểm đánh giá chính thức.
              Mở trang phân tích để xem bằng chứng và phạm vi thu thập.
            </p>
          </div>
        ) : (
          <form
            id="github-consent-form"
            onSubmit={confirm}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-foreground">
                <BookOpen aria-hidden="true" className="size-4" />
                Codi
              </span>
              <ArrowRight aria-hidden="true" className="size-4" />
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-foreground">
                <GithubMark />
                GitHub
              </span>
            </div>
            <h2 className="font-semibold">
              {consent === "link"
                ? "Kết nối GitHub"
                : "Cho phép Codi phân tích GitHub?"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Chỉ phân tích tài khoản GitHub được máy chủ xác nhận đã liên kết
              với tài khoản Codi của bạn.
            </p>
            <div className="space-y-2 text-sm">
              <p className="font-medium">Codi sẽ đọc</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Hồ sơ GitHub công khai</li>
                <li>
                  Danh sách repo công khai (bỏ qua repo fork và repo trống)
                </li>
                <li>
                  Ngôn ngữ, file cấu hình như package.json, requirements.txt,
                  pom.xml và README
                </li>
              </ul>
              <p className="font-medium">Codi sẽ không</p>
              <p>
                Không đọc repo riêng tư · Không ghi gì lên GitHub · Không chia
                sẻ với giảng viên.
              </p>
            </div>
            {consent === "analysis" && (
              <div className="space-y-2">
                <label
                  htmlFor="github-profile-input"
                  className="text-sm font-medium"
                >
                  Tên người dùng hoặc URL hồ sơ GitHub (không bắt buộc)
                </label>
                <Input
                  id="github-profile-input"
                  value={input}
                  maxLength={300}
                  autoComplete="off"
                  placeholder="Ví dụ: blu1606 hoặc https://github.com/blu1606"
                  onChange={(event) => setInput(event.target.value)}
                  aria-describedby="github-input-hint"
                />
                <p
                  id="github-input-hint"
                  className="text-xs text-muted-foreground"
                >
                  Chỉ để thể hiện tài khoản bạn muốn phân tích, không xác nhận
                  quyền sở hữu. Để trống để dùng tài khoản đã liên kết.
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {consent === "link"
                ? "Bước tiếp theo chỉ liên kết tài khoản; sau khi quay lại, bạn cần xác nhận phân tích riêng."
                : "Yêu cầu này có thể mất đến 60 giây. Trang không tự phân tích hoặc tự thử lại."}{" "}
              Bạn có thể ngắt kết nối từ trang phân tích sau khi kết nối.
            </p>
          </form>
        )}
      </Sheet>
      <Dialog open={disconnectConsent} onOpenChange={setDisconnectConsent}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ngắt kết nối GitHub?</DialogTitle>
            <DialogDescription>
              Dữ liệu phân tích hiện tại sẽ bị xoá cùng kết nối GitHub. Kết quả
              kiểm tra và tiến độ học đã đo không thay đổi. Bạn có thể kết nối
              lại bất kỳ lúc nào. Nếu GitHub là cách đăng nhập duy nhất, hãy đặt
              mật khẩu trước.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDisconnectConsent(false)}
            >
              Huỷ
            </Button>
            <Button type="button" disabled={busy} onClick={disconnect}>
              Ngắt kết nối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
