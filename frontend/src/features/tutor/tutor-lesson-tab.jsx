/**
 * The Tutor inside a lesson: the lesson player's "Tutor" tab (Codi develop shows the same panel docked over the
 * lesson; the rebuild keeps the Tutor as a tab beside the work, DESIGN.md "Lesson Split Pane"). While mounted it
 * describes the lesson to the store (context chip, one thread per lesson), lends the code workspace as the code bridge
 * (task, code, failing test, run error; apply a suggestion, select a line, run the tests) and receives contextual
 * requests (selection toolbar, "Vì sao test … chưa đạt?", console error), showing the tab when one arrives.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Codi } from '../../lib/codi';
import { Icon } from '../../components/ui/primitives';
import { setEditorValue } from '../coding/code-api';
import TutorThread from './tutor-thread';
import { ChatLoadError, HistoryList, useConversation } from './tutor-chrome';
import { Popover, TIcon, TutorAvatar } from './tutor-ui';
import { useTutor } from './tutor-store';

/** The lesson's code editor on screen (learner workspace keys lc:<course>:<lesson>:<assessment>[:step]). */
const editorEl = (courseId, lessonId) => document.querySelector(`[data-cp-input^="lc:${courseId}:${lessonId}:"]`);
/** "Xem dòng N": selects that line in the code textarea and scrolls it into view. */
function selectEditorLine(editor, line) {
  if (!editor) return;
  const lines = editor.value.split('\n');
  const index = Math.min(Math.max(line, 1), lines.length) - 1;
  const start = lines.slice(0, index).reduce((sum, text) => sum + text.length + 1, 0);
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(start, start + lines[index].length);
  editor.scrollTop = Math.max(0, index * (parseFloat(getComputedStyle(editor).lineHeight) || 20) - editor.clientHeight / 2);
  editor.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/** What the lesson's code workspace lends the Tutor; read fresh on every call. */
function codeBridge(courseId, lessonId, showCode) {
  const snap = (testId) => (Codi.code && Codi.code.bridge ? Codi.code.bridge(courseId, lessonId, testId) : null);
  const afterShow = (fn) => { if (showCode) showCode(); requestAnimationFrame(() => requestAnimationFrame(fn)); };
  return {
    task: () => { const b = snap(); return b ? b.task : null; },
    getCode: () => { const b = snap(); return b ? b.code || '' : ''; },
    setCode: (value) => { const ta = editorEl(courseId, lessonId); if (ta) setEditorValue(ta, value); },
    selectLine: (n) => afterShow(() => selectEditorLine(editorEl(courseId, lessonId), n)),
    runTests: () => afterShow(() => { if (Codi.code && Codi.code.runTests) Codi.code.runTests(courseId, lessonId); }),
    failingTest: (testId) => {
      const b = snap(testId);
      const f = b && b.failing;
      return f ? { name: f.name, input: f.input ?? null, expected: f.expected ?? '', actual: f.actual ?? null } : null;
    },
    runError: () => { const b = snap(); return b ? b.runError || null : null; },
  };
}

export default function TutorLessonTab({ courseId, lessonId, title, onActivate, onShowCode }) {
  const ai = useTutor();
  const { data, error, retry, setLesson } = useConversation(ai);
  const activate = useRef(onActivate);
  activate.current = onActivate;
  const showCode = useRef(onShowCode);
  showCode.current = onShowCode;

  const page = useMemo(() => ({
    kind: 'lesson', courseId, lessonId, label: title ? `Bài: ${title}` : 'Bài học', href: `/learn/${encodeURIComponent(courseId)}/${encodeURIComponent(lessonId)}`,
  }), [courseId, lessonId, title]);
  useEffect(() => {
    ai.setPage(page, () => { if (typeof activate.current === 'function') activate.current(); });
    return () => ai.setPage(null);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // The code bridge exists while the lesson's workspace is loaded; a run, an edit or a step re-reads the chips.
  useEffect(() => {
    const bridge = codeBridge(courseId, lessonId, () => { if (typeof showCode.current === 'function') showCode.current(); });
    let lent = null;
    const sync = () => {
      const has = !!(Codi.code && Codi.code.bridge && Codi.code.bridge(courseId, lessonId));
      if (has && lent !== bridge) { lent = bridge; ai.registerCode(bridge); } else if (!has && lent) { lent = null; ai.registerCode(null); } else if (has) ai.touchCode();
    };
    sync();
    let live = true;
    // Deferred: the workspace may notify while it renders, and the Tutor must not update during that render.
    const off = Codi.code && Codi.code.subscribe ? Codi.code.subscribe(() => queueMicrotask(() => { if (live) sync(); })) : () => {};
    return () => { live = false; off(); if (lent) ai.registerCode(null); };
  }, [courseId, lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  const chat = data ? data.chat : null;
  const elsewhere = !!chat && (chat.kind === 'lesson' ? chat.lessonId !== lessonId : true);
  const fullHref = ai.active.stored ? `/ai?c=${ai.active.id}` : '/ai';

  const header = (
    <div className="tc-panel-head">
      <TutorAvatar />
      <h2 className="tc-panel-title">Tutor</h2>
      <span className="tc-context" title={`Đang hỏi về: ${page.label}`}><Icon name="book-open" className="icon-xs" /><span>{page.label}</span></span>
      <span className="tc-panel-actions">
        {ai.signedIn ? (
          <Popover label="Lịch sử hỏi Tutor" onOpen={() => ai.refreshChats()} renderTrigger={({ open, ...props }) => (
            <button type="button" {...props} className={`btn btn-ghost btn-icon btn-sm ${open ? 'is-pressed' : ''}`.trim()} aria-label="Lịch sử hỏi Tutor" title="Lịch sử hỏi Tutor"><TIcon name="history" className="icon-sm" /></button>
          )}>
            {(close) => (
              <div className="tc-pop-history">
                <div className="tc-pop-scroll">
                  <HistoryList chats={ai.chats} activeId={ai.active.stored ? ai.active.id : null} limit={8} onSelect={(picked) => { ai.select(picked); close(); }} />
                </div>
                <Link to="/ai" className="tc-pop-foot"><TIcon name="history" className="icon-sm" /> Xem tất cả lịch sử</Link>
              </div>
            )}
          </Popover>
        ) : null}
        <Link to={fullHref} className="btn btn-ghost btn-icon btn-sm" aria-label="Mở toàn trang" title="Mở toàn trang"><TIcon name="maximize" className="icon-sm" /></Link>
      </span>
    </div>
  );
  const elsewhereBar = elsewhere ? (
    <div className="tc-elsewhere">
      <span>Đoạn chat ở {chat.contextLabel}</span>
      {chat.contextHref ? <Link to={chat.contextHref}><Icon name="external-link" className="icon-xs" /> Mở đúng chỗ</Link> : null}
      <button type="button" className="tc-link" onClick={() => ai.backToPage()}><TIcon name="square-pen" className="icon-xs" /> Hỏi về trang này</button>
    </div>
  ) : null;

  return (
    <section className="tc-panel" aria-label="Tutor">
      {error ? <>{header}<ChatLoadError message={error} retry={retry} /></> : !data ? (
        <>{header}<p className="tc-center" role="status"><Icon name="loader" className="icon-sm tc-spin" /> Đang mở Tutor…</p></>
      ) : (
        <TutorThread key={data.id} ai={ai} variant="panel" chatId={data.id} initialMessages={data.messages} chat={data.chat} lesson={data.lesson}
          onLesson={setLesson} header={<>{header}{elsewhereBar}</>} />
      )}
    </section>
  );
}
