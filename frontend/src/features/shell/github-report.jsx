/**
 * Full "Hồ sơ năng lực" report for a saved GitHub profile — port of the real app's
 * components/profile/github-profile-result.tsx, github-profile-stack.tsx, github-profile-evidence.tsx and
 * lib/github-profile-insights.ts, drawn with the redesign's classes (card, stat-tile, gh-*, shell-ghr-*).
 *
 * Input is the backend DTO GithubProfileProjection v1 (backend/src/lib/github-profile-analysis-contract.ts,
 * returned by GET/POST /api/github-profile). Everything shown is computed from that DTO; nothing is canned.
 * Absence of evidence is never phrased as weakness.
 */
import { useEffect, useState } from 'react';
import { Html, Icon } from '../../components/ui/primitives';
import { Modal } from '../../components/ui/overlay-host';
import { charts } from '../../lib/charts';

const USAGE_LABELS = { tried: 'Đã thử', regular: 'Dùng thường xuyên', deep: 'Dùng sâu' };
const CONFIDENCE_LABELS = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };
const OVERALL_LABELS = { new: 'Mới bắt đầu', basic: 'Cơ bản', solid: 'Vững' };
const USAGE_RANK = { deep: 3, regular: 2, tried: 1 };
const TIME_ZONE = 'Asia/Bangkok';
const DAY_MS = 86400000;
const RECENT_WINDOW_DAYS = 90;
const TEST_TOOLS = ['Vitest', 'Jest', 'Playwright'];
const SLOTS = 5;
const slotColor = (i) => `var(--viz-${(i % SLOTS) + 1})`;
const SHARE = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

function dateLabel(value) {
  const d = new Date(value);
  return Number.isNaN(d.valueOf()) ? String(value) : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
}

// ───────────────────────── derived facts (lib/github-profile-insights.ts) ─────────────────────────
const techs = (p) => p.technologies || [];
const repos = (p) => (p.limitations && p.limitations.repositories) || [];

/** Positive observed language bytes only, largest share first; shares sum to 100. */
function languageShares(p) {
  const rows = techs(p).flatMap((t) => (t.observations || [])
    .filter((o) => o.kind === 'language' && o.signal === 'language_bytes' && Number.isFinite(o.languageBytes) && o.languageBytes > 0)
    .map((o) => ({ name: o.technology, bytes: o.languageBytes, repositoryIds: [...(o.repositoryIds || [])] })));
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  if (!total) return [];
  return rows.map((r) => ({ ...r, share: (r.bytes / total) * 100, repositoryCount: r.repositoryIds.length }))
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name, 'en'));
}

function technologyRows(p) {
  return techs(p).filter((t) => t.observations && t.observations.length).map((t) => {
    const first = t.observations[0];
    const repositoryIds = [...new Set(t.observations.flatMap((o) => o.repositoryIds || []))].sort((a, b) => a - b);
    return {
      technologyId: t.technologyId, name: first.technology, kind: first.kind, repositoryIds, repositoryCount: repositoryIds.length,
      usage: t.usage, learnerEdited: !!t.learnerEdited, confidence: (t.inference && t.inference.confidence) || null,
      usageLabel: t.usage ? USAGE_LABELS[t.usage] : 'Chưa đủ bằng chứng về mức dùng',
    };
  }).sort((a, b) => (USAGE_RANK[b.usage] || 0) - (USAGE_RANK[a.usage] || 0) || b.repositoryCount - a.repositoryCount || a.name.localeCompare(b.name, 'en'));
}

const selectedRepos = (p) => repos(p).filter((r) => r.disposition === 'selected' && !r.excluded);
const repositoryLabel = (r) => (r.owner && r.name ? `${r.owner}/${r.name}` : `Repo #${r.id}`);

function daysBefore(pushedAt, analysedAt) {
  const pushed = pushedAt ? Date.parse(pushedAt) : NaN;
  const analysed = Date.parse(analysedAt);
  if (!Number.isFinite(pushed) || !Number.isFinite(analysed)) return null;
  return Math.max(0, Math.floor((analysed - pushed) / DAY_MS));
}
function daysSinceLastPush(p) {
  const days = selectedRepos(p).map((r) => daysBefore(r.pushedAt, p.collectedAt)).filter((d) => d !== null);
  return days.length ? Math.min(...days) : null;
}
function relativeDays(days) {
  if (days === null) return 'Chưa rõ';
  if (days === 0) return 'Hôm nay';
  if (days < 60) return `${days} ngày trước`;
  return `${Math.floor(days / 30)} tháng trước`;
}

function zonedYearMonth(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric' }).formatToParts(date);
  return { year: Number(parts.find((x) => x.type === 'year').value), month: Number(parts.find((x) => x.type === 'month').value) };
}
/** Selected repos counted by the month of their last push, 12 months ending at the analysis month (Bangkok time). */
function monthlyPushActivity(p, months = 12) {
  const ref = zonedYearMonth(new Date(p.collectedAt));
  const buckets = [];
  for (let off = months - 1; off >= 0; off -= 1) {
    const idx = ref.year * 12 + (ref.month - 1) - off;
    buckets.push({ key: `${Math.floor(idx / 12)}-${(idx % 12) + 1}`, year: Math.floor(idx / 12), month: (idx % 12) + 1, count: 0 });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  let outsideWindow = 0;
  let undated = 0;
  for (const r of selectedRepos(p)) {
    const pushed = r.pushedAt ? new Date(r.pushedAt) : null;
    if (!pushed || Number.isNaN(pushed.valueOf())) { undated += 1; continue; }
    const z = zonedYearMonth(pushed);
    const b = byKey.get(`${z.year}-${z.month}`);
    if (b) b.count += 1; else outsideWindow += 1;
  }
  return { months: buckets, outsideWindow, undated };
}

function repoNames(p, ids) {
  const byId = new Map(repos(p).map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean).map(repositoryLabel);
}

/** Deterministic sentences from the DTO only, each with the basis it rests on (max 4). */
function githubInsights(p) {
  const out = [];
  const langs = languageShares(p);
  const rows = technologyRows(p);
  const frameworks = rows.filter((r) => r.kind === 'framework');
  const tools = rows.filter((r) => r.kind === 'tool');
  const main = langs[0];
  if (main) {
    out.push({
      id: 'main-language',
      text: `${main.name} chiếm ${SHARE.format(main.share)}% lượng code theo GitHub${main.share >= 70 ? ', code của bạn tập trung chủ yếu vào ngôn ngữ này' : ''}. Đây không phải mức thành thạo.`,
      basis: [`Tỉ lệ code GitHub ghi nhận · ${main.repositoryCount} repo`, ...repoNames(p, main.repositoryIds)],
    });
  }
  if (main && langs.length >= 3) {
    out.push({
      id: 'breadth',
      text: `Bạn dùng ${langs.length} ngôn ngữ trên các repo đã phân tích, ${main.name} là trọng tâm. Đào sâu một hướng sẽ giúp kỹ năng được chứng minh rõ hơn.`,
      basis: [`Số ngôn ngữ có tỉ lệ code GitHub ghi nhận · ${langs.length}`],
    });
  }
  const deepest = [...frameworks].sort((a, b) => (USAGE_RANK[b.usage] || 0) - (USAGE_RANK[a.usage] || 0) || b.repositoryCount - a.repositoryCount)[0];
  if (deepest) {
    const estimate = deepest.usage && deepest.confidence && deepest.confidence !== 'low'
      ? `Codi ước tính mức ${USAGE_LABELS[deepest.usage].toLowerCase()} (độ tin cậy ${deepest.confidence === 'high' ? 'cao' : 'trung bình'}, chưa kiểm chứng).`
      : 'Chưa có ước tính mức dùng đủ tin cậy.';
    out.push({
      id: 'deepest-framework',
      text: `${deepest.name} được khai báo trong ${deepest.repositoryCount} repo. ${estimate}`,
      basis: [`Khai báo phụ thuộc · ${deepest.repositoryCount} repo`, ...repoNames(p, deepest.repositoryIds)],
    });
  }
  const manifestRead = repos(p).some((r) => r.disposition === 'selected' && (r.files || []).some((f) => f.state === 'collected'));
  if (manifestRead && !tools.some((t) => TEST_TOOLS.includes(t.name))) {
    out.push({
      id: 'no-test-tool-seen',
      text: 'Chưa thấy công cụ kiểm thử (Vitest, Jest, Playwright) trong các file cấu hình đã đọc. Điều này chỉ nói về file đã đọc, không có nghĩa là bạn không viết test.',
      basis: ['File cấu hình đã đọc thành công (package.json / requirements.txt)'],
    });
  }
  const selected = p.limitations.coverage.selected;
  if (selected > 0) {
    const analysed = Date.parse(p.collectedAt);
    const recent = selectedRepos(p).filter((r) => {
      const pushed = r.pushedAt ? Date.parse(r.pushedAt) : NaN;
      return Number.isFinite(pushed) && Number.isFinite(analysed) && pushed <= analysed && analysed - pushed <= RECENT_WINDOW_DAYS * DAY_MS;
    });
    out.push({
      id: 'recent-activity',
      text: `${recent.length}/${selected} repo được đẩy code trong ${RECENT_WINDOW_DAYS} ngày trước lần phân tích${recent.length === 0 ? '. Thiếu lần đẩy gần đây không chứng minh bạn ngừng học' : '.'}`,
      basis: ['Thời điểm đẩy code gần nhất của từng repo đã chọn'],
    });
  }
  return out.slice(0, 4);
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: u === 0 || v >= 10 ? 0 : 1 }).format(v)} ${units[u]}`;
}

// ───────────────────────── evidence (github-profile-evidence.tsx) ─────────────────────────
/** Only retained GitHub citation metadata becomes a link (pinned blob or the languages API); anything else stays text. */
function citationHref(source) {
  try {
    const url = new URL(source.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return undefined;
    if (source.kind === 'file' && url.hostname === 'github.com' && /^\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/blob\/[a-f0-9]{40}\/[^/]+$/.test(url.pathname)) return url.href;
    if (source.kind === 'languages' && url.hostname === 'api.github.com' && /^\/repos\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+\/languages$/.test(url.pathname)) return url.href;
  } catch { /* invalid metadata stays non-clickable text */ }
  return undefined;
}

function mergeCitations(...groups) {
  const merged = new Map();
  for (const s of groups.flat()) {
    if (!s) continue;
    const cur = merged.get(s.evidenceId);
    if (!cur || (!cur.quote && s.quote)) merged.set(s.evidenceId, s);
  }
  return [...merged.values()];
}

function Citations({ sources }) {
  return (
    <ul className="shell-ghr-cites">
      {mergeCitations(sources).map((s, i) => {
        const href = citationHref(s);
        const label = `Repo #${s.repositoryId} · ${s.path || 'Ngôn ngữ (quan sát API)'}`;
        return (
          <li key={`${s.evidenceId}:${i}`} className="stack-1">
            {href ? <a href={href} target="_blank" rel="noopener noreferrer">{label}</a> : <span>{label} · Liên kết không hợp lệ</span>}
            <span>Thu thập lúc {dateLabel(s.collectedAt)}{s.commitSha ? ` · Commit ${s.commitSha}` : ' · Không phải dữ liệu ghim theo commit'}</span>
            {s.quote && <blockquote>{s.quote}</blockquote>}
          </li>
        );
      })}
    </ul>
  );
}

function EvidenceButton({ label, sources }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-icon btn-sm shell-ghr-ev" aria-label={`Xem bằng chứng: ${label}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="info" className="icon-sm" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Bằng chứng: ${label}`}>
        <div className="stack-3 shell-ghr-modal">
          <p className="small muted" style={{ margin: 0 }}>Nguồn được giữ lại từ lần thu thập này. Suy luận chưa được kiểm chứng về ý nghĩa.</p>
          {sources.length ? <Citations sources={sources} /> : <p className="small" style={{ margin: 0 }}>Chưa đủ bằng chứng.</p>}
        </div>
      </Modal>
    </>
  );
}

const techSources = (t) => (t ? mergeCitations(...(t.observations || []).map((o) => o.citations || []), (t.inference && t.inference.citations) || []) : []);
const languageSources = (p, name) => mergeCitations(...techs(p).flatMap((t) => (t.observations || []).filter((o) => o.kind === 'language' && o.technology === name).map((o) => o.citations || [])));

// ───────────────────────── sections ─────────────────────────
function SectionHead({ title, note }) {
  return (
    <div className="stack-1">
      <h3 style={{ margin: 0 }}>{title}</h3>
      {note && <p className="xsmall muted" style={{ margin: 0 }}>{note}</p>}
    </div>
  );
}

/**
 * A short ordered scale (overall level, usage, confidence): filled steps up to `at`, the reached step marked.
 * Large scales print every step label; small ones are decorative pips beside a text label the caller shows.
 */
function Scale({ labels, at, size = 'sm', ariaLabel }) {
  if (size === 'lg') {
    return (
      <ol className="ghr-scale is-lg" aria-label={ariaLabel}>
        {labels.map((label, i) => (
          <li key={label} className={`${i <= at ? 'is-on' : ''} ${i === at ? 'is-at' : ''}`.trim()} aria-current={i === at ? 'step' : undefined}>
            <i aria-hidden="true" />
            <span>{label}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <span className="ghr-scale" aria-hidden="true">
      {labels.map((label, i) => <i key={label} className={i <= at ? 'is-on' : undefined} />)}
    </span>
  );
}

const LEVEL_KEYS = ['new', 'basic', 'solid'];
const USAGE_KEYS = ['tried', 'regular', 'deep'];
const CONFIDENCE_KEYS = ['low', 'medium', 'high'];

/** Every retained source the analysis rests on, split by kind. */
function evidenceCounts(p) {
  const all = mergeCitations(
    ...techs(p).flatMap((t) => [...(t.observations || []).map((o) => o.citations || []), (t.inference && t.inference.citations) || []]),
    ...(p.areas || []).map((a) => a.citations || []),
    (p.overall && p.overall.citations) || [],
  );
  return { total: all.length, files: all.filter((s) => s.kind === 'file').length, languages: all.filter((s) => s.kind === 'languages').length };
}

function Overview({ profile }) {
  const { overall, limitations } = profile;
  const langs = languageShares(profile);
  const tools = technologyRows(profile).filter((r) => r.kind !== 'language').length;
  const days = daysSinceLastPush(profile);
  const ev = evidenceCounts(profile);
  const { selected, listed } = limitations.coverage;
  const levelAt = overall ? LEVEL_KEYS.indexOf(overall.level) : -1;
  const ledger = [
    ['Repo đã phân tích', `${selected}/${listed}`, listed ? (selected / listed) * 100 : 0, 'repo công khai đã liệt kê'],
    ['Nguồn bằng chứng', String(ev.total), null, `${ev.files} file cấu hình · ${ev.languages} thống kê ngôn ngữ`],
    ['Ngôn ngữ', String(langs.length), null, 'có tỉ lệ code GitHub ghi nhận'],
    ['Framework & công cụ', String(tools), null, 'khai báo trong file cấu hình'],
    ['Hoạt động gần nhất', relativeDays(days), null, days === null ? 'chưa có lần đẩy code' : 'lần đẩy code gần nhất'],
  ];
  return (
    <section aria-label="Tóm tắt" className="card"><div className="card-body ghr-overview">
      <div className="stack-3 ghr-level">
        <div className="row-between" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Mức tổng thể ước tính</h3>
          {overall && <EvidenceButton label="Nhận xét tổng thể" sources={overall.citations || []} />}
        </div>
        {overall ? (
          <>
            <Scale size="lg" labels={LEVEL_KEYS.map((k) => OVERALL_LABELS[k])} at={levelAt} ariaLabel={`Mức tổng thể: ${OVERALL_LABELS[overall.level] || overall.level} trên thang Mới bắt đầu, Cơ bản, Vững`} />
            <p className="small" style={{ marginBottom: 0 }}><span className="strong">{OVERALL_LABELS[overall.level] || overall.level}</span> · độ tin cậy {CONFIDENCE_LABELS[overall.confidence].toLowerCase()}</p>
          </>
        ) : <p className="small muted" style={{ margin: 0 }}>Chưa có ước tính tổng thể.</p>}
        <p className="shell-ghr-prose small" style={{ margin: 0 }}>
          {overall ? overall.summary
            : profile.summaryState === 'invalidated' ? 'Tóm tắt cũ không còn phù hợp với các điều chỉnh.'
              : 'Codi chưa có nhận xét tổng thể cho hồ sơ này. Các số liệu bên cạnh vẫn đúng với repo đã thu thập.'}
        </p>
        <p className="xsmall muted" style={{ margin: 0 }}>Ước tính từ repo công khai, không phải điểm và không thay bài kiểm tra.</p>
      </div>
      <dl className="ghr-ledger">
        {ledger.map(([label, value, bar, note]) => (
          <div key={label} className="ghr-ledger-row">
            <dt>{label}</dt>
            <dd className={`ghr-ledger-value${/\d/.test(value) && !/[a-zà-ỹ]/i.test(value) ? '' : ' is-text'}`}>{value}</dd>
            <dd className="ghr-ledger-note">
              {bar !== null && <span className="ghr-track is-thin" aria-hidden="true"><span style={{ width: `${Math.max(2, bar)}%` }} /></span>}
              {note}
            </dd>
          </div>
        ))}
      </dl>
    </div></section>
  );
}

function LanguageShares({ profile }) {
  const shares = languageShares(profile);
  return (
    <section aria-label="Bạn code bằng gì" className="stack-4">
      <SectionHead title="Bạn code bằng gì" note="Tỉ lệ code theo GitHub trong các repo đã phân tích, tổng 100%. Không phải mức thành thạo, không phải số dòng code." />
      {shares.length ? (
        <ol className="ghr-bars" aria-label="Tỉ lệ code theo ngôn ngữ">
          {shares.map((s, i) => (
            <li key={s.name} className="ghr-bar-row" title={`${s.name}: ${SHARE.format(s.share)}% · ${formatBytes(s.bytes)}`}>
              <span className="ghr-bar-name"><span className="gh-lang-dot" aria-hidden="true" style={{ background: slotColor(i) }} />{s.name}</span>
              <span className="ghr-track" aria-hidden="true"><span style={{ width: `${Math.max(1, s.share)}%`, background: slotColor(i) }} /></span>
              <span className="ghr-bar-value"><span className="strong shell-ghr-num">{SHARE.format(s.share)}%</span> <span className="xsmall muted">· {s.repositoryCount} repo</span></span>
              <EvidenceButton label={`Ngôn ngữ ${s.name}`} sources={languageSources(profile, s.name)} />
            </li>
          ))}
        </ol>
      ) : <p className="small muted" style={{ margin: 0 }}>Chưa đủ bằng chứng: chưa có số byte ngôn ngữ dương để vẽ biểu đồ.</p>}
    </section>
  );
}

/** How many observed technologies sit at each usage estimate (part-to-whole, counts in the legend). */
function UsageMix({ rows }) {
  const count = (u) => rows.filter((r) => r.usage === u).length;
  const html = charts.stacked({
    segments: [
      { label: USAGE_LABELS.deep, value: count('deep'), tone: 'slot-1' },
      { label: USAGE_LABELS.regular, value: count('regular'), tone: 'slot-3' },
      { label: USAGE_LABELS.tried, value: count('tried'), tone: 'slot-4' },
      { label: 'Chưa rõ mức dùng', value: rows.filter((r) => !r.usage).length, tone: 'neutral' },
    ],
    format: (v) => `${v} công nghệ`,
    emptyText: 'Chưa có công nghệ nào được quan sát.',
  });
  return (
    <div className="stack-2">
      <h4 className="shell-ghr-group">Phân bố theo mức dùng ({rows.length} công nghệ)</h4>
      <Html html={html} />
    </div>
  );
}

function PushActivity({ profile }) {
  const a = monthlyPushActivity(profile);
  const total = a.months.reduce((s, m) => s + m.count, 0);
  const html = charts.bars({
    items: a.months.map((m) => ({ label: m.month === 1 ? `T1 ${m.year}` : `T${m.month}`, value: m.count, tip: `${m.month}/${m.year}` })),
    ariaLabel: 'Số repo theo tháng của lần đẩy code gần nhất',
    valueLabel: 'Repo đẩy code gần nhất',
    format: (v) => `${v} repo`,
    axisFormat: (v) => (Number.isInteger(v) ? String(v) : ''), // repo counts are whole numbers; skip fractional ticks
    emptyText: 'Chưa có repo nào có lần đẩy code trong 12 tháng gần nhất.',
    height: 150,
    maxXLabels: 6, // every other month: 12 labels collide at phone width
  });
  return (
    <section aria-label="Hoạt động đẩy code" className="stack-4">
      <SectionHead title="Bạn hoạt động thế nào" note="Mỗi cột đếm repo có lần đẩy code gần nhất trong tháng đó (giờ Bangkok), 12 tháng tính đến lúc phân tích. Đây không phải số commit." />
      <Html html={html} />
      <p className="xsmall muted" style={{ margin: 0 }}>Trục tung: số repo (đơn vị repo, mỗi cột là một tháng).</p>
      {total > 0 && (
        <p className="xsmall muted" style={{ margin: 0 }}>
          Tổng {total} repo trong 12 tháng.{a.outsideWindow > 0 && ` ${a.outsideWindow} repo đẩy code trước đó.`}{a.undated > 0 && ` ${a.undated} repo không có thời điểm đẩy code.`}
        </p>
      )}
      {total === 0 && a.undated > 0 && <p className="xsmall muted" style={{ margin: 0 }}>{a.undated} repo không có thời điểm đẩy code. Thiếu dữ liệu không có nghĩa là bạn không hoạt động.</p>}
    </section>
  );
}

const GROUPS = [['language', 'Ngôn ngữ'], ['framework', 'Framework & thư viện'], ['tool', 'Công cụ & hạ tầng']];

/** Strength or needs-confirmation status. Missing evidence is never a weakness. */
function strengthStatus(t) {
  const inf = t && t.inference;
  if (t && t.usageSource === 'inference' && inf && inf.citations && inf.citations.length && inf.confidence !== 'low' && (t.usage === 'regular' || t.usage === 'deep')) return 'Điểm mạnh có bằng chứng hỗ trợ.';
  if (inf && (inf.confidence === 'low' || (t && t.usage === 'tried'))) return 'Cần xác nhận · Không phải điểm yếu đã được chứng minh.';
  return 'Chưa đủ bằng chứng cho điểm mạnh.';
}

function TechnologyItem({ row, profile }) {
  const t = techs(profile).find((x) => x.technologyId === row.technologyId);
  const sources = techSources(t);
  return (
    <li className="shell-ghr-tech-item">
      <details className="shell-ghr-tech-details">
        <summary className="shell-ghr-tech-row">
          <span className="shell-ghr-tech-name">
            <span className="strong">{row.name}</span>
            {row.learnerEdited && <span className="badge badge-neutral">Bạn đã sửa</span>}
          </span>
          <Scale labels={USAGE_KEYS} at={row.usage ? USAGE_KEYS.indexOf(row.usage) : -1} />
          <span className="xsmall muted"><span className="strong shell-ghr-fg">{row.usageLabel}</span> · {row.repositoryCount} repo</span>
        </summary>
        <div className="stack-2 xsmall muted shell-ghr-tech-body">
          <p style={{ margin: 0 }}>{row.usage ? 'Ước tính từ GitHub' : 'Chưa có suy luận mức dùng'}{row.confidence ? ` · Độ tin cậy ${CONFIDENCE_LABELS[row.confidence]}` : ''}</p>
          <p className="strong shell-ghr-fg" style={{ margin: 0 }}>{strengthStatus(t)}</p>
          {t && t.observations.map((o) => <p key={o.id} style={{ margin: 0 }}>{o.text}</p>)}
          {t && t.inference && <p className="shell-ghr-prose" style={{ margin: 0 }}>Suy luận chưa kiểm chứng: {t.inference.explanation}</p>}
          <Citations sources={sources} />
        </div>
      </details>
      <EvidenceButton label={`Công nghệ ${row.name}`} sources={sources} />
    </li>
  );
}

function TechnologyUsage({ profile }) {
  const rows = technologyRows(profile);
  return (
    <section aria-label="Công nghệ" className="stack-4">
      <SectionHead title="Bạn dùng sâu đến đâu" note="Thang ba bậc: Đã thử, Dùng thường xuyên, Dùng sâu. Mức dùng là ước tính từ GitHub, không phải điểm và không thay bài kiểm tra." />
      {rows.length > 0 && <UsageMix rows={rows} />}
      {rows.length ? GROUPS.map(([kind, label]) => {
        const group = rows.filter((r) => r.kind === kind);
        if (!group.length) return null;
        return (
          <div key={kind} className="stack-1">
            <h4 className="shell-ghr-group">{label}</h4>
            <ul className="shell-ghr-tech">{group.map((r) => <TechnologyItem key={r.technologyId} row={r} profile={profile} />)}</ul>
          </div>
        );
      }) : <p className="small muted" style={{ margin: 0 }}>Chưa ghi nhận quan sát công nghệ. Thiếu dữ liệu không có nghĩa là năng lực yếu.</p>}
      <p className="xsmall muted" style={{ margin: 0 }}>Mức dùng và độ tin cậy là ước tính từ GitHub. Không có dữ liệu lần dùng gần nhất. Không xuất hiện trên GitHub không chứng minh năng lực yếu.</p>
    </section>
  );
}

const MAX_BASIS = 4;
function Insights({ profile }) {
  const list = githubInsights(profile);
  return (
    <section aria-label="Điều Codi rút ra" className="stack-4">
      <SectionHead title="Điều Codi rút ra" note="Nhận định được tính từ dữ liệu đã thu thập theo quy tắc cố định. Mỗi nhận định ghi rõ dựa trên đâu." />
      {list.length ? (
        <ol className="gh-signals grid-2" style={{ display: 'grid' }}>
          {list.map((x) => (
            <li key={x.id} className="gh-signal">
              <span className="gh-signal-icon" aria-hidden="true"><Icon name="lightbulb" className="icon-sm" /></span>
              <div className="stack-1" style={{ minWidth: 0 }}>
                <p className="small" style={{ margin: 0 }}>{x.text}</p>
                <p className="xsmall muted" style={{ margin: 0, overflowWrap: 'anywhere' }}>
                  Dựa trên: {x.basis.slice(0, MAX_BASIS).join(' · ')}{x.basis.length > MAX_BASIS && ` · và ${x.basis.length - MAX_BASIS} mục khác`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="small muted" style={{ margin: 0 }}>Chưa đủ bằng chứng để rút ra điều gì. Thiếu dữ liệu không có nghĩa là năng lực yếu.</p>}
    </section>
  );
}

function Understanding({ profile }) {
  const areas = profile.areas || [];
  return (
    <section aria-label="Codi hiểu bạn như thế nào" className="stack-4 gh-under">
      <SectionHead title="Codi hiểu bạn như thế nào" note="Mảng kiến thức suy ra từ repo công khai, đo bằng độ tin cậy của suy luận (Thấp, Trung bình, Cao), không phải mức thành thạo. Chưa được kiểm chứng về ý nghĩa." />
      {areas.length ? (
        <ol className="gh-domains">
          {areas.map((a) => (
            <li key={a.areaId} className="gh-domain">
              <div className="gh-domain-head">
                <span className="gh-domain-name" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{a.label}</span>
                <Scale labels={CONFIDENCE_KEYS} at={CONFIDENCE_KEYS.indexOf(a.confidence)} />
                <span className="gh-domain-level">Độ tin cậy {CONFIDENCE_LABELS[a.confidence].toLowerCase()}</span>
                <EvidenceButton label={`Mảng kiến thức ${a.label}`} sources={a.citations || []} />
              </div>
              <p className="xsmall muted shell-ghr-prose" style={{ margin: 0 }}>{a.explanation}</p>
            </li>
          ))}
        </ol>
      ) : <p className="small muted" style={{ margin: 0 }}>Chưa đủ bằng chứng: chưa có suy luận mảng kiến thức.</p>}
      <p className="xsmall muted" style={{ margin: 0 }}>Chưa đủ bằng chứng đối với mảng chưa có suy luận, repo bị bỏ qua hay phạm vi thu thập chưa đầy đủ.</p>
    </section>
  );
}

const STATUS_LABELS = { selected: 'Đã dùng', fork: 'Bỏ qua: fork', empty: 'Bỏ qua: trống', capped: 'Bỏ qua: giới hạn thu thập' };

function Repositories({ profile }) {
  const list = repos(profile);
  const sources = mergeCitations(
    ...techs(profile).flatMap((t) => [...(t.observations || []).map((o) => o.citations || []), (t.inference && t.inference.citations) || []]),
    ...(profile.areas || []).map((a) => a.citations || []),
    (profile.overall && profile.overall.citations) || [],
  );
  const langIndex = new Map(languageShares(profile).map((x, i) => [x.name, i]));
  return (
    <section aria-label="Repo đã phân tích" className="stack-3">
      <SectionHead title={`Repo công khai đã thu thập (${list.length})`} note="Chỉ có tên repo, ngôn ngữ chính và thời điểm đẩy code đã lưu. Không có mô tả hay số sao." />
      {list.length ? (
        <ul className="gh-repos">
          {list.map((r) => {
            const label = repositoryLabel(r);
            const days = daysBefore(r.pushedAt, profile.collectedAt);
            const ci = r.topLanguage ? langIndex.get(r.topLanguage) : undefined;
            return (
              <li key={r.id} className="gh-repo shell-ghr-repo">
                <span className="gh-lang-dot shell-ghr-repo-dot" aria-hidden="true" style={ci === undefined ? undefined : { background: slotColor(ci) }} />
                <div className="stack-1 shell-ghr-repo-main">
                  <span className="strong">{label}</span>
                  <span className="xsmall muted">{r.topLanguage || 'Chưa rõ ngôn ngữ chính'} · {r.pushedAt ? `Đẩy code ${relativeDays(days)} (${dateLabel(r.pushedAt)})` : 'Chưa rõ lần đẩy code'}</span>
                  {(r.files || []).filter((f) => f.state !== 'collected').map((f) => (
                    <span key={f.path} className="xsmall muted">{f.path}: {f.state === 'missing' ? 'không tìm thấy' : 'chưa đọc được'}</span>
                  ))}
                </div>
                <span className={`badge ${r.excluded || r.disposition !== 'selected' ? 'badge-neutral' : 'badge-outline'}`}>{r.excluded ? 'Bạn đã loại' : STATUS_LABELS[r.disposition] || r.disposition}</span>
                <EvidenceButton label={`Repo ${label}`} sources={sources.filter((s) => s.repositoryId === r.id)} />
              </li>
            );
          })}
        </ul>
      ) : <p className="small muted" style={{ margin: 0 }}>Chưa đủ bằng chứng: chưa có repo trong phạm vi thu thập.</p>}
    </section>
  );
}

const COLLECTION_LABELS = { complete: 'Hoàn tất trong phạm vi đã chọn', partial: 'Chỉ thu thập được một phần', failed: 'Thu thập thất bại' };

function Scope({ profile }) {
  const { limitations } = profile;
  const c = limitations.coverage;
  return (
    <details className="card shell-ghr-scope" open={profile.collectionStatus !== 'complete'}>
      <summary className="strong">Phạm vi và giới hạn thu thập</summary>
      <div className="stack-2 small">
        <p style={{ margin: 0 }}>Trạng thái: {COLLECTION_LABELS[profile.collectionStatus] || profile.collectionStatus}.</p>
        <p style={{ margin: 0 }}>Đã liệt kê {c.listed} repo; chọn {c.selected} repo; {c.requests} lượt đọc. {limitations.listingComplete ? 'Đã duyệt hết danh sách công khai.' : 'Chưa duyệt hết danh sách công khai.'}</p>
        <p style={{ margin: 0 }}>Chỉ đọc file gốc được hỗ trợ; không dò toàn bộ thư mục con. Số byte ngôn ngữ và khai báo phụ thuộc không chứng minh mức thành thạo.</p>
        {(limitations.issues || []).length > 0 && (
          <ul className="stack-1" style={{ margin: 0, paddingLeft: 18 }}>
            {limitations.issues.map((x, i) => (
              <li key={i} style={{ overflowWrap: 'anywhere' }}>
                Lượt đọc {x.operation}{x.repositoryId ? ` · Repo #${x.repositoryId}` : ''}{x.path ? ` · ${x.path}` : ''}: {x.code}{x.retryAt ? ` · Có thể thử lại sau ${dateLabel(x.retryAt)}` : ''}
              </li>
            ))}
          </ul>
        )}
        <p style={{ margin: 0 }}>Không suy ra điểm yếu từ file vắng mặt, repo bị bỏ qua hoặc lượt đọc chưa hoàn tất.</p>
      </div>
    </details>
  );
}

/**
 * The full saved-profile report (real ProfileResult), charts first: level and counts, language share, activity,
 * usage depth, areas; then the rules-based insights, `guidance` (the AI course-guidance choice) and the evidence.
 */
export function ProfileReport({ profile, guidance = null }) {
  return (
    <section aria-label="Kết quả phân tích" className="stack-6 shell-ghr">
      <Overview profile={profile} />
      <div className="ghr-pair">
        <div className="card"><div className="card-body"><LanguageShares profile={profile} /></div></div>
        <div className="card"><div className="card-body"><PushActivity profile={profile} /></div></div>
      </div>
      <div className="card"><div className="card-body"><TechnologyUsage profile={profile} /></div></div>
      <div className="card"><div className="card-body"><Understanding profile={profile} /></div></div>
      <Insights profile={profile} />
      {guidance}
      <Repositories profile={profile} />
      <Scope profile={profile} />
    </section>
  );
}

// ───────────────────────── learner corrections (PATCH /api/github-profile/corrections) ─────────────────────────
const idName = (id) => { const raw = String(id || '').split(':').slice(1).join(':'); try { return decodeURIComponent(raw) || id; } catch { return raw || id; } };

/**
 * Learner edits on a saved profile: leave out repositories as evidence, set a technology's usage or hide it. The
 * server re-projects the profile from the stored snapshot; a changed repository list also rewrites the AI summary.
 * Area corrections are kept as they are. `onSave(corrections)` receives the full corrections object.
 */
export function CorrectionsEditor({ profile, busy, onSave, onCancel }) {
  const initial = profile.corrections || { excludedRepositoryIds: [], technologies: [], areas: [] };
  const candidates = repos(profile).filter((r) => r.disposition === 'selected');
  const [excluded, setExcluded] = useState(() => new Set(initial.excludedRepositoryIds || []));
  // technologyId → { usage: '' | tried | regular | deep, hidden }
  const [edits, setEdits] = useState(() => Object.fromEntries((initial.technologies || []).map((t) => [t.technologyId, { usage: t.usage || '', hidden: !!t.hidden }])));
  const visible = techs(profile).map((t) => ({ id: t.technologyId, name: (t.observations && t.observations[0] && t.observations[0].technology) || idName(t.technologyId), estimate: t.learnerEdited ? null : t.usage }));
  const hiddenOnly = (initial.technologies || []).filter((t) => t.hidden && !visible.some((v) => v.id === t.technologyId))
    .map((t) => ({ id: t.technologyId, name: idName(t.technologyId), estimate: null }));
  const rows = [...visible, ...hiddenOnly];
  const edit = (id) => edits[id] || { usage: '', hidden: false };
  const setEdit = (id, patch) => setEdits((x) => ({ ...x, [id]: { ...edit(id), ...patch } }));
  const toggleRepo = (id) => setExcluded((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const before = JSON.stringify([...(initial.excludedRepositoryIds || [])].sort((a, b) => a - b));
  const repoChanged = JSON.stringify([...excluded].sort((a, b) => a - b)) !== before;

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    const technologies = Object.entries(edits)
      .filter(([, v]) => v.usage || v.hidden)
      .map(([technologyId, v]) => ({ technologyId, ...(v.usage ? { usage: v.usage } : {}), ...(v.hidden ? { hidden: true } : {}) }));
    onSave({ excludedRepositoryIds: [...excluded].sort((a, b) => a - b), technologies, areas: initial.areas || [] });
  };

  return (
    <form className="card" onSubmit={submit} aria-label="Chỉnh sửa hồ sơ năng lực" aria-busy={busy || undefined}>
      <div className="card-body stack-4">
        <div className="stack-1">
          <h3 className="small strong" style={{ margin: 0 }}>Chỉnh sửa hồ sơ năng lực</h3>
          <p className="xsmall muted" style={{ margin: 0 }}>Chỉnh sửa chỉ áp dụng cho hồ sơ trên Codi, không ghi gì lên GitHub. Mức dùng bạn chọn được ghi nhãn &quot;Bạn đã sửa&quot; thay cho ước tính.</p>
        </div>
        <fieldset className="stack-2" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small strong">Repo dùng làm bằng chứng</legend>
          {candidates.length ? (
            <ul className="stack-1" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {candidates.map((r) => (
                <li key={r.id}><label className="row small" style={{ gap: 8 }}>
                  <input type="checkbox" checked={!excluded.has(r.id)} onChange={() => toggleRepo(r.id)} disabled={busy} />
                  <span style={{ overflowWrap: 'anywhere' }}>{repositoryLabel(r)}{r.topLanguage ? <span className="muted"> · {r.topLanguage}</span> : null}</span>
                </label></li>
              ))}
            </ul>
          ) : <p className="small muted" style={{ margin: 0 }}>Không có repo nào được dùng trong lượt phân tích này.</p>}
          {repoChanged && <p className="xsmall muted" style={{ margin: 0 }} role="status">Bỏ hoặc thêm repo sẽ làm Codi viết lại phần tóm tắt từ dữ liệu đã thu thập (không đọc lại GitHub). Tóm tắt cũ được ẩn cho đến khi xong.</p>}
        </fieldset>
        <fieldset className="stack-2" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small strong">Công nghệ</legend>
          {rows.length ? (
            <ul className="stack-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rows.map((t) => {
                const v = edit(t.id); const sel = `ghc-usage-${t.id.replace(/[^a-z0-9]/gi, '-')}`;
                return (
                  <li key={t.id} className="row-between" style={{ gap: 12, flexWrap: 'wrap' }}>
                    <label className="small strong" htmlFor={sel} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{t.name}</label>
                    <span className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                      <select id={sel} className="select" value={v.usage} disabled={busy || v.hidden} onChange={(e) => setEdit(t.id, { usage: e.target.value })}>
                        <option value="">{t.estimate ? `Theo ước tính (${USAGE_LABELS[t.estimate]})` : 'Theo ước tính của Codi'}</option>
                        {Object.entries(USAGE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                      </select>
                      <label className="row xsmall" style={{ gap: 6 }}><input type="checkbox" checked={v.hidden} disabled={busy} onChange={(e) => setEdit(t.id, { hidden: e.target.checked })} /> Ẩn khỏi hồ sơ</label>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="small muted" style={{ margin: 0 }}>Chưa có công nghệ nào được quan sát.</p>}
        </fieldset>
        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu chỉnh sửa'}</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>Huỷ</button>
        </div>
      </div>
    </form>
  );
}

const WAITING_STEPS = ['Đọc hồ sơ công khai', 'Tải danh sách repo công khai', 'Thống kê ngôn ngữ', 'So khớp với khoá học của Codi'];

/** Waiting illustration while POST /api/github-profile runs; not real progress (real PendingChecklist). */
export function PendingChecklist({ hasPrevious }) {
  const [hi, setHi] = useState(0);
  // Rotate the highlight over the first three steps; the last one is never provided in this run.
  useEffect(() => {
    const timer = setInterval(() => setHi((v) => (v + 1) % (WAITING_STEPS.length - 1)), 2000);
    return () => clearInterval(timer);
  }, []);
  return (
    <section aria-label="Minh hoạ chờ phân tích" aria-busy="true" className="stack-3 shell-gh-wait">
      <h3 className="small strong" role="status" style={{ margin: 0 }}>Đang phân tích GitHub…</h3>
      <p className="xsmall muted" style={{ margin: 0 }}>Mô phỏng chờ: các bước chỉ minh hoạ trong khi chờ phản hồi cuối từ máy chủ, không phải tiến độ thực tế. Chưa xác nhận bước nào hoàn tất.</p>
      <ol className="shell-gh-steps">
        {WAITING_STEPS.map((step, i) => (
          <li key={step} className={i === hi ? 'is-active' : undefined}>
            <span className="shell-gh-step-dot" aria-hidden="true" />
            <span>{step}{i === WAITING_STEPS.length - 1 && <span className="xsmall"> · Chưa được cung cấp trong lượt phân tích này</span>}</span>
            <span className="sr-only"> · {i === hi ? 'Minh hoạ đang chờ' : 'Chưa xác nhận'}</span>
          </li>
        ))}
      </ol>
      <p className="xsmall muted" style={{ margin: 0 }}>Vui lòng giữ trang mở; tối đa 3 phút chờ. Không tự thử lại.{hasPrevious ? ' Kết quả trước vẫn hiển thị bên dưới.' : ''}</p>
    </section>
  );
}
