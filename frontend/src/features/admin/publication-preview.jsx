/**
 * "Nội dung" view of the admin publication review: the course rendered as the learner sees it (course page, the
 * lesson with the learner's MaterialView + LessonMarkdown, quiz, code task, assignment) or as the lecturer authored
 * it (correct answers, hidden tests, solution check). Every block is an anchor: "Gắn cờ" there saves a flag with
 * { targetType, lessonId, itemId } (addReviewFlag) and the flags already placed there are shown in place. From
 * round 2 on, blocks the lecturer changed since the last decided round carry a "Đã sửa" badge (changes payload).
 */
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon, Alert, Thumb } from '../../components/ui/primitives';
import { MaterialView } from '../learning/lesson-materials';
import LessonMarkdown from '../learning/lesson-markdown';
import { LEVEL_LABEL } from './admin-data';
import { FlagCard, openFlag } from './review-flags';
import {
  ENTRY_MIN, ENTRY_LABEL, INFO_FIELDS, CHANGE_LABEL, materialOk, lessonsOf, placeAnchor, isAt,
} from './publication-rules';

const { fmt } = Codi;
const TYPE = { video: 'Video', pdf: 'Slide/PDF', slide: 'Slide/PDF', reading: 'Bài đọc', document: 'Tài liệu', link: 'Liên kết', tutorial: 'Hướng dẫn code', code: 'Bài code' };
const minutes = (l) => Math.round((l.durationSeconds || 0) / 60);
const noSave = async () => {}; // the preview never records learner progress
const clip = (s, n = 40) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

/** A flaggable block: its content, the "Gắn cờ" control, a change badge and the flags placed here. */
function Anchor({ env, target, changed, children, className = '' }) {
  const flags = env.here(target.type, target.lessonId, target.itemId);
  const open = flags.filter((f) => f.status !== 'closed');
  const pending = open.filter((f) => f.status === 'open');
  // still open: red (must) / amber (should); fixed by the lecturer and waiting for the reviewer: accent
  const tone = pending.some((f) => f.severity === 'must') ? 'is-must' : pending.length ? 'is-should' : open.length ? 'is-fixed' : '';
  return (
    <div className={`rv-anchor ${tone} ${changed ? 'is-changed' : ''} ${className}`.trim()}>
      <div className="rv-anchor-tools">
        {changed && <span className="badge badge-info"><Icon name="refresh" />{typeof changed === 'string' ? changed : 'Đã sửa'}</span>}
        {flags.length > 0 && <span className={`badge ${open.length ? 'badge-warn' : 'badge-success'}`}><Icon name="flag" />{flags.length}</span>}
        {!env.ro && <button type="button" className="btn btn-ghost btn-sm rv-pin" onClick={() => openFlag(env.ctx, target)} aria-label={`Gắn cờ: ${target.label}`}><Icon name="flag" className="icon-sm" /> Gắn cờ</button>}
      </div>
      <div className="rv-anchor-body">{children}</div>
      {flags.length > 0 && <ul className="rv-flags rv-notes">{flags.map((f) => <FlagCard key={f.id} f={f} ctx={env.ctx} ro={env.ro} target={f.target && f.target.label !== target.label ? <span className="xsmall muted">Góp ý gốc: {f.target.label}</span> : null} />)}</ul>}
    </div>
  );
}

// ───────────────────────── course page ─────────────────────────
function CoursePage({ env, d, onNode }) {
  const c = d.course; const ch = env.changes;
  const changedField = (k) => !!ch && ch.course.includes(k);
  const at = (k, children) => <Anchor env={env} target={{ type: 'course', itemId: k, label: INFO_FIELDS[k] }} changed={changedField(k)}>{children}</Anchor>;
  return (
    <div className="stack-4 rv-course-page">
      <Anchor env={env} target={{ type: 'course', label: 'Khoá học (chung)' }}><Thumb course={{ id: c.id, title: c.title }} /></Anchor>
      {at('title', <h2 className="rv-course-title">{c.title}</h2>)}
      {at('category', <p className="small muted">{d.instructor ? d.instructor.name : ''} · {c.category} · {LEVEL_LABEL[c.level] || c.level}</p>)}
      {at('price', <p className="strong">{c.proposedPrice != null ? (c.proposedPrice ? fmt.vnd(c.proposedPrice) : 'Miễn phí') + ' (giá đề xuất)' : 'Chưa có giá đề xuất'}</p>)}
      {at('summary', <p>{c.summary || <span className="muted">Chưa có mô tả.</span>}</p>)}
      {at('outcomes', <div className="stack-2"><h3 className="tc-h">Bạn sẽ học được gì</h3>{d.details.learningOutcomes.length ? <ul className="small">{d.details.learningOutcomes.map((o, i) => <li key={i}>{o}</li>)}</ul> : <p className="small muted">Chưa có.</p>}</div>)}
      {at('requirements', <div className="stack-2"><h3 className="tc-h">Yêu cầu trước khi học</h3><ul className="small">{(d.details.requirements.length ? d.details.requirements : ['Không có yêu cầu đặc biệt.']).map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}
      <div className="stack-2"><h3 className="tc-h">Nội dung khoá học</h3>
        {c.chapters.map((chp, i) => (
          <Anchor key={chp.id} env={env} target={{ type: 'chapter', itemId: chp.id, label: `Chương ${i + 1}: ${chp.title}` }}
            changed={ch && (ch.chapters.added.includes(chp.id) ? 'Chương mới' : ch.chapters.renamed.includes(chp.id) ? 'Đổi tên' : false)}>
            <div className="stack-1"><strong className="small">Chương {i + 1}: {chp.title}</strong>
              <ul className="small rv-outline">{chp.lessons.map((l) => <li key={l.id}><button type="button" className="btn-link" onClick={() => onNode(l.id)}>{l.title}</button> <span className="muted">· {TYPE[l.type] || l.type} · {fmt.duration(minutes(l))}</span></li>)}</ul></div>
          </Anchor>
        ))}</div>
    </div>
  );
}

// ───────────────────────── questions ─────────────────────────
function Question({ env, q, i, lesson, author }) {
  const where = lesson ? `Bài: ${lesson.title}` : ENTRY_LABEL;
  return (
    <Anchor env={env} target={{ type: 'question', lessonId: lesson ? lesson.id : null, itemId: q.id, label: `Câu ${i + 1}: ${clip(q.text)} · ${where}` }}>
      {author ? (
        <div className="stack-2"><strong className="small">Câu {i + 1}. {q.text}</strong>
          <ul className="rv-opts">{q.options.map((o, k) => (
            <li key={k} className={k === q.correctIndex ? 'is-correct' : ''}>
              {k === q.correctIndex ? <><Icon name="check-circle" className="icon-sm" /><span className="sr-only">Đáp án đúng: </span></> : <span className="rv-opt-dot" aria-hidden="true" />}
              <span>{o}</span>{k === q.correctIndex && <span className="xsmall">Đáp án đúng</span>}</li>
          ))}</ul>
          {q.explanation ? <p className="xsmall muted">Giải thích: {q.explanation}</p> : <p className="xsmall text-warn">Chưa có giải thích.</p>}</div>
      ) : (
        <fieldset className="stack-3 ln-fieldset">
          <legend className="ln-question"><span className="small muted">Câu {i + 1}. </span>{q.text}</legend>
          <div className="choice-list">{q.options.map((o, k) => (
            <label key={k} className="choice"><input type="radio" name={`rv-q-${q.id}`} /><span className="choice-body"><span className="choice-title">{o}</span></span></label>
          ))}</div>
        </fieldset>
      )}
    </Anchor>
  );
}

function EntryTest({ env, c, author }) {
  const qs = (c.entryTest && c.entryTest.questions) || [];
  return (
    <Anchor env={env} target={{ type: 'entry', label: ENTRY_LABEL }} changed={!!env.changes && env.changes.entry}>
      <div className="stack-3"><div className="stack-1"><h2 className="ln-h">{ENTRY_LABEL}</h2>
        <span className={`small ${qs.length < ENTRY_MIN ? 'text-danger' : 'muted'}`}>{qs.length} câu{author ? ` · cần ít nhất ${ENTRY_MIN} câu` : ' · giúp Codi xếp lộ trình cho bạn'}</span></div>
        {qs.length ? qs.map((q, i) => <Question key={q.id} env={env} q={q} i={i} author={author} />) : <p className="small muted">Chưa có câu hỏi.</p>}</div>
    </Anchor>
  );
}

// ───────────────────────── one lesson ─────────────────────────
function LessonView({ env, c, l, author }) {
  const chapter = c.chapters.find((ch) => ch.lessons.some((x) => x.id === l.id));
  const ch = env.changes;
  const keys = (ch && ch.lessons.changed[l.id]) || [];
  const isNew = !!ch && ch.lessons.added.includes(l.id);
  const mark = (k) => keys.includes(k);
  const lessonMin = minutes(l);
  const mats = l.materials || [];
  const T = (type, label, itemId) => ({ type, lessonId: l.id, itemId, label: `${label} · Bài: ${l.title}` });
  const tests = (l.code && l.code.tests) || [];
  const shownTests = author ? tests : tests.filter((t) => !t.hidden);
  const a = l.assignment;
  return (
    <div className="stack-4 rv-lesson">
      <Anchor env={env} target={{ type: 'lesson', lessonId: l.id, label: `Bài: ${l.title}` }} changed={isNew ? 'Bài mới' : (mark('title') || mark('description')) && `Đã sửa ${[mark('title') && CHANGE_LABEL.title, mark('description') && CHANGE_LABEL.description].filter(Boolean).join(', ')}`}>
        <div className="stack-1"><span className="xsmall muted">{chapter ? chapter.title : ''}</span><h2 className="ln-h rv-lesson-title">{l.title}</h2>
          <span className="small muted">{TYPE[l.type] || l.type} · {fmt.duration(lessonMin)}</span>
          {l.description && <p className="ln-lead">{l.description}</p>}</div>
      </Anchor>

      <section className="ln-material stack-3" aria-label="Nội dung bài học">
        {mats.map((m) => (
          <Anchor key={m.id} env={env} target={T('material', `Tài liệu: ${m.title || TYPE[m.type] || m.type}`, m.id)} changed={mark('material')}>
            <div className="ln-meta-row"><span className="ln-meta-main">{m.title}</span><span className="ln-meta-kind">{TYPE[m.type] || m.type}</span></div>
            <MaterialView m={m} lessonMin={lessonMin} save={noSave} />
          </Anchor>
        ))}
        {author && !materialOk(l) && <Alert type="danger" title="Chưa có tệp" body={`Bài ${(TYPE[l.type] || '').toLowerCase()} này chưa có tệp — học viên sẽ thấy bài trống.`} />}
        {l.body ? (
          <Anchor env={env} target={T('reading', 'Bài đọc')} changed={mark('reading')}>
            <article className="ln-reading"><h2 className="ln-reading-h">{mats.length ? 'Tóm tắt bài học (bài đọc)' : 'Nội dung bài học'}</h2><LessonMarkdown text={l.body} /></article>
          </Anchor>
        ) : !mats.length && <Alert type="info" title="Chưa có nội dung bài học" body="Bài học chưa có tài liệu hoặc bài đọc." />}
      </section>

      {l.quiz && (
        <Anchor env={env} target={T('quiz', 'Quiz')} changed={mark('quiz')} className="rv-block">
          <div className="stack-3"><div className="stack-1"><h2 className="ln-h">Quiz cuối bài</h2><span className="small muted">{l.quiz.questions.length} câu · điểm đạt {l.quiz.passingScore ?? 70}%</span></div>
            {l.quiz.questions.map((q, i) => <Question key={q.id} env={env} q={q} i={i} lesson={l} author={author} />)}</div>
        </Anchor>
      )}

      {l.code && (
        <Anchor env={env} target={T('code', 'Bài code')} changed={mark('code')} className="rv-block">
          <div className="stack-3"><div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}><h2 className="ln-h">Bài code</h2>
            {author && (l.code.solutionCheck && l.code.solutionCheck.ok ? <span className="badge badge-success"><Icon name="check" />Lời giải đạt {l.code.solutionCheck.passed}/{l.code.solutionCheck.total}</span> : <span className="badge badge-danger"><Icon name="alert-circle" />Lời giải chưa chạy đạt</span>)}</div>
            {(l.code.instructions || []).length > 0 && <LessonMarkdown text={l.code.instructions.join('\n\n')} />}
            {l.code.starterCode && <pre className="ln-code"><code>{l.code.starterCode}</code></pre>}
            <strong className="small">{author ? `${tests.length} test (${tests.filter((t) => t.hidden).length} ẩn)` : `Test mẫu (${shownTests.length})${tests.length > shownTests.length ? ` · ${tests.length - shownTests.length} test ẩn` : ''}`}</strong>
            {shownTests.map((t) => (
              <Anchor key={t.id} env={env} target={T('test', `Test “${t.name}”`, t.id)}>
                <div className="stack-1"><span className="small strong">{t.name}{t.hidden && <> <span className="badge">Ẩn</span></>}</span><code className="mono xsmall">{t.call}</code></div>
              </Anchor>
            ))}</div>
        </Anchor>
      )}

      {a && (
        <Anchor env={env} target={T('assignment', 'Bài tập')} changed={mark('assignment')} className="rv-block">
          <div className="stack-3"><h2 className="ln-h">Bài tập</h2>
            {a.instructions ? <LessonMarkdown text={a.instructions} /> : <p className="small muted">Chưa có yêu cầu.</p>}
            {(a.rubric || []).length
              ? <div className="table-wrap"><table className="table"><caption className="sr-only">Thang chấm</caption><thead><tr><th>Tiêu chí</th><th className="num">Điểm</th></tr></thead><tbody>{a.rubric.map((k, i) => <tr key={i}><th scope="row"><span className="small strong">{k.name}</span>{k.desc ? <><br /><span className="xsmall muted">{k.desc}</span></> : null}</th><td className="num">{k.points}</td></tr>)}</tbody></table></div>
              : author && <Alert type="warn" title="Chưa có thang chấm" body="Học viên không biết bài được chấm theo tiêu chí nào." />}</div>
        </Anchor>
      )}
    </div>
  );
}

// ───────────────────────── changes since the last round ─────────────────────────
function ChangesCard({ d, r, onNode }) {
  if (r.round < 2) return null;
  const ch = d.changes;
  const carried = r.flags.filter((f) => f.carried);
  const fixed = carried.filter((f) => f.status === 'fixed');
  const stillOpen = carried.filter((f) => f.status === 'open');
  const ls = lessonsOf(d.course);
  const changedLessons = ch ? ls.filter((l) => ch.lessons.changed[l.id] || ch.lessons.added.includes(l.id)) : [];
  return (
    <section className="rv-changes stack-2" aria-label="Thay đổi so với vòng trước">
      <strong className="small"><Icon name="refresh" className="icon-sm" /> Vòng {r.round}: giảng viên đã sửa {fixed.length}/{carried.length} góp ý{stillOpen.length ? ` · ${stillOpen.length} góp ý chưa xử lý` : ''}</strong>
      {!ch ? <p className="xsmall muted">Vòng trước chưa lưu bản nội dung để so sánh, chỉ hiện trạng thái góp ý.</p> : (
        <ul className="small rv-change-list">
          {ch.course.length > 0 && <li><button type="button" className="btn-link" onClick={() => onNode('info')}>Thông tin khoá học</button>: {ch.course.map((k) => INFO_FIELDS[k] || k).join(', ')}</li>}
          {ch.entry && <li><button type="button" className="btn-link" onClick={() => onNode('entry')}>{ENTRY_LABEL}</button>: đã sửa câu hỏi</li>}
          {changedLessons.map((l) => <li key={l.id}><button type="button" className="btn-link" onClick={() => onNode(l.id)}>{l.title}</button>: {ch.lessons.added.includes(l.id) ? 'bài mới' : ch.lessons.changed[l.id].map((k) => CHANGE_LABEL[k] || k).join(', ')}</li>)}
          {ch.lessons.removed.map((t) => <li key={'rm-' + t}>Đã xoá bài: {t}</li>)}
          {ch.chapters.removed.map((t) => <li key={'rc-' + t}>Đã xoá chương: {t}</li>)}
          {!ch.course.length && !ch.entry && !changedLessons.length && !ch.lessons.removed.length && !ch.chapters.removed.length && <li className="muted">Nội dung không đổi so với vòng {ch.comparedRound}.</li>}
        </ul>
      )}
    </section>
  );
}

// ───────────────────────── the view ─────────────────────────
/**
 * node: 'info' | 'entry' | lessonId; mode: 'learner' | 'author'. onNode / onMode update the page's view state.
 */
export function PreviewView({ d, r, ro, ctx, node, mode, onNode, onMode, tab }) {
  const c = d.course;
  const ls = lessonsOf(c);
  const entryQs = (c.entryTest && c.entryTest.questions) || [];
  const known = new Set([
    ...c.chapters.map((ch) => String(ch.id)), ...entryQs.map((q) => String(q.id)),
    ...ls.flatMap((l) => [...(l.materials || []).map((m) => String(m.id)), ...((l.quiz && l.quiz.questions) || []).map((q) => String(q.id)), ...((l.code && l.code.tests) || []).map((t) => String(t.id))]),
  ]);
  const questionIds = (lessonId) => (lessonId ? (((ls.find((l) => l.id === lessonId) || {}).quiz || {}).questions || []) : entryQs).map((q) => q.id);
  const placed = r.flags.map((f) => ({ f, a: placeAnchor(f, known, questionIds) }));
  const env = { ro, ctx, changes: d.changes, here: (type, lessonId, itemId) => placed.filter((p) => isAt(p.a, type, lessonId, itemId)).map((p) => p.f) };
  const openCount = (pred) => placed.filter((p) => p.f.status !== 'closed' && pred(p.a)).length;
  const ch = d.changes;
  const sel = node === 'entry' ? 'entry' : ls.find((l) => l.id === node) || 'info';
  const author = mode === 'author';

  // Page picker: one option per page of the course, with open flags and "changed" marks in the text.
  const tag = (n, changed) => `${changed ? ' · đã sửa' : ''}${n ? ` · ${n} cờ` : ''}`;
  const pages = [
    { id: 'info', label: 'Trang giới thiệu khoá học' + tag(openCount((a) => a.type === 'course' || a.type === 'chapter'), !!ch && (ch.course.length > 0 || ch.chapters.added.length + ch.chapters.renamed.length > 0)) },
    { id: 'entry', label: `${ENTRY_LABEL} (${entryQs.length} câu)` + tag(openCount((a) => a.type === 'entry' || !!a.entry), !!ch && ch.entry) },
  ];
  const order = ['info', 'entry', ...ls.map((l) => l.id)];
  const cur = sel === 'info' || sel === 'entry' ? sel : sel.id;
  const at = order.indexOf(cur);
  const step = (n) => onNode(order[Math.max(0, Math.min(order.length - 1, at + n))]);
  return (
    <div className="stack-3">
      <div className={`rv-viewbar ${author ? '' : 'is-learner'}`}>
        <span className="small"><Icon name="eye" className="icon-sm" /> {author ? <><strong>Góc nhìn giảng viên</strong> — hiện đáp án đúng, test ẩn và lời giải.</> : <><strong>Bạn đang xem như học viên</strong> · {c.title}</>}</span>
        <div className="viz-seg-ctrl" role="group" aria-label="Góc nhìn">
          <button type="button" aria-pressed={String(!author)} onClick={() => onMode('learner')}>Học viên</button>
          <button type="button" aria-pressed={String(author)} onClick={() => onMode('author')}>Giảng viên</button>
        </div>
      </div>
      <ChangesCard d={d} r={r} onNode={onNode} />
      <div className="rv-pager">
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => step(-1)} disabled={at <= 0} aria-label="Trang trước"><Icon name="chevron-left" className="icon-sm" /></button>
        <label className="sr-only" htmlFor="rv-page">Trang đang xem</label>
        <select id="rv-page" className="input" value={cur} onChange={(e) => onNode(e.target.value)}>
          {pages.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          {c.chapters.map((chp, ci) => (
            <optgroup key={chp.id} label={`Chương ${ci + 1}: ${chp.title}`}>
              {chp.lessons.map((l) => <option key={l.id} value={l.id}>{`${l.title} — ${TYPE[l.type] || l.type}${!materialOk(l) ? ' · thiếu tệp' : ''}${tag(openCount((a) => a.lessonId === l.id), !!ch && (!!ch.lessons.changed[l.id] || ch.lessons.added.includes(l.id)))}`}</option>)}
            </optgroup>
          ))}
        </select>
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => step(1)} disabled={at >= order.length - 1} aria-label="Trang sau"><Icon name="chevron-right" className="icon-sm" /></button>
      </div>
      <div>
        <div className="rv-preview">
          {sel === 'info' ? <CoursePage env={env} d={d} onNode={onNode} /> : sel === 'entry' ? <EntryTest env={env} c={c} author={author} /> : <LessonView key={sel.id} env={env} c={c} l={sel} author={author} />}
          {ro && <p className="xsmall muted" style={{ marginTop: 16 }}>Vòng này đã kết luận — chỉ xem. <Link to={`/admin/publication?tab=${tab}&id=${c.id}&view=history`}>Xem lịch sử</Link></p>}
        </div>
      </div>
    </div>
  );
}
