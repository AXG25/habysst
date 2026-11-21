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

export const longestRun = (days, done) => Math.max(0, ...runs(days, done).map(([s, e]) => e - s + 1));

// Current streak counts today if done, otherwise keeps yesterday's streak alive until the day ends.
export function streaks(done, today) {
  let cur = 0;
  let d = done.has(ymd(today)) ? today : addDays(today, -1);
  while (done.has(ymd(d))) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0, prev = null;
  for (const k of [...done].sort()) {
    run = prev && ymd(addDays(prev, 1)) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = parseYmd(k);
  }
  return { cur, best };
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
