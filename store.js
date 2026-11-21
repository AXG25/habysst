const KEY = 'habysst';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const TONES = 6;
export const DEFAULT_PROMPTS = ['¿Qué salió bien hoy?', '¿Qué aprendí?', '¿Qué haré distinto mañana?'];

export function cleanFreq(f) {
  if (f?.type === 'days' && Array.isArray(f.days)) {
    const days = [...new Set(f.days.filter(d => Number.isInteger(d) && d >= 0 && d < 7))].sort();
    if (days.length) return { type: 'days', days };
  }
  if (f?.type === 'weekly' && Number.isInteger(f.times) && f.times >= 1 && f.times <= 6) return { type: 'weekly', times: f.times };
  return { type: 'daily' };
}

const str = (x, max) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const date = x => (typeof x === 'string' && DATE.test(x) ? x : null);

const scale = x => (Number.isInteger(x) && x >= 1 && x <= 5 ? x : null);

// A journal entry; null when it holds nothing, so empty days are not stored.
export function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const answers = {};
  for (const [q, a] of Object.entries(e.answers && typeof e.answers === 'object' ? e.answers : {})) {
    const t = str(a, 5000);
    if (t) answers[str(q, 120)] = t;
  }
  const time = x => (typeof x === 'string' && TIME.test(x) ? x : null);
  const entry = { mood: scale(e.mood), energy: scale(e.energy), text: str(e.text, 20000), answers, sleep: scale(e.sleep), bed: time(e.bed), wake: time(e.wake) };
  if (!entry.bed || !entry.wake) entry.bed = entry.wake = null; // a night needs both ends
  return entry.mood || entry.energy || entry.text || entry.sleep || entry.bed || Object.keys(answers).length ? entry : null;
}

export const REVIEW_QS = ['worked', 'didnt', 'change', 'focus'];

export function cleanReview(r) {
  if (!r || typeof r !== 'object') return null;
  const answers = Object.fromEntries(REVIEW_QS.map(q => [q, str(r.answers?.[q], 2000)]));
  const doneAt = date(r.doneAt);
  return doneAt || Object.values(answers).some(Boolean) ? { answers, doneAt } : null;
}

export function cleanGoal(g, habitIds) {
  const title = str(g?.title, 80);
  if (!title || typeof g.id !== 'string') return null;
  const kind = g.kind === 'steps' ? 'steps' : 'number';
  const start = num(g.start) ?? 0;
  return {
    id: g.id,
    title,
    why: str(g.why, 500),
    kind,
    unit: str(g.unit, 20),
    start,
    target: num(g.target) ?? start,
    log: Array.isArray(g.log) ? g.log.filter(e => date(e?.d) && num(e.v) !== null).map(e => ({ d: e.d, v: e.v })) : [],
    steps: Array.isArray(g.steps)
      ? g.steps.filter(x => str(x?.text, 120)).map(x => ({ text: str(x.text, 120), done: x.done === true }))
      : [],
    plan: { when: str(g.plan?.when, 160), then: str(g.plan?.then, 160) },
    obstacle: { if: str(g.obstacle?.if, 160), then: str(g.obstacle?.then, 160) },
    habits: Array.isArray(g.habits) ? g.habits.filter(id => habitIds.has(id)) : [],
    startDate: date(g.startDate) ?? '2000-01-01',
    deadline: date(g.deadline),
    status: ['active', 'done', 'dropped'].includes(g.status) ? g.status : 'active',
    closedAt: date(g.closedAt),
  };
}

const fresh = () => ({ version: 1, habits: [], done: {}, goals: [], journal: {}, prompts: [...DEFAULT_PROMPTS], reviews: {}, metrics: [], values: {}, focus: [], timer: null, lastBackup: null });

// Trust boundary: stored data and imported files both pass through here.
export function fromJSON(obj) {
  if (!obj || obj.version !== 1 || !Array.isArray(obj.habits) || typeof obj.done !== 'object' || !obj.done)
    throw new Error('Este archivo no es un respaldo de Habysst.');
  const habits = obj.habits
    .filter(h => h && typeof h.id === 'string' && typeof h.name === 'string')
    .map(h => ({
      id: h.id,
      name: h.name.trim().slice(0, 60) || 'Sin nombre',
      tone: Number.isInteger(h.tone) && h.tone >= 0 ? h.tone % TONES : 0,
      createdAt: typeof h.createdAt === 'string' ? h.createdAt : null,
      freq: cleanFreq(h.freq),
    }));
  const done = {};
  for (const h of habits) {
    const arr = obj.done[h.id];
    done[h.id] = new Set(Array.isArray(arr) ? arr.filter(k => typeof k === 'string' && DATE.test(k)) : []);
  }
  const ids = new Set(habits.map(h => h.id));
  const goals = Array.isArray(obj.goals) ? obj.goals.map(g => cleanGoal(g, ids)).filter(Boolean) : [];
  const journal = {};
  for (const [k, e] of Object.entries(obj.journal && typeof obj.journal === 'object' ? obj.journal : {})) {
    const entry = cleanEntry(e);
    if (DATE.test(k) && entry) journal[k] = entry;
  }
  const prompts = Array.isArray(obj.prompts) ? obj.prompts.map(x => str(x, 120)).filter(Boolean).slice(0, 8) : [...DEFAULT_PROMPTS];
  const reviews = {};
  for (const [k, r] of Object.entries(obj.reviews && typeof obj.reviews === 'object' ? obj.reviews : {})) {
    const review = cleanReview(r);
    if (DATE.test(k) && review) reviews[k] = review;
  }
  const metrics = Array.isArray(obj.metrics)
    ? obj.metrics.filter(m => m && typeof m.id === 'string' && str(m.name, 40)).map(m => ({ id: m.id, name: str(m.name, 40), unit: str(m.unit, 12) }))
    : [];
  const values = {};
  for (const m of metrics) {
    const src = obj.values?.[m.id];
    values[m.id] = Object.fromEntries(Object.entries(src && typeof src === 'object' ? src : {}).filter(([k, v]) => DATE.test(k) && num(v) !== null));
  }
  const goalIds = new Set(goals.map(g => g.id));
  const iso = x => (typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? x : null);
  const focus = Array.isArray(obj.focus)
    ? obj.focus.filter(f => iso(f?.start) && num(f.mins) > 0).map(f => ({ start: f.start, mins: Math.min(Math.round(f.mins), 24 * 60), goal: goalIds.has(f.goal) ? f.goal : null }))
    : [];
  const t = obj.timer;
  const timer = t && iso(t.start) ? { start: t.start, target: num(t.target) > 0 ? t.target : null, goal: goalIds.has(t.goal) ? t.goal : null } : null;
  return { version: 1, habits, done, goals, journal, prompts, reviews, metrics, values, focus, timer, lastBackup: typeof obj.lastBackup === 'string' ? obj.lastBackup : null };
}

export const toJSON = s => ({
  version: 1,
  habits: s.habits,
  goals: s.goals,
  journal: s.journal,
  prompts: s.prompts,
  reviews: s.reviews,
  metrics: s.metrics,
  values: s.values,
  focus: s.focus,
  timer: s.timer,
  done: Object.fromEntries(s.habits.map(h => [h.id, [...(s.done[h.id] ?? [])].sort()])),
  lastBackup: s.lastBackup,
});

export function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return fresh();
  try {
    return fromJSON(JSON.parse(raw));
  } catch {
    localStorage.setItem(`${KEY}:corrupt:${Date.now()}`, raw); // never silently drop unreadable data
    return fresh();
  }
}

// shortcut: localStorage (~5 MB) fits years of check-ins and ~1 KB/day of journal; move to IndexedDB if entries get long or hold images.
export function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(toJSON(s)));
  } catch {
    alert('No se pudo guardar. El almacenamiento del navegador está lleno o bloqueado. Exporta un respaldo ahora.');
  }
}
