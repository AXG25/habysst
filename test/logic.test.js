import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ymd, runs, periods, streaks, bestIn, covered, constancy, weeksOfMonth, monthRow } from '../logic.js';
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
  assert.equal(s.habits[0].tone, 7);
  assert.equal(fromJSON({ version: 1, habits: [{ id: 'b', name: 'x', tone: 13 }], done: {} }).habits[0].tone, 1);
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
  const { weekStats, reviewPeriod, mondayOf } = await import('../logic.js');
  const { cleanReview } = await import('../store.js');
  const mon = new Date(2026, 10, 16);
  const done = set('2026-11-16', '2026-11-18', '2026-11-19', '2026-11-22');
  const now = d(10, 22); // Sunday
  assert.deepEqual(weekStats({ type: 'daily' }, done, mon, now), { done: 4, due: 7 });
  assert.deepEqual(weekStats({ type: 'days', days: [0, 2, 4] }, done, mon, now), { done: 2, due: 3 });
  assert.deepEqual(weekStats({ type: 'weekly', times: 3 }, done, mon, now), { done: 3, due: 3 });
  assert.deepEqual(weekStats({ type: 'daily' }, done, mon, d(10, 18)), { done: 2, due: 3 }); // mid-week
  assert.equal(reviewPeriod('week', now).key, '2026-11-16'); // Sunday reviews the current week
  assert.equal(reviewPeriod('week', d(10, 24)).key, '2026-11-16'); // Tuesday reviews the week that ended
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

test('focus sessions are validated and goal links dropped when the goal is gone', async () => {
  const { fromJSON } = await import('../store.js');
  const s = fromJSON({ version: 1, habits: [], done: {}, goals: [{ id: 'g', title: 'Meta' }],
    focus: [{ start: '2026-11-21T08:00:00.000Z', mins: 25.4, goal: 'g' }, { start: 'nope', mins: 5 }, { start: '2026-11-21T09:00:00.000Z', mins: 10, goal: 'zz' }],
    timer: { start: '2026-11-21T10:00:00.000Z', target: 50, goal: 'zz' } });
  assert.deepEqual(s.focus.map(f => [f.mins, f.goal]), [[25, 'g'], [10, null]]);
  assert.deepEqual(s.timer, { start: '2026-11-21T10:00:00.000Z', target: 50, goal: null });
});

test('compareDays needs enough days on both sides and skips unknown days', async () => {
  const { compareDays } = await import('../logic.js');
  const keys = Array.from({ length: 12 }, (_, i) => `k${i}`);
  const energy = k => (k === 'k11' ? null : +k.slice(1) < 6 ? 4 : 2);
  const ran = k => +k.slice(1) < 6;
  assert.deepEqual(compareDays(keys, energy, ran), { yes: 4, no: 2, nYes: 6, nNo: 5 });
  assert.equal(compareDays(keys, energy, ran, 6), null);
  assert.equal(compareDays(keys, energy, () => null), null);
});

test('pomodoro advances through every phase, even after the app was closed', async () => {
  const { advancePomodoro } = await import('../logic.js');
  const t0 = Date.parse('2026-11-21T09:00:00.000Z');
  const start = { start: new Date(t0).toISOString(), target: 25, goal: 'g', phase: 'work', pomo: 0 };
  assert.equal(advancePomodoro(start, t0 + 24 * 60000).timer.phase, 'work');
  let r = advancePomodoro(start, t0 + 26 * 60000);
  assert.deepEqual([r.timer.phase, r.timer.target, r.timer.pomo, r.sessions.length], ['break', 5, 1, 1]);
  assert.deepEqual(r.sessions[0], { start: start.start, mins: 25, goal: 'g' });
  r = advancePomodoro(start, t0 + 3 * 3600000); // gone for hours: work then break, then waits
  assert.deepEqual([r.timer.phase, r.timer.pomo, r.sessions.length], ['ready', 1, 1]);
  assert.equal(r.timer.start, new Date(t0 + 30 * 60000).toISOString());
  r = advancePomodoro({ ...start, pomo: 3 }, t0 + 26 * 60000);
  assert.equal(r.timer.target, 15); // every 4th break is long
});

test('review periods: keys, ranges, previous period and which one to review', async () => {
  const { periodOf, keyFor, reviewPeriod } = await import('../logic.js');
  const { fromJSON } = await import('../store.js');
  assert.deepEqual(periodOf('M-2026-02'), { key: 'M-2026-02', kind: 'month', from: '2026-02-01', to: '2026-02-28', prev: 'M-2026-01' });
  assert.deepEqual(periodOf('Q-2026-1'), { key: 'Q-2026-1', kind: 'quarter', from: '2026-01-01', to: '2026-03-31', prev: 'Q-2025-4' });
  assert.equal(periodOf('Y-2026').prev, 'Y-2025');
  assert.equal(periodOf('2026-11-16').prev, '2026-11-09');
  assert.equal(keyFor('quarter', d(10, 21)), 'Q-2026-4');
  assert.equal(reviewPeriod('month', d(10, 21)).key, 'M-2026-10'); // mid-month: the month that ended
  assert.equal(reviewPeriod('month', d(10, 29)).key, 'M-2026-11'); // last days: this month
  assert.equal(reviewPeriod('quarter', d(11, 26)).key, 'Q-2026-4');
  assert.equal(reviewPeriod('year', d(0, 3)).key, 'Y-2025');
  assert.equal(reviewPeriod('year', d(11, 22)).key, 'Y-2026');
  const s = fromJSON({ version: 1, habits: [], done: {}, reviews: { 'M-2026-11': { answers: { focus: 'x' } }, 'M-2026-13': { answers: { focus: 'x' } }, 'Q-2026-4': { doneAt: '2026-12-30' } },
    compass: { values: ['Salud', ' ', 'a', 'b', 'c', 'd', 'e'], vision: ' Vivir cerca del mar ' } });
  assert.deepEqual(Object.keys(s.reviews), ['M-2026-11', 'Q-2026-4']);
  assert.deepEqual(s.compass, { values: ['Salud', 'a', 'b', 'c', 'd'], vision: 'Vivir cerca del mar' });
});

test('lists are validated on load and import', async () => {
  const { fromJSON } = await import('../store.js');
  const s = fromJSON({ version: 1, habits: [], done: {}, lists: [
    { id: 'l1', name: ' Antes de morir ', items: [{ id: 'a', text: 'Ver auroras', done: true, doneAt: '2026-11-20' }, { id: 'b', text: '  ' }, { id: 'c', text: 'Japón', done: 'yes', doneAt: '2026-11-21' }] },
    { id: 'l2', name: '' }] });
  assert.equal(s.lists.length, 1);
  assert.equal(s.lists[0].name, 'Antes de morir');
  assert.deepEqual(s.lists[0].items.map(i => [i.text, i.done, i.doneAt]), [['Ver auroras', true, '2026-11-20'], ['Japón', false, null]]);
});

test('data protection helpers: emptiness, snapshot pruning and summaries', async () => {
  const { hasData, toPrune, summarize, fromJSON } = await import('../store.js');
  assert.equal(hasData(fromJSON({ version: 1, habits: [], done: {} })), false);
  assert.equal(hasData(fromJSON({ version: 1, habits: [], done: {}, lists: [{ id: 'l', name: 'Súper', items: [] }] })), true);
  const keys = ['current', 'snapday', ...Array.from({ length: 33 }, (_, i) => `snap:2026-11-${String(i % 28 + 1).padStart(2, '0')}T${String(i).padStart(2, '0')}`)];
  const drop = toPrune(keys);
  assert.equal(drop.length, 18); // 33 copies, keep the newest 15
  assert.ok(drop.every(k => k.startsWith('snap:')));
  assert.ok(drop.every(k => keys.filter(x => x.startsWith('snap:') && x > k).length >= 15)); // only the oldest go
  assert.deepEqual(summarize({ version: 1, habits: [{ id: 'h', name: 'Leer' }], done: { h: ['2026-11-20', '2026-11-21'] }, journal: { '2026-11-21': { mood: 3 } } }),
    { habits: 1, checks: 2, entries: 1, goals: 0, lists: 0 });
});

test('ids from a backup file must be plain: no HTML, no __proto__', async () => {
  const { fromJSON } = await import('../store.js');
  const s = fromJSON({ version: 1, done: {}, habits: [
    { id: 'x"><img src=x onerror=alert(1)>', name: 'Malo' }, { id: '__proto__', name: 'Proto' }, { id: 'c0ffee-12_ab', name: 'Bueno' }],
    lists: [{ id: 'l"', name: 'L', items: [] }, { id: 'l1', name: 'L1', items: [{ id: '<i>', text: 't' }, { id: 'i1', text: 'ok' }] }] });
  assert.deepEqual(s.habits.map(h => h.id), ['c0ffee-12_ab']);
  assert.deepEqual(s.lists.map(l => [l.id, l.items.map(i => i.id)]), [['l1', ['i1']]]);
});

test('first-run starter: complete recipe, 90 days of history, and exact removal of that history', async () => {
  const { starter, removeFiller } = await import('../seed.js');
  const { fromJSON, toJSON } = await import('../store.js');
  const now = new Date(2026, 10, 21, 10);
  const s = fromJSON(JSON.parse(JSON.stringify(toJSON(starter(now))))); // survives a save and reload
  assert.equal(s.habits.length, 6);
  assert.equal(s.goals.length, 2);
  assert.equal(s.metrics.length, 2);
  assert.equal(s.lists.length, 2);
  const allDates = Object.values(s.done).flatMap(set => [...set]);
  assert.ok(allDates.length > 250);
  assert.ok(allDates.every(k => k < '2026-11-21' && k >= '2026-08-23')); // nothing today or in the future
  assert.ok(Object.keys(s.journal).length > 60);
  // The person logs today, writes on one past day and checks a past day themselves.
  const [h0] = s.habits;
  s.done[h0.id].add('2026-11-21');
  const written = Object.keys(s.journal)[5];
  s.journal[written].text = 'Lo escribí yo';
  const own = '2026-08-01';
  s.done[h0.id].add(own);
  removeFiller(s);
  assert.equal(s.demo, null);
  assert.deepEqual([...s.done[h0.id]].sort(), [own, '2026-11-21']);
  assert.deepEqual(Object.keys(s.journal), [written]);
  assert.ok(Object.values(s.values).every(v => !Object.keys(v).length));
  assert.equal(s.focus.length, 0);
  assert.equal(s.habits.length, 6); // the recipe itself stays
});

test('custom review questions are kept, answers keyed by question text, empty answers dropped', async () => {
  const { fromJSON, toJSON, cleanReview } = await import('../store.js');
  const s = fromJSON({ version: 1, habits: [], done: {}, reviewPrompts: ['¿De qué estoy orgulloso?', ' ', '¿Qué evité?'],
    reviews: { '2026-11-16': { answers: { '¿De qué estoy orgulloso?': 'Correr', focus: 'Dormir', worked: '' }, doneAt: '2026-11-22' } } });
  assert.deepEqual(s.reviewPrompts.year, ['¿De qué estoy orgulloso?', '¿Qué evité?']); // an old single list applies to every period
  assert.deepEqual(s.reviews['2026-11-16'].answers, { '¿De qué estoy orgulloso?': 'Correr', focus: 'Dormir' });
  assert.equal(fromJSON(JSON.parse(JSON.stringify(toJSON(s)))).reviewPrompts.week.length, 2);
  assert.deepEqual(fromJSON({ version: 1, habits: [], done: {}, reviewPrompts: { year: ['¿Qué aprendí este año?'], week: [' '] } }).reviewPrompts, { year: ['¿Qué aprendí este año?'] });
  assert.deepEqual(fromJSON({ version: 1, habits: [], done: {}, reviewPrompts: [] }).reviewPrompts, {}); // empty means built-in
  assert.equal(cleanReview({ answers: { x: '' } }), null);
});

test('daily Latin maxims: complete entries, no duplicates, same all day, change the next day', async () => {
  const { MOTTOS, mottoOf } = await import('../mottos.js');
  assert.ok(MOTTOS.length >= 60);
  assert.ok(MOTTOS.every(m => m.length === 3 && m.every(x => typeof x === 'string' && x.trim())));
  assert.equal(new Set(MOTTOS.map(m => m[0].toLowerCase())).size, MOTTOS.length);
  assert.equal(mottoOf(new Date(2026, 10, 22, 0, 5)), mottoOf(new Date(2026, 10, 22, 23, 55)));
  assert.notEqual(mottoOf(new Date(2026, 10, 22)), mottoOf(new Date(2026, 10, 23)));
});

test('constancy: streak in days ending today or yesterday, rate and days of the year', () => {
  const now = d(1, 10); // 2026-02-10
  const a = { freq: DAILY, done: set('2026-02-07', '2026-02-08', '2026-02-09') };      // run ends yesterday: 3
  const b = { freq: DAILY, done: set('2026-01-01', '2026-01-02', '2026-02-10') };      // run today: 1
  const c = constancy([a, b], now);
  assert.equal(c.streak, 3);
  assert.equal(c.days, 6); // Jan 1, Jan 2, Feb 7, 8, 9, 10
  assert.equal(constancy([{ freq: DAILY, done: set('2026-02-01') }], d(1, 3)).rate, 50); // Feb 1 met, Feb 2 missed, today pending
  assert.equal(constancy([{ freq: DAILY, done: set('2026-02-01') }], now).streak, 0);
  assert.deepEqual(constancy([], now), { streak: 0, rate: null, days: 0 });
  assert.equal(constancy([{ freq: DAILY, done: set('2025-12-31') }], now).days, 0); // other years don't count
});
