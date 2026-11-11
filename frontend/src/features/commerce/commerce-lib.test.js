/**
 * Unit tests for the pure catalogue rules (no test runner is installed; run with node's built-in runner):
 *   npx esbuild src/features/commerce/commerce-lib.test.js --bundle --platform=node --format=esm --outfile=<tmp>/t.mjs
 *   node --test <tmp>/t.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCatalog, normaliseSort, typeaheadSuggestions } from './commerce-lib';

const entries = [
  { id: 'c1', title: 'React Fundamentals', description: 'Learn React', category: 'Frontend', categoryId: 'fe', level: 'Beginner', topics: ['React', 'Hooks'], price: 1000, enrollmentCount: 5, rating: 4.1, createdAt: '2026-01-01' },
  { id: 'c2', title: 'Node.js Backend', description: 'APIs with React clients', category: 'Backend', categoryId: 'be', level: 'Intermediate', topics: ['Express'], price: 0, enrollmentCount: 50, rating: 4.8, createdAt: '2026-03-01' },
  { id: 'c3', title: 'Python Data', description: 'Pandas', category: 'Dữ liệu', categoryId: 'da', level: 'Advanced', topics: [], price: 2000, enrollmentCount: 20, rating: 4.5, createdAt: '2026-02-01' },
];

test('"Phù hợp nhất" ranks title matches before enrolment count', () => {
  const r = filterCatalog(entries, 'react', { sort: 'popular' });
  assert.deepEqual(r.map((e) => e.id), ['c1', 'c2']);
  assert.deepEqual(filterCatalog(entries, '', { sort: 'popular' }).map((e) => e.id), ['c2', 'c3', 'c1']);
});

test('filters by topic, category, level and price; sorts by newest and rating', () => {
  assert.deepEqual(filterCatalog(entries, 'hooks').map((e) => e.id), ['c1']);
  assert.deepEqual(filterCatalog(entries, '', { price: 'free' }).map((e) => e.id), ['c2']);
  assert.deepEqual(filterCatalog(entries, '', { cat: 'Dữ liệu', level: 'Advanced' }).map((e) => e.id), ['c3']);
  assert.deepEqual(filterCatalog(entries, '', { sort: 'newest' }).map((e) => e.id), ['c2', 'c3', 'c1']);
  assert.deepEqual(filterCatalog(entries, '', { sort: 'rating' }).map((e) => e.id), ['c2', 'c3', 'c1']);
});

test('legacy and unknown sort values fall back to "popular"', () => {
  assert.equal(normaliseSort('price-asc'), 'popular');
  assert.equal(normaliseSort('relevant'), 'popular');
  assert.equal(normaliseSort('enrollment'), 'enrollment');
});

test('typeahead returns suggestions, course then topic top results, and an empty flag', () => {
  const t = typeaheadSuggestions(entries, 'react');
  assert.deepEqual(t.querySuggestions, ['React Fundamentals', 'React']);
  assert.deepEqual(t.topResults.map((r) => r.type), ['Khoá học', 'Khoá học', 'Chủ đề']);
  assert.equal(t.matches.length, 2);
  assert.equal(typeaheadSuggestions(entries, 'zzz').isEmpty, true);
  assert.equal(typeaheadSuggestions(entries, '  ').isEmpty, false);
});
