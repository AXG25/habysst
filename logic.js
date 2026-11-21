export const ymd = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const parseYmd = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

// Consecutive done days inside `days` (Date | null for padding) → [[startIdx, endIdx], ...]
export function runs(days, done) {
  const out = [];
  let s = -1;
  days.forEach((d, i) => {
    const on = d && done.has(ymd(d));
    if (on && s < 0) s = i;
    if (!on && s >= 0) { out.push([s, i - 1]); s = -1; }
  });
  if (s >= 0) out.push([s, days.length - 1]);
  return out;
}

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
export const weekdayIdx = d => (d.getDay() + 6) % 7; // 0 = Monday

// A habit's history as the periods its frequency asks for: days, scheduled weekdays or weeks.
// The current period is dropped while unfinished, so today never breaks a streak.
export function periods(freq = { type: 'daily' }, done, now) {
  const keys = [...done].sort();
  if (!keys.length) return [];
  const today = startOfDay(now), out = [];
  if (freq.type === 'weekly') {
    for (let w = mondayOf(parseYmd(keys[0])); w <= today; w = addDays(w, 7)) {
      let n = 0;
      for (let i = 0; i < 7; i++) if (done.has(ymd(addDays(w, i)))) n++;
      out.push({ start: w, end: addDays(w, 6), ok: n >= freq.times, current: addDays(w, 7) > today });
    }
  } else {
    for (let d = parseYmd(keys[0]); d <= today; d = addDays(d, 1)) {
      if (freq.type === 'days' && !freq.days.includes(weekdayIdx(d))) continue;
      out.push({ start: d, end: d, ok: done.has(ymd(d)), current: +d === +today });
    }
  }
  if (out.at(-1)?.current && !out.at(-1).ok) out.pop();
  return out;
}

const okRuns = ps => {
  const out = [];
  let r = null;
  for (const p of ps) {
    if (p.ok) r ? r.push(p) : out.push((r = [p]));
    else r = null;
  }
  return out;
};

export function streaks(ps) {
  const all = okRuns(ps);
  const last = all.at(-1);
  return { cur: last && last.at(-1) === ps.at(-1) ? last.length : 0, best: Math.max(0, ...all.map(r => r.length)) };
}

// Longest streak among periods that start inside [from, to] (YYYY-MM-DD keys).
export const bestIn = (ps, from, to) => streaks(ps.filter(p => ymd(p.start) >= from && ymd(p.start) <= to)).best;

// Days to draw as streak lines: every done day, plus the gaps a streak spans (rest days, met weeks).
export function covered(ps, done, now) {
  const set = new Set(done), today = startOfDay(now);
  for (const r of okRuns(ps)) {
    const end = r.at(-1).end < today ? r.at(-1).end : today;
    for (let d = r[0].start; d <= end; d = addDays(d, 1)) set.add(ymd(d));
  }
  return set;
}

// Weeks start on Monday; cells outside the month are null.
export function weeksOfMonth(y, m) {
  const off = (new Date(y, m, 1).getDay() + 6) % 7;
  const n = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(off).fill(null), ...Array.from({ length: n }, (_, i) => new Date(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const monthRow = (y, m) => {
  const n = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: 31 }, (_, i) => (i < n ? new Date(y, m, i + 1) : null));
};
