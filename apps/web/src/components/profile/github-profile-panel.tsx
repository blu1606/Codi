"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, GitBranch, Info } from "lucide-react";
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
  GITHUB_CONFIDENCE_LABELS,
  GITHUB_OVERALL_LABELS,
  GITHUB_USAGE_LABELS,
  GITHUB_USAGE_LEVELS,
  type GithubProfileCitation,
  type GithubProfileProjection,
} from "@/lib/github-profile-analysis-contract";

interface Failure {
  error: string;
  code: string;
  retryAt?: string;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(date);
}

// Only retained GitHub citation metadata becomes a link; prose/quotes never do.
function citationHref(source: GithubProfileCitation): string | undefined {
  try {
    const url = new URL(source.sourceUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return;
    if (
      source.kind === "file" &&
      url.hostname === "github.com" &&
      /^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/blob\/[a-f0-9]{40}\/[^/]+$/.test(
        url.pathname,
      )
    )
      return url.href;
    if (
      source.kind === "languages" &&
      url.hostname === "api.github.com" &&
      /^\/repos\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/languages$/.test(url.pathname)
    )
      return url.href;
  } catch {
    /* Invalid metadata remains non-clickable text. */
  }
}

function mergeCitations(
  ...groups: GithubProfileCitation[][]
): GithubProfileCitation[] {
  const merged = new Map<string, GithubProfileCitation>();
  for (const source of groups.flat()) {
    const current = merged.get(source.evidenceId);
    if (!current || (!current.quote && source.quote))
      merged.set(source.evidenceId, source);
  }
  return [...merged.values()];
}

function Citations({ sources }: { sources: GithubProfileCitation[] }) {
  return (
    <ul className="space-y-2 text-xs text-muted-foreground">
      {sources.map((source, index) => {
        const href = citationHref(source);
        const label = `Repo #${source.repositoryId} · ${source.path ?? "Ngôn ngữ (quan sát API)"}`;
        return (
          <li
            key={`${source.evidenceId}:${index}`}
            className="space-y-1 break-words"
          >
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-4"
              >
                {label}
              </a>
            ) : (
              <span>{label} · Liên kết không hợp lệ</span>
            )}
            <p>
              Thu thập lúc {dateLabel(source.collectedAt)}
              {source.commitSha
                ? ` · Commit ${source.commitSha}`
                : " · Không phải dữ liệu ghim theo commit"}
            </p>
            {source.quote && (
              <blockquote className="whitespace-pre-wrap border-l-2 border-border pl-3">
                {source.quote}
              </blockquote>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function EvidenceButton({
  label,
  sources,
}: {
  label: string;
  sources: GithubProfileCitation[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label={`Xem bằng chứng: ${label}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Info aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bằng chứng: {label}</DialogTitle>
            <DialogDescription>
              Nguồn được giữ lại từ lần thu thập này. Suy luận chưa được kiểm
              chứng về ý nghĩa.
            </DialogDescription>
          </DialogHeader>
          {sources.length ? (
            <Citations sources={sources} />
          ) : (
            <p>Chưa đủ bằng chứng.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const WAITING_STEPS = [
  "Đọc hồ sơ công khai",
  "Tải danh sách repo công khai",
  "Thống kê ngôn ngữ",
  "Nhận diện công nghệ",
  "Tạo hồ sơ năng lực",
];

function PendingChecklist() {
  const [highlight, setHighlight] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setHighlight((value) => (value + 1) % WAITING_STEPS.length),
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
                ? "flex items-center gap-2 font-medium text-primary"
                : "flex items-center gap-2 text-muted-foreground"
            }
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${index === highlight ? "bg-primary motion-safe:animate-pulse" : "bg-muted"}`}
            />
            {step}
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

function ProfileResult({ profile }: { profile: GithubProfileProjection }) {
  const { limitations, overall } = profile;
  const languages = profile.technologies.flatMap((technology) =>
    technology.observations.filter(
      (item) =>
        item.kind === "language" &&
        item.signal === "language_bytes" &&
        Number.isFinite(item.languageBytes) &&
        (item.languageBytes ?? 0) > 0,
    ),
  );
  const totalBytes = languages.reduce(
    (sum, item) => sum + item.languageBytes!,
    0,
  );
  const supported = profile.technologies.filter(
    (item) =>
      item.usageSource === "inference" &&
      item.inference &&
      item.inference.citations.length > 0 &&
      item.inference.confidence !== "low" &&
      (item.usage === "regular" || item.usage === "deep"),
  );
  const uncertain = profile.technologies.filter(
    (item) =>
      item.inference &&
      (item.inference.confidence === "low" || item.usage === "tried"),
  );
  return (
    <section
      aria-label="Kết quả phân tích"
      className="space-y-6 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">
          {profile.identity
            ? `@${profile.identity.login}`
            : "Kết quả từ máy chủ"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Phân tích lúc {dateLabel(profile.collectedAt)} ·{" "}
          {limitations.coverage.selected} repo được chọn
        </p>
        <p className="text-sm">
          Ước tính từ repo công khai — không phải điểm và không thay bài kiểm
          tra.
        </p>
        <p className="text-sm text-muted-foreground">
          Nội dung suy luận chưa được kiểm chứng về ý nghĩa; không chứng minh
          năng lực hay quyền tác giả.
        </p>
      </header>
      <section className="space-y-3" aria-label="Tóm tắt">
        <h3 className="font-semibold">Tóm tắt</h3>
        {overall ? (
          <div className="space-y-3">
            <p>
              Ước tính từ GitHub: {GITHUB_OVERALL_LABELS[overall.level]} · Độ
              tin cậy {GITHUB_CONFIDENCE_LABELS[overall.confidence]}
            </p>
            <p className="whitespace-pre-wrap break-words">{overall.summary}</p>
            <Citations sources={overall.citations} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {profile.summaryState === "invalidated"
              ? "Tóm tắt cũ không còn phù hợp với các điều chỉnh."
              : "Chưa có ước tính tổng thể."}
          </p>
        )}
        <h4 className="text-sm font-medium">Quan sát từ dữ liệu đã thu thập</h4>
        {profile.factualSummary.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {profile.factualSummary.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            Chưa ghi nhận quan sát công nghệ. Thiếu dữ liệu không có nghĩa là
            năng lực yếu.
          </p>
        )}
      </section>
      <section className="space-y-3" aria-label="Tỉ lệ byte ngôn ngữ">
        <h3 className="font-semibold">Ngôn ngữ đã quan sát</h3>
        <p className="text-sm text-muted-foreground">
          Tỉ lệ byte ngôn ngữ đã thu thập, không phải tỉ lệ dòng code hay mức
          thành thạo.
        </p>
        {languages.length && Number.isFinite(totalBytes) ? (
          languages.map((item) => {
            const share = (item.languageBytes! / totalBytes) * 100;
            return (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words">
                    {item.technology} · {item.languageBytes} byte ·{" "}
                    {new Intl.NumberFormat("vi-VN", {
                      maximumFractionDigits: 1,
                    }).format(share)}
                    %
                  </span>
                  <EvidenceButton
                    label={`Ngôn ngữ ${item.technology}`}
                    sources={item.citations}
                  />
                </div>
                <div
                  role="meter"
                  aria-label={`Tỉ lệ byte ${item.technology}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={share}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm">
            Chưa đủ bằng chứng: chưa có số byte ngôn ngữ dương để vẽ biểu đồ.
          </p>
        )}
      </section>
      <section className="space-y-3" aria-label="Tín hiệu và điều cần xác nhận">
        <h3 className="font-semibold">Tín hiệu từ GitHub</h3>
        <p className="text-sm">
          Không xuất hiện trên GitHub không chứng minh năng lực yếu.
        </p>
        <h4 className="text-sm font-medium">
          Điểm mạnh có bằng chứng hỗ trợ · Ước tính từ GitHub
        </h4>
        {supported.length ? (
          <ul className="list-disc pl-5 text-sm">
            {supported.map((item) => (
              <li key={item.technologyId}>
                {item.observations[0]?.technology} ·{" "}
                {GITHUB_USAGE_LABELS[item.usage!]}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chưa đủ bằng chứng cho điểm mạnh.
          </p>
        )}
        <h4 className="text-sm font-medium">Cần xác nhận</h4>
        {uncertain.length ? (
          <ul className="list-disc pl-5 text-sm">
            {uncertain.map((item) => (
              <li key={item.technologyId}>
                {item.observations[0]?.technology} · Không phải điểm yếu đã được
                chứng minh.
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chưa có suy luận cần xác nhận.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Chưa đủ bằng chứng đối với công nghệ hoặc mảng chưa có suy luận, repo
          bị bỏ qua hay phạm vi thu thập chưa đầy đủ.
        </p>
      </section>
      <section className="space-y-3" aria-label="Công nghệ">
        <h3 className="font-semibold">Công nghệ</h3>
        {(
          [
            ["language", "Ngôn ngữ"],
            ["framework", "Framework & thư viện"],
            ["tool", "Công cụ & hạ tầng"],
          ] as const
        ).map(([kind, label]) => {
          const technologies = profile.technologies.filter((item) =>
            item.observations.some((observation) => observation.kind === kind),
          );
          return (
            technologies.length > 0 && (
              <div key={kind} className="space-y-2">
                <h4 className="text-sm font-medium">{label}</h4>
                {technologies.map((technology) => (
                  <div key={technology.technologyId} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="break-words text-sm">
                          {technology.observations[0]?.technology} ·{" "}
                          {technology.learnerEdited
                            ? "Bạn đã sửa"
                            : "Ước tính từ GitHub"}
                        </p>
                        <div aria-hidden="true" className="flex gap-1">
                          {GITHUB_USAGE_LEVELS.map((level, index) => (
                            <span
                              key={level}
                              className={`h-2 flex-1 rounded-sm ${technology.usage && index <= GITHUB_USAGE_LEVELS.indexOf(technology.usage) ? "bg-primary" : "bg-muted"}`}
                            />
                          ))}
                        </div>
                        <p className="text-sm">
                          {technology.usage
                            ? GITHUB_USAGE_LABELS[technology.usage]
                            : "Chưa đủ bằng chứng: chưa có suy luận mức sử dụng"}
                        </p>
                      </div>
                      <EvidenceButton
                        label={`Công nghệ ${technology.observations[0]?.technology}`}
                        sources={mergeCitations(
                          technology.observations.flatMap(
                            (item) => item.citations,
                          ),
                          technology.inference?.citations ?? [],
                        )}
                      />
                    </div>
                    <details
                      key={technology.technologyId}
                      className="rounded-lg border border-border p-3"
                    >
                      <summary className="cursor-pointer break-words text-sm">
                        {technology.observations[0]?.technology} ·{" "}
                        {technology.usage
                          ? GITHUB_USAGE_LABELS[technology.usage]
                          : "Chưa ước tính mức sử dụng"}
                        {technology.learnerEdited
                          ? " · Bạn đã sửa"
                          : technology.usageSource === "inference"
                            ? " · Ước tính từ GitHub"
                            : ""}
                        {technology.inference &&
                          ` · Độ tin cậy ${GITHUB_CONFIDENCE_LABELS[technology.inference.confidence]}`}
                      </summary>
                      <div className="mt-3 space-y-3">
                        {technology.observations.map((observation) => (
                          <div key={observation.id} className="space-y-2">
                            <p className="text-sm">{observation.text}</p>
                            <Citations sources={observation.citations} />
                          </div>
                        ))}
                        {technology.inference && (
                          <div className="space-y-2">
                            <p className="whitespace-pre-wrap break-words text-sm">
                              Suy luận chưa kiểm chứng:{" "}
                              {technology.inference.explanation}
                            </p>
                            <Citations
                              sources={technology.inference.citations}
                            />
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )
          );
        })}
      </section>
      <section className="space-y-3" aria-label="Mảng kiến thức">
        <h3 className="font-semibold">
          Mảng kiến thức · Suy luận chưa kiểm chứng
        </h3>
        {profile.areas.length ? (
          profile.areas.map((area) => (
            <div key={area.areaId} className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  {area.label} · Độ tin cậy{" "}
                  {GITHUB_CONFIDENCE_LABELS[area.confidence]} · Ước tính từ
                  GitHub
                </span>
                <EvidenceButton
                  label={`Mảng kiến thức ${area.label}`}
                  sources={area.citations}
                />
              </div>
              <details className="rounded-lg border border-border p-3 text-sm">
                <summary className="cursor-pointer break-words">
                  {area.label} · Độ tin cậy{" "}
                  {GITHUB_CONFIDENCE_LABELS[area.confidence]}
                </summary>
                <p className="my-3 whitespace-pre-wrap break-words">
                  {area.explanation}
                </p>
                <Citations sources={area.citations} />
              </details>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Chưa đủ bằng chứng: chưa có suy luận mảng kiến thức.
          </p>
        )}
      </section>
      <details
        className="space-y-3 text-sm"
        open={profile.collectionStatus !== "complete"}
      >
        <summary className="cursor-pointer font-semibold">
          Phạm vi và giới hạn thu thập
        </summary>
        <p>
          Trạng thái:{" "}
          {
            {
              complete: "Hoàn tất trong phạm vi đã chọn",
              partial: "Chỉ thu thập được một phần",
              failed: "Thu thập thất bại",
            }[profile.collectionStatus]
          }
          .
        </p>
        <p>
          Đã liệt kê {limitations.coverage.listed} repo; chọn{" "}
          {limitations.coverage.selected} repo; {limitations.coverage.requests}{" "}
          lượt đọc.{" "}
          {limitations.listingComplete
            ? "Đã duyệt hết danh sách công khai."
            : "Chưa duyệt hết danh sách công khai."}
        </p>
        <p>
          Chỉ đọc file gốc được hỗ trợ; không dò toàn bộ thư mục con. Số byte
          ngôn ngữ và khai báo phụ thuộc không chứng minh mức thành thạo.
        </p>
        <ul className="space-y-2">
          {limitations.repositories.map((repo) => (
            <li key={repo.id}>
              Repo #{repo.id}:{" "}
              {repo.excluded
                ? "Bạn đã loại"
                : {
                    selected: "Đã chọn",
                    fork: "Bỏ qua: fork",
                    empty: "Bỏ qua: trống",
                    capped: "Bỏ qua: giới hạn thu thập",
                  }[repo.disposition]}
              <ul className="pl-4 text-xs text-muted-foreground">
                {repo.files
                  .filter((file) => file.state !== "collected")
                  .map((file) => (
                    <li key={file.path}>
                      {file.path}:{" "}
                      {file.state === "missing"
                        ? "không tìm thấy"
                        : "chưa đọc được"}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
        {limitations.issues.length > 0 && (
          <ul className="space-y-1">
            {limitations.issues.map((issue, index) => (
              <li key={index}>
                Lượt đọc {issue.operation}
                {issue.repositoryId ? ` · Repo #${issue.repositoryId}` : ""}
                {issue.path ? ` · ${issue.path}` : ""}: {issue.code}
                {issue.retryAt
                  ? ` · Có thể thử lại sau ${dateLabel(issue.retryAt)}`
                  : ""}
              </li>
            ))}
          </ul>
        )}
        <p>
          Không suy ra điểm yếu từ file vắng mặt, repo bị bỏ qua hoặc lượt đọc
          chưa hoàn tất.
        </p>
      </details>
    </section>
  );
}

export default function GithubProfilePanel({
  initialProfile = null,
}: { initialProfile?: GithubProfileProjection | null } = {}) {
  const [input, setInput] = useState("");
  const [consent, setConsent] = useState<"analysis" | "link" | null>(null);
  const [profile, setProfile] = useState<GithubProfileProjection | null>(
    initialProfile,
  );
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const [linking, setLinking] = useState(false);
  const [note, setNote] = useState("");
  const active = useRef<{
    controller: AbortController;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);
  useEffect(
    () => () => {
      const request = active.current;
      active.current = null;
      request?.controller.abort();
      if (request?.timer) clearTimeout(request.timer);
    },
    [],
  );

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent || active.current || linking) return;
    const action = consent;
    setConsent(null);
    setFailure(null);
    setNote("");
    if (action === "link") {
      setLinking(true);
      try {
        const result = await authClient.linkSocial({
          provider: "github",
          callbackURL: "/profile/github",
          errorCallbackURL: "/profile/github",
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
        // The owning service returns the accepted projection, not raw model output.
        const latest = result.body.profile as GithubProfileProjection;
        if (
          latest.observationAvailability === "none_observed" &&
          profile?.observationAvailability === "observed"
        ) {
          setNote(
            "Lượt phân tích mới chưa ghi nhận quan sát công nghệ. Kết quả trước vẫn được giữ lại.",
          );
        } else {
          setProfile(latest);
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
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <GitBranch aria-hidden="true" className="size-5" /> Phân tích repo
          công khai
        </h2>
        <p className="text-sm text-muted-foreground">
          Codi chỉ bắt đầu đọc GitHub sau khi bạn xác nhận. Mở trang, nhập thông
          tin hoặc chọn Để sau không bắt đầu phân tích.
        </p>
        <Button
          type="button"
          onClick={() => setConsent("analysis")}
          disabled={pending || linking}
          className="w-full sm:w-auto"
        >
          {profile ? "Phân tích lại" : "Phân tích GitHub"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Trang này chưa xác nhận việc lưu và khôi phục kết quả sau tải lại. Xoá
          hồ sơ và ngắt kết nối là hai thao tác riêng, chưa cung cấp tại đây.
        </p>
      </section>
      {pending && (
        <div className="space-y-3">
          <PendingChecklist />
          <p className="text-sm text-muted-foreground">
            Vui lòng giữ trang mở; tối đa 60 giây chờ. Không tự thử lại.{" "}
            {profile && "Kết quả trước vẫn hiển thị bên dưới."}
          </p>
        </div>
      )}
      {linking && <p role="status">Đang mở GitHub…</p>}
      {note && (
        <p role="status" className="text-sm">
          {note}
        </p>
      )}
      {failure && (
        <Alert variant="destructive">
          <AlertTitle>Chưa tạo được hồ sơ năng lực</AlertTitle>
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
                disabled={pending || linking}
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
      <Dialog
        open={consent !== null}
        onOpenChange={(open) => {
          if (!open) setConsent(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={confirm} className="space-y-4">
            <DialogHeader>
              <div className="flex items-center gap-2 text-primary">
                <BookOpen aria-hidden="true" className="size-5" />
                <span>Codi</span>
                <GitBranch aria-hidden="true" className="size-5" />
                <span>GitHub</span>
              </div>
              <DialogTitle>
                {consent === "link"
                  ? "Kết nối GitHub"
                  : "Cho phép Codi phân tích GitHub?"}
              </DialogTitle>
              <DialogDescription>
                Chỉ phân tích tài khoản GitHub được máy chủ xác nhận đã liên kết
                với tài khoản Codi của bạn.
              </DialogDescription>
            </DialogHeader>
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
              Xoá hồ sơ và ngắt kết nối được quản lý riêng, không thực hiện
              trong hộp thoại này.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setConsent(null);
                  setNote("Bạn đã chọn Để sau. Không bắt đầu phân tích.");
                }}
              >
                Để sau
              </Button>
              <Button type="submit">
                {consent === "link"
                  ? "Kết nối GitHub"
                  : "Tôi đồng ý · Phân tích"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
