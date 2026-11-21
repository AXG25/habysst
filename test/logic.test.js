import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ymd, runs, streaks, weeksOfMonth, monthRow, longestRun } from '../logic.js';
import { fromJSON, toJSON } from '../store.js';

const d = (m, day) => new Date(2026, m, day);
const set = (...keys) => new Set(keys);

test('runs joins consecutive days and skips padding', () => {
  const days = [null, d(0, 1), d(0, 2), d(0, 3), d(0, 4)];
  assert.deepEqual(runs(days, set('2026-01-01', '2026-01-02', '2026-01-04')), [[1, 2], [4, 4]]);
});

test('streaks: current survives an unchecked today, best spans months', () => {
  const done = set('2026-01-30', '2026-01-31', '2026-02-01', '2026-02-05', '2026-02-06');
  assert.deepEqual(streaks(done, d(1, 7)), { cur: 2, best: 3 });
  assert.equal(streaks(done, d(1, 8)).cur, 0);
});

test('weeks start on Monday and month rows are 31 long', () => {
  const w = weeksOfMonth(2026, 10); // Nov 2026 starts on Sunday
  assert.equal(w[0].filter(Boolean).length, 1);
  assert.equal(ymd(w[0][6]), '2026-11-01');
  assert.equal(monthRow(2026, 1).filter(Boolean).length, 28);
  assert.equal(longestRun(monthRow(2026, 1), set('2026-02-27', '2026-02-28')), 2);
});

test('fromJSON rejects foreign files and round-trips data', () => {
  assert.throws(() => fromJSON({ foo: 1 }));
  const s = fromJSON({ version: 1, habits: [{ id: 'a', name: ' Leer ', tone: 7 }], done: { a: ['2026-01-01', 'bad'] }, lastBackup: null });
  assert.equal(s.habits[0].name, 'Leer');
  assert.equal(s.habits[0].tone, 1);
  assert.deepEqual(toJSON(s).done, { a: ['2026-01-01'] });
});
