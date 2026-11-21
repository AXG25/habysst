const KEY = 'habysst';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const TONES = 6;

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

const fresh = () => ({ version: 1, habits: [], done: {}, goals: [], lastBackup: null });

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
  return { version: 1, habits, done, goals, lastBackup: typeof obj.lastBackup === 'string' ? obj.lastBackup : null };
}

export const toJSON = s => ({
  version: 1,
  habits: s.habits,
  goals: s.goals,
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

// shortcut: localStorage (~5 MB) holds years of check-ins; move to IndexedDB if the journal adds long text.
export function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(toJSON(s)));
  } catch {
    alert('No se pudo guardar. El almacenamiento del navegador está lleno o bloqueado. Exporta un respaldo ahora.');
  }
}
