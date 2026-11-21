import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ymd, runs, periods, streaks, bestIn, covered, weeksOfMonth, monthRow } from '../logic.js';
import { fromJSON, toJSON, cleanFreq } from '../store.js';

const d = (m, day) => new Date(2026, m, day, 15);
const set = (...keys) => new Set(keys);
const DAILY = { type: 'daily' };

test('runs joins consecutive days and skips padding', () => {
  const days = [null, d(0, 1), d(0, 2), d(0, 3), d(0, 4)];
  assert.deepEqual(runs(days, set('2026-01-01', '2026-01-02', '2026-01-04')), [[1, 2], [4, 4]]);
});

test('daily: current survives an unchecked today, best spans months', () => {
  const done = set('2026-01-30', '2026-01-31', '2026-02-01', '2026-02-05', '2026-02-06');
  assert.deepEqual(streaks(periods(DAILY, done, d(1, 7))), { cur: 2, best: 3 });
  assert.equal(streaks(periods(DAILY, done, d(1, 8))).cur, 0);
});

test('specific days: rest days neither break nor count, and get bridged', () => {
  const mwf = { type: 'days', days: [0, 2, 4] }; // Mon, Wed, Fri
  const done = set('2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09'); // M W F M
  const ps = periods(mwf, done, d(10, 10)); // Tue 10: not scheduled
  assert.deepEqual(streaks(ps), { cur: 4, best: 4 });
  const cov = covered(ps, done, d(10, 10));
  assert.ok(cov.has('2026-11-03') && cov.has('2026-11-08')); // Tue and Sun bridged
  assert.ok(!cov.has('2026-11-10'));
  assert.equal(streaks(periods(mwf, done, d(10, 12))).cur, 0); // missed Wed 11
});

test('weekly: streak counts weeks that hit the target; current week stays pending', () => {
  const three = { type: 'weekly', times: 3 };
  const done = set('2026-11-02', '2026-11-03', '2026-11-05', // week 1: 3 ✓
    '2026-11-09', '2026-11-12', '2026-11-15', // week 2: 3 ✓
    '2026-11-16'); // week 3: 1, in progress
  const ps = periods(three, done, d(10, 18));
  assert.deepEqual(streaks(ps), { cur: 2, best: 2 });
  const cov = covered(ps, done, d(10, 18));
  assert.ok(cov.has('2026-11-04') && cov.has('2026-11-14') && cov.has('2026-11-16'));
  assert.ok(!cov.has('2026-11-17'));
  assert.equal(bestIn(ps, '2026-11-09', '2026-11-30'), 1);
});

test('weeks start on Monday and month rows are 31 long', () => {
  const w = weeksOfMonth(2026, 10);
  assert.equal(ymd(w[0][6]), '2026-11-01');
  assert.equal(monthRow(2026, 1).filter(Boolean).length, 28);
});

test('fromJSON rejects foreign files, defaults freq and round-trips data', () => {
  assert.throws(() => fromJSON({ foo: 1 }));
  const s = fromJSON({ version: 1, habits: [{ id: 'a', name: ' Leer ', tone: 7 }], done: { a: ['2026-01-01', 'bad'] }, lastBackup: null });
  assert.equal(s.habits[0].name, 'Leer');
  assert.deepEqual(s.habits[0].freq, DAILY);
  assert.deepEqual(toJSON(s).done, { a: ['2026-01-01'] });
  assert.deepEqual(cleanFreq({ type: 'days', days: [4, 0, 9, 0] }), { type: 'days', days: [0, 4] });
  assert.deepEqual(cleanFreq({ type: 'days', days: [] }), DAILY);
  assert.deepEqual(cleanFreq({ type: 'weekly', times: 9 }), DAILY);
});

test('goal progress: numeric (also decreasing), steps, and pace against deadline', async () => {
  const { goalProgress } = await import('../logic.js');
  const base = { kind: 'number', start: 80, target: 70, log: [{ d: '2026-11-10', v: 75 }], steps: [], startDate: '2026-11-01', deadline: '2026-11-21' };
  const p = goalProgress(base, d(10, 11)); // 10 of 20 days elapsed
  assert.equal(p.pct, 0.5);
  assert.equal(p.expected, 0.5);
  assert.equal(p.daysLeft, 10);
  assert.equal(goalProgress({ ...base, log: [{ d: '2026-11-10', v: 60 }] }, d(10, 11)).pct, 1); // clamped
  const steps = goalProgress({ kind: 'steps', steps: [{ done: true }, { done: false }], deadline: null }, d(10, 11));
  assert.deepEqual([steps.pct, steps.expected, steps.daysLeft], [0.5, null, null]);
});

test('cleanGoal drops unknown habits and invalid fields', async () => {
  const { cleanGoal } = await import('../store.js');
  assert.equal(cleanGoal({ id: 'g', title: '  ' }, new Set()), null);
  const g = cleanGoal({ id: 'g', title: 'Correr', kind: 'x', target: 'a', habits: ['h1', 'zz'], deadline: '2026-13', status: 'weird' }, new Set(['h1']));
  assert.deepEqual([g.kind, g.target, g.habits, g.deadline, g.status], ['number', 0, ['h1'], null, 'active']);
});

test('journal entries: empty ones vanish, scales are 1-5, prompts survive import', async () => {
  const { cleanEntry, fromJSON, toJSON } = await import('../store.js');
  assert.equal(cleanEntry({ mood: null, text: '   ', answers: { '¿Qué?': ' ' } }), null);
  assert.deepEqual(cleanEntry({ mood: 7, energy: 2, text: 'ok' }), { mood: null, energy: 2, text: 'ok', answers: {}, sleep: null, bed: null, wake: null });
  const s = fromJSON({ version: 1, habits: [], done: {}, journal: { '2026-11-20': { mood: 4 }, bad: { mood: 3 }, '2026-11-21': {} }, prompts: ['A', ''] });
  assert.deepEqual(Object.keys(s.journal), ['2026-11-20']);
  assert.deepEqual(s.prompts, ['A']);
  assert.equal(fromJSON(JSON.parse(JSON.stringify(toJSON(s)))).journal['2026-11-20'].mood, 4);
  assert.equal(fromJSON({ version: 1, habits: [], done: {} }).prompts.length, 3); // older backups get defaults
});

test('weekly review: stats per frequency, which week, and saved answers', async () => {
  const { weekStats, reviewWeek, mondayOf } = await import('../logic.js');
  const { cleanReview } = await import('../store.js');
  const mon = new Date(2026, 10, 16);
  const done = set('2026-11-16', '2026-11-18', '2026-11-19', '2026-11-22');
  const now = d(10, 22); // Sunday
  assert.deepEqual(weekStats({ type: 'daily' }, done, mon, now), { done: 4, due: 7 });
  assert.deepEqual(weekStats({ type: 'days', days: [0, 2, 4] }, done, mon, now), { done: 2, due: 3 });
  assert.deepEqual(weekStats({ type: 'weekly', times: 3 }, done, mon, now), { done: 3, due: 3 });
  assert.deepEqual(weekStats({ type: 'daily' }, done, mon, d(10, 18)), { done: 2, due: 3 }); // mid-week
  assert.equal(ymd(reviewWeek(now)), '2026-11-16'); // Sunday reviews the current week
  assert.equal(ymd(reviewWeek(d(10, 24))), '2026-11-16'); // Tuesday reviews the week that ended
  assert.equal(ymd(mondayOf(d(10, 22))), '2026-11-16');
  assert.equal(cleanReview({ answers: { worked: ' ' } }), null);
  assert.deepEqual(cleanReview({ answers: { focus: 'Dormir 7 h' }, doneAt: '2026-11-22' }).answers.focus, 'Dormir 7 h');
});

test('sleep duration crosses midnight; entries keep only complete nights', async () => {
  const { sleepMins } = await import('../logic.js');
  const { cleanEntry, fromJSON } = await import('../store.js');
  assert.equal(sleepMins('23:30', '07:10'), 460);
  assert.equal(sleepMins('01:00', '08:00'), 420);
  assert.equal(sleepMins('07:00', '07:00'), null);
  assert.equal(cleanEntry({ bed: '23:00' }), null); // half a night is dropped
  assert.deepEqual(cleanEntry({ bed: '23:00', wake: '25:00', sleep: 3 }).bed, null);
  const s = fromJSON({ version: 1, habits: [], done: {}, metrics: [{ id: 'm', name: 'Peso', unit: 'kg' }, { id: 'x' }], values: { m: { '2026-11-20': 77.1, bad: 1, '2026-11-21': 'a' } } });
  assert.deepEqual(s.metrics.map(m => m.id), ['m']);
  assert.deepEqual(s.values.m, { '2026-11-20': 77.1 });
});
