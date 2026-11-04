/**
 * Pure commerce helpers: catalogue search/sort (real lib/filter-course-catalog.ts), typeahead groups, labels.
 * Courses are the shape produced by toCourse() in commerce-api.js. Orders, carts, vouchers and payments live in
 * the backend (see commerce-api.js).
 */
import { fmt } from '../../lib/format';

export const SUPPORT_EMAIL = 'hotro@codi.vn';

export const priceLabel = (c) => (c.price ? fmt.vnd(c.price) : 'Miễn phí');

// Lesson content kinds (GET /api/courses/:slug/lesson-kinds) with visual labels (S02 requirement).
export const TYPE_ICON = { video: 'video', pdf: 'presentation', reading: 'book-open', tutorial: 'terminal', coding: 'code', quiz: 'clipboard-check', assignment: 'upload' };
export const TYPE_LABEL = { video: 'Video', pdf: 'Slide/PDF', reading: 'Bài đọc', tutorial: 'Hướng dẫn code', coding: 'Bài code', quiz: 'Quiz', assignment: 'Bài tập' };

export const mmss = (ms) => (ms > 0 ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}` : '0:00');

// ───────────────────────── catalog search (lib/filter-course-catalog.ts) ─────────────────────────

/** Catalog entry shape used by the real filter functions. Topics come from /api/courses (confirmed maps only). */
export const catalogEntry = (c) => ({
  course: c, id: c.id, slug: c.slug, title: c.title, description: c.summary || '', category: c.category || '',
  level: c.level, topics: c.topics || [], price: c.price || 0, enrollmentCount: c.learnersCount || 0,
  rating: c.rating || 0, createdAt: c.createdAt,
});

export const SORT_VALUES = ['popular', 'newest', 'rating', 'enrollment'];
/** URL sort value → supported option; legacy price sorts and 'relevant' fall back to 'popular' (real hydration). */
export const normaliseSort = (s) => (SORT_VALUES.includes(s) ? s : 'popular');

/** Pure filter + sort (real filterCourseCatalog). `entries` come from catalogEntry(); `cat` is a category name. */
export function filterCatalog(entries, query, { cat = 'all', level = 'all', price = 'all', sort } = {}) {
  const q = String(query || '').trim().toLowerCase();
  const list = entries.filter((e) => {
    const matchesSearch = !q || e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
      || e.category.toLowerCase().includes(q) || e.topics.some((t) => t.toLowerCase().includes(q));
    const matchesCat = cat === 'all' || e.category === cat;
    const matchesLevel = level === 'all' || e.level === level;
    const matchesPrice = price === 'all' || (price === 'free' && e.price === 0) || (price === 'paid' && e.price > 0);
    return matchesSearch && matchesCat && matchesLevel && matchesPrice;
  });
  if (!sort) return list;
  const byEnrol = (a, b) => b.enrollmentCount - a.enrollmentCount;
  switch (sort) {
    case 'newest': return list.sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0));
    case 'rating': return list.sort((a, b) => b.rating - a.rating);
    case 'enrollment': return list.sort(byEnrol);
    default: // 'popular' = "Phù hợp nhất": title matches first when searching, then enrolment count
      if (q) {
        return list.sort((a, b) => {
          const at = a.title.toLowerCase().includes(q) ? 2 : 0;
          const bt = b.title.toLowerCase().includes(q) ? 2 : 0;
          return at !== bt ? bt - at : byEnrol(a, b);
        });
      }
      return list.sort(byEnrol);
  }
}

/** Typeahead groups (real getTypeaheadSuggestions): query suggestions, top results (courses then topics), matches. */
export function typeaheadSuggestions(entries, query) {
  const t = String(query || '').trim().toLowerCase();
  if (!t) return { matches: [], querySuggestions: [], topResults: [], isEmpty: false };
  const matches = filterCatalog(entries, query);
  const suggestions = new Set();
  entries.forEach((e) => {
    if (e.title.toLowerCase().includes(t)) suggestions.add(e.title);
    e.topics.forEach((x) => { if (x.toLowerCase().includes(t)) suggestions.add(x); });
  });
  const topResults = entries.filter((e) => e.title.toLowerCase().includes(t) || e.description.toLowerCase().includes(t)).slice(0, 4)
    .map((e) => ({ id: `course-${e.id}`, title: e.title, type: 'Khóa học', entry: e, category: e.category }));
  const seen = new Set();
  entries.forEach((e) => e.topics.forEach((x) => {
    if (x.toLowerCase().includes(t) && !seen.has(x.toLowerCase())) {
      seen.add(x.toLowerCase());
      topResults.push({ id: `topic-${x}`, title: x, type: 'Chủ đề', topic: x, category: e.category });
    }
  }));
  const querySuggestions = [...suggestions].slice(0, 5);
  return { matches, querySuggestions, topResults, isEmpty: !matches.length && !topResults.length && !querySuggestions.length };
}
