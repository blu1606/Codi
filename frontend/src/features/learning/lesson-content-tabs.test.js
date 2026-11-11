// Transcript helpers of the reader's content tabs: cue timecodes and the cue playing at a given second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeCueIndex, cueTime } from './lesson-content-tabs.jsx';

const cues = [
  { start: 0, end: 6, text: 'Mở đầu' },
  { start: 6, text: 'Không có end: chạy tới cue sau' },
  { start: 20, end: 25, text: 'Có end' },
  { start: 30, text: 'Cue cuối' },
];

test('cueTime formats minutes and hours', () => {
  assert.equal(cueTime(0), '0:00');
  assert.equal(cueTime(65.9), '1:05');
  assert.equal(cueTime(3725), '1:02:05');
  assert.equal(cueTime(-3), '0:00');
});

test('activeCueIndex finds the cue playing at a second', () => {
  assert.equal(activeCueIndex(cues, 0), 0);
  assert.equal(activeCueIndex(cues, 5.99), 0);
  assert.equal(activeCueIndex(cues, 6), 1);
  assert.equal(activeCueIndex(cues, 19.5), 1);
  assert.equal(activeCueIndex(cues, 22), 2);
  assert.equal(activeCueIndex(cues, 3600), 3);
});

test('activeCueIndex returns -1 in a gap, before the first cue and for a bad time', () => {
  assert.equal(activeCueIndex(cues, 27), -1);
  assert.equal(activeCueIndex([{ start: 10, text: 'x' }], 3), -1);
  assert.equal(activeCueIndex(cues, Number.NaN), -1);
  assert.equal(activeCueIndex([], 4), -1);
});
