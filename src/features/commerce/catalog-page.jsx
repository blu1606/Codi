/**
 * S01 Catalog '/courses' (real app/courses/page.tsx) — live search with a three-part typeahead (query suggestions,
 * top results with "Khóa học" / "Chủ đề" badges, "Xem tất cả kết quả"), clear-search button, filter row
 * (category, level, price, sort), removable chips + "Xóa bộ lọc", result count, zero results, load error with retry.
 * Filters live in the URL (replaced, not pushed, like the real app's replaceState). `?course=<id>` deep-links to the
 * course detail; an unknown id is dropped from the URL.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Codi, useCodi } from '../../lib/codi';
import { Empty, Icon, Thumb } from '../../components/ui/primitives';
import { catalogEntry, filterCatalog, lecturerName, normaliseSort, priceLabel, published, typeaheadSuggestions } from './commerce-lib';
import { CourseCta } from './course-card';

let catalogLoaded = false; // first visit shows the loading skeleton once per session

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
          <input id="f-q" name="q" className="input" value={draft} placeholder="Tìm khóa học theo tên, công nghệ (React, Node, AI...)" autoComplete="off"
            role="combobox" aria-autocomplete="list" aria-expanded={shown && items.length > 0} aria-controls="typeahead-suggestions"
            aria-activedescendant={shown && active >= 0 ? `suggestion-${active}` : undefined}
            onChange={(e) => change(e.target.value)} onKeyDown={onKeyDown} onBlur={close}
            onFocus={() => { if (draft.trim()) setOpen(true); }} />
          {draft && (
            <button type="button" className="cm-search-clear" aria-label="Xóa từ khóa tìm kiếm" onMouseDown={(e) => e.preventDefault()} onClick={() => { change(''); close(); }}>
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
                      <span className={`badge ${top.type === 'Khóa học' ? 'badge-accent' : 'badge-neutral'}`}>{top.type}</span>
                      <span className="od-fill od-truncate strong">{top.title}</span>
                      <span className="xsmall muted od-nowrap">{top.entry ? Codi.levelLabel(top.entry.level) : top.category}</span>
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
const LEVEL_RANK = { Beginner: 1, Intermediate: 2, Advanced: 3 };

function CatalogSkeleton() {
  return (
    <div className="cm-ledger-skel card" aria-hidden="true">{[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="cm-ledger-skel-row"><div className="skeleton" style={{ width: 56, height: 40 }} /><div className="skeleton skeleton-line" style={{ width: '60%' }} /><div className="skeleton skeleton-line" style={{ width: '40%' }} /></div>
    ))}</div>
  );
}

/** Sortable header cell: the sort value is the URL's existing sort option; the caret is drawn in CSS. */
function SortHeader({ label, value, sort, onSort }) {
  const active = sort === value;
  return (
    <th scope="col" aria-sort={active ? 'descending' : 'none'} className="num">
      <button type="button" className={`cm-sort${active ? ' is-active' : ''}`} onClick={() => onSort(value)}>{label}<span className="cm-sort-caret" aria-hidden="true" /></button>
    </th>
  );
}

function LedgerRow({ course: c }) {
  const own = Codi.isEnrolled(c.id);
  const inCart = !own && Codi.cart().includes(c.id);
  const rank = LEVEL_RANK[c.level] || 1;
  return (
    <tr>
      <td data-label="Khóa học">
        <div className="cm-ledger-course">
          <Link className="cm-ledger-thumb" to={`/courses/${c.slug}`} tabIndex={-1} aria-hidden="true"><Thumb course={c} small /></Link>
          <div className="cm-ledger-text">
            <Link className="cm-ledger-title" to={`/courses/${c.slug}`}>{c.title}</Link>
            <span className="small muted od-truncate">{lecturerName(c)}</span>
            {own && <span className="badge badge-success"><Icon name="check" />Đã sở hữu</span>}
            {inCart && <span className="badge badge-accent">Trong giỏ</span>}
          </div>
        </div>
      </td>
      <td data-label="Trình độ">
        <span className="cm-level"><span className="cm-level-bar" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= rank ? 'on' : undefined} />)}</span>{Codi.levelLabel(c.level)}</span>
      </td>
      <td data-label="Đánh giá" className="num">{c.rating > 0 ? <><Icon name="star-filled" className="icon-sm cm-star" /> <span className="strong">{c.rating.toFixed(1)}</span> <span className="muted">({fmt.num(c.ratingCount || 0)})</span></> : <span className="muted">Chưa có</span>}</td>
      <td data-label="Thời lượng" className="num">{fmt.duration(c.durationMin)}</td>
      <td data-label="Học viên" className="num">{fmt.num(c.learnersCount || 0)}</td>
      <td data-label="Học phí" className="num"><span className="strong">{priceLabel(c)}</span></td>
      <td className="cm-ledger-act"><CourseCta course={c} /></td>
    </tr>
  );
}

/** The results as a comparison ledger: one course per row, sortable where the catalogue has a sort value. */
function CourseLedger({ list, sort, onSort }) {
  return (
    <section aria-labelledby="catalog-results-title" className="cm-ledger-wrap">
      <h2 id="catalog-results-title" className="sr-only">Danh sách khoá học</h2>
      <table className="cm-ledger">
        <caption className="sr-only">Khoá học, sắp xếp theo {label(SORTS, sort)}</caption>
        <thead>
          <tr>
            <th scope="col">Khóa học</th>
            <th scope="col">Trình độ</th>
            <SortHeader label="Đánh giá" value="rating" sort={sort} onSort={onSort} />
            <th scope="col" className="num">Thời lượng</th>
            <SortHeader label="Học viên" value="enrollment" sort={sort} onSort={onSort} />
            <th scope="col" className="num">Học phí</th>
            <th scope="col"><span className="sr-only">Thao tác</span></th>
          </tr>
        </thead>
        <tbody>{list.map((c) => <LedgerRow key={c.id} course={c} />)}</tbody>
      </table>
    </section>
  );
}

export default function CatalogPage({ query: q }) {
  useCodi();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(catalogLoaded);
  useEffect(() => {
    if (loaded) return undefined;
    const t = setTimeout(() => { catalogLoaded = true; setLoaded(true); }, 600);
    return () => clearTimeout(t);
  }, [loaded]);

  // ?course=<id> deep link: open that course, or drop an unknown id from the URL.
  useEffect(() => {
    if (!q.course) return;
    const c = published().find((x) => x.id === q.course);
    navigate(c ? `/courses/${c.slug}` : catalogHref(q, { course: '' }), { replace: true });
  }, [q.course]); // eslint-disable-line react-hooks/exhaustive-deps

  const db = Codi.db();
  const f = { q: q.q || '', cat: q.cat || 'all', level: q.level || 'all', price: q.price || 'all', sort: normaliseSort(q.sort) };
  const entries = published().map(catalogEntry);
  const filtered = filterCatalog(entries, f.q, f);
  const list = filtered.map((e) => e.course);
  const update = (patch) => navigate(catalogHref(q, patch), { replace: true });
  const reset = () => navigate('/courses', { replace: true });
  const catName = f.cat !== 'all' ? Codi.category(f.cat).name : '';

  const chips = [];
  if (f.q.trim()) chips.push(['q', `Từ khóa: "${f.q.trim()}"`]);
  if (f.cat !== 'all') chips.push(['cat', `Danh mục: ${catName}`]);
  if (f.level !== 'all') chips.push(['level', `Trình độ: ${label(LEVELS, f.level)}`]);
  if (f.price !== 'all') chips.push(['price', `Giá: ${f.price === 'free' ? 'Miễn phí' : 'Trả phí'}`]);
  if (f.sort !== 'popular') chips.push(['sort', `Sắp xếp: ${label(SORTS, f.sort)}`]);
  const error = q.error === '1';

  return (
    <div className="page">
      <div className="page-header"><div><h1>Khoá học</h1><p className="muted">Tìm khoá học phù hợp với mục tiêu của bạn.</p></div></div>
      <form className="cm-filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <SearchBox value={f.q} entries={filtered} onSearch={(v) => update({ q: v })} onOpenCourse={(c) => Codi.go('/courses/' + c.slug)} />
        <FilterSelect name="cat" label="Danh mục" aria="Lọc theo danh mục" value={f.cat} options={[['all', 'Tất cả']].concat(db.categories.map((c) => [c.id, c.name]))} onChange={(k, v) => update({ [k]: v })} />
        <FilterSelect name="level" label="Trình độ" aria="Lọc theo trình độ" value={f.level} options={LEVELS} onChange={(k, v) => update({ [k]: v })} />
        <FilterSelect name="price" label="Giá" aria="Lọc theo học phí" value={f.price} options={PRICES} onChange={(k, v) => update({ [k]: v })} />
        <FilterSelect name="sort" label="Sắp xếp" aria="Sắp xếp danh sách khóa học" value={f.sort} options={SORTS} onChange={(k, v) => update({ [k]: v })} />
      </form>
      {chips.length > 0 && (
        <div className="od-cluster cm-chips">
          {chips.map(([k, l]) => (
            <span key={k} className="chip">{l}<button type="button" onClick={() => update({ [k]: '' })} aria-label={`Bỏ bộ lọc ${l}`}><Icon name="x" className="icon-sm" /></button></span>
          ))}
          <button type="button" className="btn btn-link small" onClick={reset}>Xóa bộ lọc</button>
        </div>
      )}
      <p className="small muted cm-count" role="status">{loaded ? `${list.length} khoá học` : 'Đang tải danh sách khoá học…'}</p>
      {!loaded ? <CatalogSkeleton /> : error ? (
        <div className="card">
          <Empty icon="alert-circle" title="Không tải được danh sách khóa học"
            body={<span role="alert">Không thể tải khóa học. Vui lòng thử lại. Kết nối bị gián đoạn. Bộ lọc của bạn vẫn được giữ.</span>}
            actions={<button type="button" className="btn btn-secondary" onClick={() => update({})}><Icon name="refresh" className="icon-sm" /> Thử lại</button>} />
        </div>
      ) : list.length ? (
        <CourseLedger list={list} sort={f.sort} onSort={(v) => update({ sort: v })} />
      ) : (
        <div className="card">
          <Empty icon="search" title="Không tìm thấy khóa học phù hợp" body="Thử bỏ bớt bộ lọc, hoặc mô tả mục tiêu để AI Codi gợi ý khóa học."
            actions={<>
              <button type="button" className="btn btn-secondary" onClick={reset}>Đặt lại bộ lọc</button>
              <Link className="btn btn-primary" to={`/ai?prompt=${encodeURIComponent('Gợi ý khóa học ' + (f.q.trim() || catName || 'Tất cả'))}`}><Icon name="sparkles" /> Hỏi AI Codi gợi ý khóa học</Link>
            </>} />
        </div>
      )}
    </div>
  );
}
