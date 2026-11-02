/**
 * Installs Codi.tutor, the lesson-side entry points of the one Tutor (features/tutor/, port of Codi develop's shared
 * Tutor: lesson and general chats with one history, streaming, reasoning and tools). The lesson player hosts the
 * Tutor as its "Tutor" tab; the full page is /ai.
 *
 *   Codi.tutor.embed(courseId, lessonId, { onActivate, onShowCode, title }) → element
 *       The lesson's Tutor tab. While mounted, open()/explainError()/explainRunError() for that lesson go to it and call
 *       onActivate() so the host shows the tab; onShowCode() shows the code tab before a line jump or a test run.
 *   Codi.tutor.open(courseId, lessonId, ctx?)       ctx: { selection?, testId?, ask? } — adds context, asks `ask` once
 *   Codi.tutor.explainError(courseId, lessonId, testId)   asks why that test failed (the test goes along as context)
 *   Codi.tutor.explainRunError(courseId, lessonId)        asks about the last syntax / runtime / timeout error
 *   Codi.tutor.pageHref() → '/ai'
 * Importing this module also installs the selection toolbar (features/tutor/tutor-selection.js).
 */
import { Codi } from '../../lib/codi';
import TutorLessonTab from '../tutor/tutor-lesson-tab';
import { tutorStore } from '../tutor/tutor-store';
import '../tutor/tutor-selection';

const bridgeOf = (courseId, lessonId, testId) => (Codi.code && Codi.code.bridge ? Codi.code.bridge(courseId, lessonId, testId) : null);

const tutor = {
  open(courseId, lessonId, ctx) {
    if (!courseId || !lessonId) return;
    const request = ctx || {};
    if (tutorStore.hosts(lessonId)) { tutorStore.openWith(request); return; }
    // No Tutor tab for this lesson on screen: the question goes to the full page.
    tutorStore.rememberOrigin();
    Codi.go(request.ask ? `/ai?prompt=${encodeURIComponent(request.ask)}` : '/ai');
  },
  explainError(courseId, lessonId, testId) {
    const b = bridgeOf(courseId, lessonId, testId);
    const test = b ? b.failing : null;
    tutor.open(courseId, lessonId, { testId, ask: test ? `Giải thích giúp mình vì sao test “${test.name}” chưa đạt?` : 'Giải thích giúp mình lỗi ở lần chạy gần nhất?' });
  },
  explainRunError(courseId, lessonId) {
    const b = bridgeOf(courseId, lessonId);
    const error = b ? b.runError : null;
    tutor.open(courseId, lessonId, { ask: error ? `Code của mình báo lỗi “${error.slice(0, 80)}”. Lỗi này nghĩa là gì và mình nên xem chỗ nào?` : 'Giải thích giúp mình lỗi ở lần chạy gần nhất?' });
  },
  embed(courseId, lessonId, opts = {}) {
    return <TutorLessonTab key={`${courseId}:${lessonId}`} courseId={courseId} lessonId={lessonId} title={opts.title} onActivate={opts.onActivate} onShowCode={opts.onShowCode} />;
  },
  pageHref: () => '/ai',
};

Object.assign(Codi, { tutor });
