import type { ReactNode } from "react";
import { BarChart } from "@codi-1/ui/components/charts";
import { Card, CardContent } from "@codi-1/ui/components/card";
import { Layers } from "lucide-react";
import {
  GITHUB_CONFIDENCE_LABELS,
  GITHUB_OVERALL_LABELS,
  GITHUB_USAGE_LABELS,
  type GithubProfileProjection,
} from "@/lib/github-profile-analysis-contract";
import {
  daysBeforeAnalysis,
  daysSinceLastPush,
  githubInsights,
  languageShares,
  monthlyPushActivity,
  relativeDaysLabel,
  repositoryLabel,
  technologyRows,
} from "@/lib/github-profile-insights";
import {
  EvidenceButton,
  dateLabel,
  mergeCitations,
} from "./github-profile-evidence";
import { LanguageShares, TechnologyUsage } from "./github-profile-stack";

export const PROFILE_CARD = "min-w-0 rounded-xl py-6 shadow-none ring-1 ring-border";
const SLOTS = 5;
const slotColor = (index: number) => `var(--viz-${(index % SLOTS) + 1})`;

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`${PROFILE_CARD} ${className}`}>
      <CardContent className="min-w-0 space-y-4 px-6">{children}</CardContent>
    </Card>
  );
}

function Kpi({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-card p-4 ring-1 ring-border">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums break-words">
        {value}
      </dd>
      <dd className="mt-1 text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

function Overview({ profile }: { profile: GithubProfileProjection }) {
  const { overall, limitations } = profile;
  const languages = languageShares(profile);
  const rows = technologyRows(profile);
  const tools = rows.filter((row) => row.kind !== "language").length;
  const days = daysSinceLastPush(profile);
  return (
    <section
      aria-label="Tóm tắt"
      data-mockup="resultPage.summary"
      className="min-w-0 space-y-4"
    >
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
            {overall
              ? `Ước tính: ${GITHUB_OVERALL_LABELS[overall.level]}`
              : "Chưa có ước tính tổng thể"}
          </span>
          {overall && (
            <span className="rounded-full border border-border px-3 py-1 text-sm">
              Độ tin cậy {GITHUB_CONFIDENCE_LABELS[overall.confidence]}
            </span>
          )}
          {overall && (
            <EvidenceButton
              label="Nhận xét tổng thể"
              sources={overall.citations}
            />
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">
          {overall
            ? overall.summary
            : profile.summaryState === "invalidated"
              ? "Tóm tắt cũ không còn phù hợp với các điều chỉnh."
              : "Codi chưa có nhận xét tổng thể cho hồ sơ này. Các số liệu bên dưới vẫn đúng với repo đã thu thập."}
        </p>
        <p className="text-sm font-medium">
          Ước tính từ repo công khai — không phải điểm và không thay bài kiểm
          tra.
        </p>
      </Panel>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Repo đã phân tích"
          value={String(limitations.coverage.selected)}
          note={`trên ${limitations.coverage.listed} repo đã liệt kê`}
        />
        <Kpi
          label="Ngôn ngữ"
          value={String(languages.length)}
          note="có tỉ lệ code GitHub ghi nhận"
        />
        <Kpi
          label="Framework & công cụ"
          value={String(tools)}
          note="khai báo trong file cấu hình"
        />
        <Kpi
          label="Hoạt động gần nhất"
          value={relativeDaysLabel(days)}
          note={days === null ? "chưa có lần đẩy code" : "lần đẩy code gần nhất"}
        />
      </dl>
    </section>
  );
}

function PushActivity({ profile }: { profile: GithubProfileProjection }) {
  const activity = monthlyPushActivity(profile);
  const total = activity.months.reduce((sum, item) => sum + item.count, 0);
  return (
    <section
      aria-label="Hoạt động đẩy code"
      className="min-w-0 space-y-4"
      data-mockup="resultPage.activity"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Bạn hoạt động thế nào</h2>
        <p className="text-xs text-muted-foreground">
          Mỗi cột đếm repo có lần đẩy code gần nhất trong tháng đó (giờ
          Bangkok), 12 tháng tính đến lúc phân tích. Đây không phải số commit.
        </p>
      </div>
      <BarChart
        items={activity.months.map((item) => ({
          label: item.month === 1 ? `T1 ${item.year}` : `T${item.month}`,
          value: item.count,
          tip: `${item.month}/${item.year}`,
        }))}
        ariaLabel="Số repo theo tháng của lần đẩy code gần nhất"
        valueLabel="Repo đẩy code gần nhất"
        format={(value) => `${value} repo`}
        integerTicks
        emptyText="Chưa có repo nào có lần đẩy code trong 12 tháng gần nhất."
        height={150}
      />
      <p className="text-xs text-muted-foreground">
        Trục tung: số repo (đơn vị repo, mỗi cột là một tháng).
      </p>
      {total > 0 && (
        <p className="text-xs text-muted-foreground">
          Tổng {total} repo trong 12 tháng.
          {activity.outsideWindow > 0 &&
            ` ${activity.outsideWindow} repo đẩy code trước đó.`}
          {activity.undated > 0 &&
            ` ${activity.undated} repo không có thời điểm đẩy code.`}
        </p>
      )}
      {total === 0 && activity.undated > 0 && (
        <p className="text-xs text-muted-foreground">
          {activity.undated} repo không có thời điểm đẩy code. Thiếu dữ liệu không
          có nghĩa là bạn không hoạt động.
        </p>
      )}
    </section>
  );
}

const MAX_BASIS = 4;

function Insights({ profile }: { profile: GithubProfileProjection }) {
  const insights = githubInsights(profile);
  return (
    <section
      aria-label="Điều Codi rút ra"
      className="min-w-0 space-y-4"
      data-mockup="resultPage.insights"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Điều Codi rút ra</h2>
        <p className="text-xs text-muted-foreground">
          Nhận định được tính từ dữ liệu đã thu thập theo quy tắc cố định. Mỗi
          nhận định ghi rõ dựa trên đâu.
        </p>
      </div>
      {insights.length ? (
        <ol className="grid gap-3 md:grid-cols-2">
          {insights.map((insight) => (
            <li
              key={insight.id}
              className="min-w-0 space-y-2 rounded-xl bg-card p-4 ring-1 ring-border"
            >
              <p className="text-sm break-words">{insight.text}</p>
              <p className="text-xs break-words text-muted-foreground">
                Dựa trên:{" "}
                {insight.basis.slice(0, MAX_BASIS).join(" · ")}
                {insight.basis.length > MAX_BASIS &&
                  ` · và ${insight.basis.length - MAX_BASIS} mục khác`}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          Chưa đủ bằng chứng để rút ra điều gì. Thiếu dữ liệu không có nghĩa là
          năng lực yếu.
        </p>
      )}
    </section>
  );
}

function Understanding({ profile }: { profile: GithubProfileProjection }) {
  const { areas } = profile;
  return (
    <section
      className="min-w-0 space-y-4"
      aria-label="Codi hiểu bạn như thế nào"
      data-mockup="understandingSection"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Codi hiểu bạn như thế nào</h2>
        <p className="text-xs text-muted-foreground">
          Suy ra từ repo công khai, chưa được kiểm chứng về ý nghĩa; không chứng
          minh năng lực hay quyền tác giả.
        </p>
      </div>
      <Panel>
        <section aria-label="Mảng kiến thức" className="space-y-3">
          <h3 className="text-sm font-semibold">Mức hiểu biết theo mảng</h3>
          {areas.length ? (
            <ol className="grid gap-3 md:grid-cols-2">
              {areas.map((area) => (
                <li
                  key={area.areaId}
                  className="min-w-0 space-y-1 rounded-lg bg-card p-3 text-sm ring-1 ring-border"
                >
                  <div className="flex items-start gap-2">
                    <span className="inline-grid size-6 shrink-0 place-items-center rounded-sm bg-muted text-muted-foreground">
                      <Layers aria-hidden="true" className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium break-words">{area.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Chưa có dữ liệu đánh giá
                      </p>
                    </div>
                    <EvidenceButton
                      label={`Mảng kiến thức ${area.label}`}
                      sources={area.citations}
                    />
                  </div>
                  <div
                    aria-hidden="true"
                    data-proficiency="unknown"
                    className="grid max-w-[220px] grid-cols-4 gap-1"
                  >
                    {[0, 1, 2, 3].map((cell) => (
                      <span key={cell} className="h-1.5 rounded-full bg-border" />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Độ tin cậy {GITHUB_CONFIDENCE_LABELS[area.confidence]} · Ước
                    tính từ GitHub
                  </p>
                  <p className="text-xs break-words whitespace-pre-wrap text-muted-foreground">
                    {area.explanation}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              Chưa đủ bằng chứng: chưa có suy luận mảng kiến thức.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Chưa đủ bằng chứng đối với mảng chưa có suy luận, repo bị bỏ qua hay
            phạm vi thu thập chưa đầy đủ.
          </p>
        </section>
      </Panel>
    </section>
  );
}
function Courses() {
  return (
    <section
      aria-label="Dùng trong khoá học"
      className="min-w-0 space-y-3"
      data-mockup="resultPage.recommend"
    >
      <h2 className="text-lg font-semibold">Dùng trong khoá học</h2>
      <p className="text-sm text-muted-foreground">
        Chưa áp dụng cho khoá nào. Hồ sơ hiện tại chưa cung cấp gợi ý khoá học
        hay dữ liệu áp dụng trong khoá học, nên chưa có danh sách để hiển thị.
      </p>
    </section>
  );
}

const STATUS_LABELS = {
  selected: "Đã dùng",
  fork: "Bỏ qua: fork",
  empty: "Bỏ qua: trống",
  capped: "Bỏ qua: giới hạn thu thập",
} as const;

function Repositories({ profile }: { profile: GithubProfileProjection }) {
  const { limitations } = profile;
  const sources = mergeCitations(
    ...profile.technologies.flatMap((item) => [
      ...item.observations.map((observation) => observation.citations),
      item.inference?.citations ?? [],
    ]),
    ...profile.areas.map((area) => area.citations),
    profile.overall?.citations ?? [],
  );
  const languageIndex = new Map(
    languageShares(profile).map((item, index) => [item.name, index]),
  );
  return (
    <section
      aria-label="Repo đã phân tích"
      className="min-w-0 space-y-3"
      data-mockup="resultPage.repos"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          Repo công khai đã thu thập ({limitations.repositories.length})
        </h2>
        <p className="text-xs text-muted-foreground">
          Chỉ có tên repo, ngôn ngữ chính và thời điểm đẩy code đã lưu. Không có
          mô tả hay số sao.
        </p>
      </div>
      <ul className="min-w-0 divide-y divide-border rounded-xl ring-1 ring-border">
        {limitations.repositories.map((repo) => {
          const label = repositoryLabel(repo);
          const status = repo.excluded
            ? "Bạn đã loại"
            : STATUS_LABELS[repo.disposition];
          const days = daysBeforeAnalysis(repo.pushedAt, profile.collectedAt);
          const colorIndex = repo.topLanguage
            ? languageIndex.get(repo.topLanguage)
            : undefined;
          const repoSources = sources.filter(
            (source) => source.repositoryId === repo.id,
          );
          return (
            <li
              key={repo.id}
              className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full border border-border"
                style={
                  colorIndex === undefined
                    ? undefined
                    : { backgroundColor: slotColor(colorIndex) }
                }
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold break-words">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {repo.topLanguage ?? "Chưa rõ ngôn ngữ chính"} ·{" "}
                  {repo.pushedAt
                    ? `Đẩy code ${relativeDaysLabel(days)} (${dateLabel(repo.pushedAt)})`
                    : "Chưa rõ lần đẩy code"}
                </p>
                {repo.files
                  .filter((file) => file.state !== "collected")
                  .map((file) => (
                    <p key={file.path} className="text-xs break-words text-muted-foreground">
                      {file.path}: {file.state === "missing" ? "không tìm thấy" : "chưa đọc được"}
                    </p>
                  ))}
              </div>
              <span className="shrink-0 rounded-full border border-border px-2.5 py-0.5 text-xs">
                {status}
              </span>
              <EvidenceButton label={`Repo ${label}`} sources={repoSources} />
            </li>
          );
        })}
      </ul>
      {!limitations.repositories.length && (
        <p className="text-sm text-muted-foreground">
          Chưa đủ bằng chứng: chưa có repo trong phạm vi thu thập.
        </p>
      )}
    </section>
  );
}

function Scope({ profile }: { profile: GithubProfileProjection }) {
  const { limitations } = profile;
  return (
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
        Chỉ đọc file gốc được hỗ trợ; không dò toàn bộ thư mục con. Số byte ngôn
        ngữ và khai báo phụ thuộc không chứng minh mức thành thạo.
      </p>
      <ul className="space-y-1">
        {limitations.issues.map((issue, index) => (
          <li key={index} className="break-words">
            Lượt đọc {issue.operation}
            {issue.repositoryId ? ` · Repo #${issue.repositoryId}` : ""}
            {issue.path ? ` · ${issue.path}` : ""}: {issue.code}
            {issue.retryAt ? ` · Có thể thử lại sau ${dateLabel(issue.retryAt)}` : ""}
          </li>
        ))}
      </ul>
      <p>
        Không suy ra điểm yếu từ file vắng mặt, repo bị bỏ qua hoặc lượt đọc chưa
        hoàn tất.
      </p>
    </details>
  );
}

export function ProfileResult({ profile }: { profile: GithubProfileProjection }) {
  return (
    <section aria-label="Kết quả phân tích" className="min-w-0 space-y-10">
      <Overview profile={profile} />
      <div className="grid min-w-0 gap-4">
        <Panel>
          <LanguageShares profile={profile} />
        </Panel>
        <Panel>
          <PushActivity profile={profile} />
        </Panel>
      </div>
      <Panel>
        <TechnologyUsage profile={profile} />
      </Panel>
      <Insights profile={profile} />
      <Understanding profile={profile} />
      <Courses />
      <Repositories profile={profile} />
      <Scope profile={profile} />
    </section>
  );
}
