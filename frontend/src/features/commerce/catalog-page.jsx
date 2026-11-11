/**
 * S01 Catalog '/courses' (real app/courses/page.tsx) — live search with a three-part typeahead (query suggestions,
 * top results with "Khoá học" / "Chủ đề" badges, "Xem tất cả kết quả"), clear-search button, a category pill row,
 * a result bar (count + level, price, sort), removable chips + "Xóa bộ lọc", a course card grid, zero results and a
 * load error with retry.
 * Filters live in the URL (replaced, not pushed, like the real app's replaceState). `?course=<id>` deep-links to the
 * course detail; an unknown id is dropped from the URL. Data: GET /api/courses + POST /api/courses/ownership.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Empty, Icon, Thumb } from '../../components/ui/primitives';
import { catalogEntry, filterCatalog, normaliseSort, priceLabel, typeaheadSuggestions } from './commerce-lib';
import { levelLabel, useCatalog, useOwnership } from './commerce-api';
import { CourseCta } from './course-card';

const LEVELS = [['all', 'Tất cả'], ['Beginner', 'Cơ bản'], ['Intermediate', 'Trung cấp'], ['Advanced', 'Nâng cao']];
const PRICES = [['all', 'Tất cả'], ['free', 'Miễn phí'], ['paid', 'Trả phí']];
const SORTS = [['popular', 'Phù hợp nhất'], ['newest', 'Mới nhất'], ['rating', 'Đánh giá cao nhất'], ['enrollment', 'Học nhiều nhất']];
const label = (pairs, v) => (pairs.find(([k]) => k === v) || [v, v])[1];

function catalogHref(query, patch) {
  const cur = { ...query, ...patch };
  delete cur.error;
  Object.keys(cur).forEach((k) => {
    const v = cur[k];
    if (!v || v === 'all' || (k === 'sort' && v === 'popular') || (k === 'q' && !String(v).trim())) delete cur[k];
  });
  const qs = new URLSearchParams(cur).toString();
  return '/courses' + (qs ? '?' + qs : '');
}

function FilterSelect({ name, label: text, aria, value, options, onChange }) {
  return (
    <div className="field cm-filter">
      <label htmlFor={`f-${name}`}>{text}</label>
      <select id={`f-${name}`} name={name} aria-label={aria} value={value} onChange={(e) => onChange(name, e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function SearchBox({ value, entries, onSearch, onOpenCourse }) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const itemRefs = useRef([]);
  useEffect(() => { setDraft((d) => (d === value ? d : value)); }, [value]);

  const ta = useMemo(() => typeaheadSuggestions(entries, draft), [entries, draft]);
  const items = useMemo(() => {
    const list = ta.querySuggestions.map((text) => ({ kind: 'query', text }));
    ta.topResults.forEach((item) => list.push({ kind: 'top', item }));
    if (ta.matches.length || ta.topResults.length) list.push({ kind: 'all' });
    return list;
  }, [ta]);
  const shown = open && !!draft.trim();
  useEffect(() => { if (active >= 0 && itemRefs.current[active]) itemRefs.current[active].scrollIntoView({ block: 'nearest' }); }, [active]);

  const change = (v) => { setDraft(v); setOpen(!!v.trim()); setActive(-1); onSearch(v); };
  const close = () => { setOpen(false); setActive(-1); };
  const pick = (it) => {
    close();
    if (it.kind === 'query') change(it.text);
    else if (it.kind === 'top') { if (it.item.entry) onOpenCourse(it.item.entry.course); else change(it.item.title); }
    setOpen(false);
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' && shown && items.length) { e.preventDefault(); setActive((a) => (a < items.length - 1 ? a + 1 : 0)); }
    else if (e.key === 'ArrowUp' && shown && items.length) { e.preventDefault(); setActive((a) => (a > 0 ? a - 1 : items.length - 1)); }
    else if (e.key === 'Enter' && shown && active >= 0 && active < items.length) { e.preventDefault(); pick(items[active]); }
  };
  const optionProps = (idx) => ({
    id: `suggestion-${idx}`, role: 'option', type: 'button', 'aria-selected': idx === active,
    className: `cm-typeahead-item ${idx === active ? 'active' : ''}`, ref: (el) => { itemRefs.current[idx] = el; },
    onMouseDown: (e) => e.preventDefault(), onMouseEnter: () => setActive(idx), onClick: () => pick(items[idx]),
  });
  let idx = -1;

  return (
    <div className="field cm-search"><label htmlFor="f-q">Tìm kiếm</label>
      <div className="input-group cm-search-group">
        <div className="cm-search-input">
          <input id="f-q" name="q" className="input" value={draft} placeholder="Tìm khoá học theo tên, công nghệ (React, Node, AI...)" autoComplete="off"
            role="combobox" aria-autocomplete="list" aria-expanded={shown && items.length > 0} aria-controls="typeahead-suggestions"
            aria-activedescendant={shown && active >= 0 ? `suggestion-${active}` : undefined}
            onChange={(e) => change(e.target.value)} onKeyDown={onKeyDown} onBlur={close}
            onFocus={() => { if (draft.trim()) setOpen(true); }} />
          {draft && (
            <button type="button" className="cm-search-clear" aria-label="Xóa từ khoá tìm kiếm" onMouseDown={(e) => e.preventDefault()} onClick={() => { change(''); close(); }}>
              <Icon name="x" className="icon-sm" />
            </button>
          )}
        </div>
        <button className="btn btn-primary" type="button" onClick={close}><Icon name="search" /> Tìm</button>
        {shown && (
          <div className="cm-typeahead" role="listbox" id="typeahead-suggestions" aria-label="Gợi ý tìm kiếm">
            {!items.length ? (
              <p className="cm-typeahead-empty">Không tìm thấy gợi ý nào cho “{draft}”</p>
            ) : (<>
              {ta.querySuggestions.length > 0 && (
                <div className="cm-typeahead-group" role="group" aria-label="Gợi ý tìm kiếm">
                  <div className="cm-typeahead-header">Gợi ý tìm kiếm</div>
                  {ta.querySuggestions.map((text) => { idx += 1; return (
                    <button key={`q-${text}`} {...optionProps(idx)}><Icon name="search" className="icon-sm muted" /><span className="od-truncate">{text}</span></button>
                  ); })}
                </div>
              )}
              {ta.topResults.length > 0 && (
                <div className="cm-typeahead-group" role="group" aria-label="Kết quả hàng đầu">
                  <div className="cm-typeahead-header">Kết quả hàng đầu</div>
                  {ta.topResults.map((top) => { idx += 1; return (
                    <button key={top.id} {...optionProps(idx)}>
                      <span className={`badge ${top.type === 'Khoá học' ? 'badge-accent' : 'badge-neutral'}`}>{top.type}</span>
                      <span className="od-fill od-truncate strong">{top.title}</span>
                      <span className="xsmall muted od-nowrap">{top.entry ? levelLabel(top.entry.level) : top.category}</span>
                    </button>
                  ); })}
                </div>
              )}
              <div className="cm-typeahead-group">
                {(() => { idx += 1; return (
                  <button {...optionProps(idx)} className={`${optionProps(idx).className} cm-typeahead-all`}>
                    <span className="od-fill">Xem tất cả kết quả</span><span className="xsmall muted">{ta.matches.length} kết quả</span>
                  </button>
                ); })()}
              </div>
            </>)}
          </div>
        )}
      </div>
    </div>
  );
}

const fmt = Codi.fmt;

function CatalogSkeleton() {
  return (
    <ul className="cm-grid" aria-hidden="true">{[1, 2, 3, 4, 5, 6].map((i) => (
      <li key={i} className="cm-tile cm-tile-skel"><div className="skeleton cm-tile-skel-media" /><div className="cm-tile-body"><div className="skeleton skeleton-line" style={{ width: '80%' }} /><div className="skeleton skeleton-line" style={{ width: '50%' }} /><div className="skeleton skeleton-line" style={{ width: '35%' }} /></div></li>
    ))}</ul>
  );
}

/** One course in the catalogue grid: cover, title, lecturer, facts, then price and a quiet action. */
function CourseTile({ course: c, ownership }) {
  const state = ownership.of(c.id);
  const own = state === 'owned';
  const href = `/courses/${c.slug}`;
  return (
    <li className="cm-tile">
      <Link className="cm-tile-media" to={href} tabIndex={-1} aria-hidden="true">
        <Thumb course={c} />
        {c.category && <span className="cm-cover-label">{c.category}</span>}
      </Link>
      <div className="cm-tile-body">
        <h3 className="cm-tile-title"><Link to={href}>{c.title}</Link></h3>
        <p className="cm-tile-by">{c.lecturerName}</p>
        <p className="cm-tile-facts">
          {c.rating > 0
            ? <span className="cm-tile-rating"><Icon name="star-filled" className="icon-sm cm-star" /><strong>{c.rating.toFixed(1)}</strong><span className="muted">({fmt.num(c.ratingCount || 0)})</span></span>
            : <span>Chưa có đánh giá</span>}
          <span>{levelLabel(c.level)}</span>
          {c.duration && <span>{c.duration}</span>}
        </p>
        <div className="cm-tile-foot">
          {own ? <span className="badge badge-success"><Icon name="check" />Đã sở hữu</span> : <span className="cm-tile-price">{priceLabel(c)}</span>}
          <CourseCta course={c} own={state} pendingOrderId={ownership.pendingOrderId(c.id)} quiet />
        </div>
      </div>
    </li>
  );
}

export default function CatalogPage({ query: q }) {
  useCodi();
  const navigate = useNavigate();
  const { courses, loading, error, reload } = useCatalog();
  const ownership = useOwnership(courses);
  const loaded = !!courses || (!loading && !!error);

  // ?course=<id> deep link: open that course, or drop an unknown id from the URL.
  useEffect(() => {
    if (!q.course || !courses) return;
    const c = courses.find((x) => x.id === q.course);
    navigate(c ? `/courses/${c.slug}` : catalogHref(q, { course: '' }), { replace: true });
  }, [q.course, courses]); // eslint-disable-line react-hooks/exhaustive-deps

  const f = { q: q.q || '', cat: q.cat || 'all', level: q.level || 'all', price: q.price || 'all', sort: normaliseSort(q.sort) };
  const entries = useMemo(() => (courses || []).map(catalogEntry), [courses]);
  const categories = useMemo(() => [...new Set(entries.map((e) => e.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [entries]);
  const filtered = filterCatalog(entries, f.q, f);
  const list = filtered.map((e) => e.course);
  const update = (patch) => navigate(catalogHref(q, patch), { replace: true });
  const reset = () => navigate('/courses', { replace: true });
  const catName = f.cat !== 'all' ? f.cat : '';

  // The category row carries its own state; chips list only the filters set elsewhere.
  const chips = [];
  if (f.q.trim()) chips.push(['q', `Từ khoá: "${f.q.trim()}"`]);
  if (f.level !== 'all') chips.push(['level', `Trình độ: ${label(LEVELS, f.level)}`]);
  if (f.price !== 'all') chips.push(['price', `Giá: ${f.price === 'free' ? 'Miễn phí' : 'Trả phí'}`]);
  const filtering = chips.length > 0 || f.cat !== 'all';

  return (
    <div className="page cm-catalog">
      <div className="page-header"><div><h1>Khoá học</h1><p className="muted">Tìm khoá học phù hợp với mục tiêu của bạn.</p></div></div>
      <form className="cm-find" role="search" onSubmit={(e) => e.preventDefault()}>
        <SearchBox value={f.q} entries={filtered} onSearch={(v) => update({ q: v })} onOpenCourse={(c) => Codi.go('/courses/' + c.slug)} />
      </form>
      {categories.length > 0 && (
        <div className="cm-cats" role="group" aria-label="Danh mục">
          {[['all', 'Tất cả']].concat(categories.map((c) => [c, c])).map(([v, l]) => (
            <button key={v} type="button" className="cm-cat" aria-pressed={f.cat === v} onClick={() => update({ cat: v })}>{l}</button>
          ))}
        </div>
      )}
      <div className="cm-bar">
        <p className="cm-count" role="status">{loaded ? <><strong>{list.length}</strong> khoá học{catName ? <> trong <strong>{catName}</strong></> : null}</> : 'Đang tải danh sách khoá học…'}</p>
        <div className="cm-bar-controls">
          <FilterSelect name="level" label="Trình độ" aria="Lọc theo trình độ" value={f.level} options={LEVELS} onChange={(k, v) => update({ [k]: v })} />
          <FilterSelect name="price" label="Giá" aria="Lọc theo học phí" value={f.price} options={PRICES} onChange={(k, v) => update({ [k]: v })} />
          <FilterSelect name="sort" label="Sắp xếp" aria="Sắp xếp danh sách khoá học" value={f.sort} options={SORTS} onChange={(k, v) => update({ [k]: v })} />
        </div>
      </div>
      {filtering && (
        <div className="od-cluster cm-chips">
          {chips.map(([k, l]) => (
            <span key={k} className="chip">{l}<button type="button" onClick={() => update({ [k]: '' })} aria-label={`Bỏ bộ lọc ${l}`}><Icon name="x" className="icon-sm" /></button></span>
          ))}
          <button type="button" className="btn btn-link small" onClick={reset}>Xóa bộ lọc</button>
        </div>
      )}
      {!loaded ? <CatalogSkeleton /> : !courses ? (
        <div className="card">
          <Empty icon="alert-circle" title="Không tải được danh sách khoá học"
            body={<span role="alert">Không thể tải khoá học. Vui lòng thử lại. Kết nối bị gián đoạn. Bộ lọc của bạn vẫn được giữ.</span>}
            actions={<button type="button" className="btn btn-secondary" onClick={() => reload()}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} />
        </div>
      ) : list.length ? (
        <section aria-labelledby="catalog-results-title">
          <h2 id="catalog-results-title" className="sr-only">Danh sách khoá học, sắp xếp theo {label(SORTS, f.sort)}</h2>
          <ul className="cm-grid">{list.map((c) => <CourseTile key={c.id} course={c} ownership={ownership} />)}</ul>
        </section>
      ) : (
        <div className="card">
          <Empty icon="search" title="Không tìm thấy khoá học phù hợp" body="Thử bỏ bớt bộ lọc, hoặc mô tả mục tiêu để AI Codi gợi ý khoá học."
            actions={<>
              <button type="button" className="btn btn-secondary" onClick={reset}>Đặt lại bộ lọc</button>
              <Link className="btn btn-primary" to={`/ai?prompt=${encodeURIComponent('Gợi ý khoá học ' + (f.q.trim() || catName || 'Tất cả'))}`}><Icon name="sparkles" /> Hỏi AI Codi gợi ý khoá học</Link>
            </>} />
        </div>
      )}
    </div>
  );
}
