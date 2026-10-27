import {
  GITHUB_CONFIDENCE_LABELS,
  type GithubProfileProjection,
} from "@/lib/github-profile-analysis-contract";
import {
  formatBytes,
  languageShares,
  technologyRows,
  type TechnologyRow,
} from "@/lib/github-profile-insights";
import {
  Citations,
  EvidenceButton,
  mergeCitations,
} from "./github-profile-evidence";

const SHARE_FORMAT = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 1,
});
const SLOTS = 5;
const slotColor = (index: number) => `var(--viz-${(index % SLOTS) + 1})`;

function technologySources(
  profile: GithubProfileProjection,
  technologyId: string,
) {
  const technology = profile.technologies.find(
    (item) => item.technologyId === technologyId,
  );
  if (!technology) return [];
  return mergeCitations(
    ...technology.observations.map((item) => item.citations),
    technology.inference?.citations ?? [],
  );
}

/** Retained citations of the observed-language entries with this name (byte observations only). */
function languageSources(profile: GithubProfileProjection, name: string) {
  return mergeCitations(
    ...profile.technologies.flatMap((technology) =>
      technology.observations
        .filter(
          (item) => item.kind === "language" && item.technology === name,
        )
        .map((item) => item.citations),
    ),
  );
}

/** One 100% bar of observed language bytes, with a text legend that carries every exact value. */
export function LanguageShares({
  profile,
}: {
  profile: GithubProfileProjection;
}) {
  const shares = languageShares(profile);
  return (
    <section
      aria-label="Bạn code bằng gì"
      className="min-w-0 space-y-4"
      data-mockup="resultPage.languages"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Bạn code bằng gì</h2>
        <p className="text-xs text-muted-foreground">
          Tỉ lệ byte code theo GitHub trong các repo đã phân tích. Đây không
          phải mức thành thạo và không phải tỉ lệ dòng code.
        </p>
      </div>
      {shares.length ? (
        <>
          <div
            role="group"
            aria-label="Tỉ lệ ngôn ngữ, tổng 100%"
            className="flex h-4 w-full overflow-hidden rounded-full bg-muted"
          >
            {shares.map((item, index) => (
              <div
                key={item.name}
                role="meter"
                aria-label={`Tỉ lệ byte ${item.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={item.share}
                title={`${item.name}: ${SHARE_FORMAT.format(item.share)}% · ${formatBytes(item.bytes)}`}
                className="h-full min-w-[3px]"
                style={{
                  width: `${item.share}%`,
                  backgroundColor: slotColor(index),
                }}
              />
            ))}
          </div>
          <ol className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {shares.map((item, index) => (
              <li
                key={item.name}
                className="flex min-w-0 items-center gap-3 text-sm"
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slotColor(index) }}
                />
                <span className="min-w-0 flex-1 break-words font-medium">
                  {item.name}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {SHARE_FORMAT.format(item.share)}%
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  trong {item.repositoryCount} repo
                </span>
                <EvidenceButton
                  label={`Ngôn ngữ ${item.name}`}
                  sources={languageSources(profile, item.name)}
                />
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Chưa đủ bằng chứng: chưa có số byte ngôn ngữ dương để vẽ biểu đồ.
        </p>
      )}
    </section>
  );
}

/** Compact language list for the saved-result sheet. */
export function LanguageShareSummary({
  profile,
}: {
  profile: GithubProfileProjection;
}) {
  const shares = languageShares(profile).slice(0, 5);
  if (!shares.length)
    return (
      <p className="text-sm text-muted-foreground">
        Chưa đủ bằng chứng: chưa có số byte ngôn ngữ dương để vẽ biểu đồ.
      </p>
    );
  return (
    <ul className="space-y-2 text-sm">
      {shares.map((item, index) => (
        <li key={item.name} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: slotColor(index) }}
          />
          <span className="min-w-0 flex-1 break-words">{item.name}</span>
          <span className="tabular-nums">
            {SHARE_FORMAT.format(item.share)}%
          </span>
          <EvidenceButton
            label={`Ngôn ngữ ${item.name}`}
            sources={languageSources(profile, item.name)}
          />
        </li>
      ))}
    </ul>
  );
}

const GROUPS = [
  ["language", "Ngôn ngữ"],
  ["framework", "Framework & thư viện"],
  ["tool", "Công cụ & hạ tầng"],
] as const;

function TechnologyItem({
  row,
  maxRepos,
  profile,
}: {
  row: TechnologyRow;
  maxRepos: number;
  profile: GithubProfileProjection;
}) {
  const technology = profile.technologies.find(
    (item) => item.technologyId === row.technologyId,
  );
  const sources = technologySources(profile, row.technologyId);
  const width = Math.max(4, (row.repositoryCount / maxRepos) * 100);
  return (
    <li className="flex max-w-full min-w-0 items-start gap-2 border-b border-border py-2 last:border-b-0">
      <details className="group min-w-0 flex-1">
        <summary className="grid cursor-pointer list-none gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 break-words text-sm font-medium">
              {row.name}
            </span>
            {row.learnerEdited && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">
                Bạn đã sửa
              </span>
            )}
          </span>
          <span
            aria-hidden="true"
            className="block h-2 min-w-0 rounded-full bg-muted"
          >
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${width}%` }}
            />
          </span>
          <span className="text-xs text-muted-foreground sm:text-right">
            <span className="font-medium text-foreground">
              {row.usageLabel}
            </span>
            {` · ${row.repositoryCount} repo`}
          </span>
        </summary>
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <p>
            {row.usage ? "Ước tính từ GitHub" : "Chưa có suy luận mức dùng"}
            {row.confidence
              ? ` · Độ tin cậy ${GITHUB_CONFIDENCE_LABELS[row.confidence]}`
              : ""}
          </p>
          {technology?.observations.map((observation) => (
            <p key={observation.id} className="break-words">
              {observation.text}
            </p>
          ))}
          {technology?.inference && (
            <p className="whitespace-pre-wrap break-words">
              Suy luận chưa kiểm chứng: {technology.inference.explanation}
            </p>
          )}
          <Citations sources={sources} />
        </div>
      </details>
      <EvidenceButton label={`Công nghệ ${row.name}`} sources={sources} />
    </li>
  );
}

export function TechnologyUsage({
  profile,
}: {
  profile: GithubProfileProjection;
}) {
  const rows = technologyRows(profile);
  const maxRepos = Math.max(1, ...rows.map((row) => row.repositoryCount));
  return (
    <section
      aria-label="Công nghệ"
      className="min-w-0 space-y-4"
      data-mockup="resultPage.technologies"
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Bạn dùng sâu đến đâu</h2>
        <p className="text-xs text-muted-foreground">
          Độ dài thanh là số repo có công nghệ này. Mức dùng là ước tính từ
          GitHub, không phải điểm và không thay bài kiểm tra.
        </p>
      </div>
      {rows.length ? (
        GROUPS.map(([kind, label]) => {
          const group = rows.filter((row) => row.kind === kind);
          if (!group.length) return null;
          return (
            <div key={kind} className="space-y-1">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {label}
              </h3>
              <ul className="min-w-0">
                {group.map((row) => (
                  <TechnologyItem
                    key={row.technologyId}
                    row={row}
                    maxRepos={maxRepos}
                    profile={profile}
                  />
                ))}
              </ul>
            </div>
          );
        })
      ) : (
        <p className="text-sm text-muted-foreground">
          Chưa ghi nhận quan sát công nghệ. Thiếu dữ liệu không có nghĩa là năng
          lực yếu.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Mức dùng và độ tin cậy là ước tính từ GitHub. Không có dữ liệu lần dùng
        gần nhất.
      </p>
    </section>
  );
}
