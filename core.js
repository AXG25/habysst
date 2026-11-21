import { ymd, addDays, parseYmd, runs, periods, streaks, bestIn, covered, weekdayIdx } from './logic.js';
import { load } from './store.js';
import { WD, esc, plural } from './ui.js';

export let state = load();

export let tab = 'hoy';

export const setOf = h => (state.done[h.id] ??= new Set());

// Per-render cache of each habit's periods, streaks and drawn days.
export let cache = new Map();

export function info(h) {
  if (!cache.has(h.id)) {
    const now = new Date(), done = setOf(h), ps = periods(h.freq, done, now);
    cache.set(h.id, { ps, cov: covered(ps, done, now), ...streaks(ps) });
  }
  return cache.get(h.id);
}

export const unit = (h, n) => (h.freq.type === 'weekly' ? plural(n, 'semana', 'semanas') : plural(n, 'día', 'días'));

export const freqLabel = f =>
  f.type === 'days' ? f.days.map(i => WD[i]).join(' ') : f.type === 'weekly' ? `${f.times} ${f.times === 1 ? 'vez' : 'veces'} por semana` : 'Diario';

export const dueOn = (h, d) => h.freq.type !== 'days' || h.freq.days.includes(weekdayIdx(d));

export function weekCount(h, d) {
  const mon = addDays(d, -weekdayIdx(d));
  return Array.from({ length: 7 }, (_, i) => ymd(addDays(mon, i))).filter(k => setOf(h).has(k)).length;
}
// Share of finished periods met in [from, to]; null when nothing to measure yet.

export function rate(h, from, to) {
  const ps = info(h).ps.filter(p => ymd(p.start) >= from && ymd(p.start) <= to);
  return ps.length ? Math.round((100 * ps.filter(p => p.ok).length) / ps.length) : null;
}

export function legendItem(h, n, from, to, scope) {
  const r = rate(h, from, to);
  return `<li><i class="sw t${h.tone}"></i><span>${esc(h.name)}</span><b>${plural(n, 'día', 'días')}</b>
    <small>${r === null ? '' : `Cumplimiento ${r}%. `}Mejor racha ${scope}: ${unit(h, bestIn(info(h).ps, from, to))}</small></li>`;
}


// One bar per streak run. `cl`/`cr` mark a run that continues past the row edge.
export function bars(days, h, row, colOffset = 0) {
  const set = info(h).cov;
  return runs(days, set).map(([s, e]) => {
    const cl = (s === 0 || !days[s - 1]) && set.has(ymd(addDays(days[s], -1)));
    const cr = (e === days.length - 1 || !days[e + 1]) && set.has(ymd(addDays(days[e], 1)));
    return `<i class="bar t${h.tone}${cl ? ' cl' : ''}${cr ? ' cr' : ''}" style="grid-row:${row};grid-column:${s + 1 + colOffset}/${e + 2 + colOffset}"></i>`;
  }).join('');
}


export const MAX_GOALS = 3;

export const activeGoals = () => state.goals.filter(g => g.status === 'active');

export const entryOf = k => state.journal[k];


export const daysIn = (from, to) => { const out = []; for (let d = parseYmd(from); ymd(d) <= to; d = addDays(d, 1)) out.push(ymd(d)); return out; };

// ---- Custom metrics
export const valOf = (m, key) => state.values[m.id]?.[key];

export const focusOn = key => state.focus.filter(f => ymd(new Date(f.start)) === key).reduce((n, f) => n + f.mins, 0);

export const focusIn = (from, to, goal) => state.focus
  .filter(f => { const k = ymd(new Date(f.start)); return k >= from && k <= to && (goal === undefined || f.goal === goal); })
  .reduce((n, f) => n + f.mins, 0);


export const lastDays = (n, end = new Date()) => Array.from({ length: n }, (_, i) => ymd(addDays(end, i - n + 1)));

export const setState = s => (state = s);
export const setTab = t => (tab = t);
export const resetCache = () => (cache = new Map());
