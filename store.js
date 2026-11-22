const KEY = 'habysst';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Ids go into HTML attributes and object keys, so only plain ids are accepted (the app makes UUIDs).
const isId = x => typeof x === 'string' && /^[\w-]{1,64}$/.test(x) && !['__proto__', 'constructor', 'prototype'].includes(x);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const TONES = 12;
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

export const REVIEW_QS = ['worked', 'didnt', 'change', 'focus', 'vision'];
const REVIEW_KEY = /^(\d{4}-\d{2}-\d{2}|M-\d{4}-(0[1-9]|1[0-2])|Q-\d{4}-[1-4]|Y-\d{4})$/;

export function cleanReview(r) {
  if (!r || typeof r !== 'object') return null;
  const answers = Object.fromEntries(REVIEW_QS.map(q => [q, str(r.answers?.[q], 2000)]));
  const doneAt = date(r.doneAt);
  return doneAt || Object.values(answers).some(Boolean) ? { answers, doneAt } : null;
}

export function cleanGoal(g, habitIds) {
  const title = str(g?.title, 80);
  if (!title || !isId(g.id)) return null;
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

const fresh = () => ({ version: 1, habits: [], done: {}, goals: [], journal: {}, prompts: [...DEFAULT_PROMPTS], reviews: {}, compass: { values: [], vision: '' }, lists: [], metrics: [], values: {}, focus: [], timer: null, demo: null, lastBackup: null });

// Trust boundary: stored data and imported files both pass through here.
export function fromJSON(obj) {
  if (!obj || obj.version !== 1 || !Array.isArray(obj.habits) || typeof obj.done !== 'object' || !obj.done)
    throw new Error('Este archivo no es un respaldo de HabyssT.');
  const habits = obj.habits
    .filter(h => h && isId(h.id) && typeof h.name === 'string')
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
    if (REVIEW_KEY.test(k) && review) reviews[k] = review;
  }
  const metrics = Array.isArray(obj.metrics)
    ? obj.metrics.filter(m => m && isId(m.id) && str(m.name, 40)).map(m => ({ id: m.id, name: str(m.name, 40), unit: str(m.unit, 12) }))
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
  if (timer && ['work', 'break', 'ready'].includes(t.phase) && Number.isInteger(t.pomo) && t.pomo >= 0) Object.assign(timer, { phase: t.phase, pomo: t.pomo });
  const c = obj.compass ?? {};
  const compass = { values: (Array.isArray(c.values) ? c.values : []).map(v => str(v, 40)).filter(Boolean).slice(0, 5), vision: str(c.vision, 1000) };
  const lists = (Array.isArray(obj.lists) ? obj.lists : [])
    .filter(l => l && isId(l.id) && str(l.name, 60))
    .map(l => ({
      id: l.id,
      name: str(l.name, 60),
      items: (Array.isArray(l.items) ? l.items : []).filter(i => i && isId(i.id) && str(i.text, 200))
        .map(i => ({ id: i.id, text: str(i.text, 200), done: i.done === true, doneAt: i.done === true ? date(i.doneAt) : null })),
    }));
  // Which records were generated on first run (see seed.js), so they can be removed exactly.
  const dm = obj.demo, dates = a => (Array.isArray(a) ? a.filter(k => typeof k === 'string' && DATE.test(k)) : []);
  const byId = o => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k]) => isId(k)).map(([k, v]) => [k, dates(v)]));
  const demo = dm && typeof dm === 'object'
    ? { done: byId(dm.done), journal: dates(dm.journal), values: byId(dm.values), focus: (Array.isArray(dm.focus) ? dm.focus : []).filter(iso) }
    : null;
  return { version: 1, habits, done, goals, journal, prompts, reviews, compass, lists, metrics, values, focus, timer, demo, lastBackup: typeof obj.lastBackup === 'string' ? obj.lastBackup : null };
}

export const toJSON = s => ({
  version: 1,
  habits: s.habits,
  goals: s.goals,
  journal: s.journal,
  prompts: s.prompts,
  reviews: s.reviews,
  compass: s.compass,
  lists: s.lists,
  metrics: s.metrics,
  values: s.values,
  focus: s.focus,
  demo: s.demo,
  timer: s.timer,
  done: Object.fromEntries(s.habits.map(h => [h.id, [...(s.done[h.id] ?? [])].sort()])),
  lastBackup: s.lastBackup,
});

export const hasData = s =>
  !!(s.habits.length || s.goals.length || s.lists.length || s.metrics.length || s.focus.length || Object.keys(s.journal).length);

// What went wrong on load, if anything: 'missing' | 'corrupt' | null. Until recovery has been tried,
// the second copy is never overwritten, so a bad main copy can't destroy the good one.
export let loadProblem = null;

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { /* storage blocked: treated as missing */ }
  if (!raw) { loadProblem = 'missing'; return fresh(); }
  try {
    return fromJSON(JSON.parse(raw));
  } catch {
    try { localStorage.setItem(`${KEY}:corrupt:${Date.now()}`, raw); } catch {} // never silently drop unreadable data
    loadProblem = 'corrupt';
    return fresh();
  }
}

// Main copy: localStorage, written synchronously on every change so nothing waits on a promise.
// shortcut: localStorage (~5 MB) fits years of check-ins and ~1 KB/day of journal; move to IndexedDB if entries get long or hold images.
export function save(s) {
  const json = JSON.stringify(toJSON(s));
  try {
    localStorage.setItem(KEY, json);
  } catch {
    alert('No se pudo guardar. El almacenamiento del navegador está lleno o bloqueado. Exporta un respaldo ahora.');
  }
  mirror(s, json);
}

// ---- Second copy and automatic snapshots, in IndexedDB
const STORE = 'kv', KEEP = 15;
let dbp = null;
const db = () => (dbp ??= new Promise((res, rej) => {
  const r = indexedDB.open(KEY, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
function req(mode, fn) {
  return db().then(d => new Promise((res, rej) => {
    const tx = d.transaction(STORE, mode), r = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(r?.result);
    tx.onerror = () => rej(tx.error);
  }));
}
const idbGet = k => req('readonly', s => s.get(k));
const idbPut = (k, v) => req('readwrite', s => s.put(v, k));
const idbKeys = () => req('readonly', s => s.getAllKeys());
const idbDel = k => req('readwrite', s => s.delete(k));
const warn = e => console.warn('HabyssT: copia interna no disponible', e);

let mirrorTimer = null;
function mirror(s, json) {
  if (loadProblem || typeof indexedDB === 'undefined') return;
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(async () => {
    try {
      // An emptied app never replaces a copy that still has data.
      if (hasData(s) || !(await idbGet('current'))) await idbPut('current', json);
      const day = new Date().toLocaleDateString('sv'); // local YYYY-MM-DD
      if (hasData(s) && (await idbGet('snapday')) !== day) { await snapshot(s, 'Copia diaria'); await idbPut('snapday', day); }
    } catch (e) { warn(e); }
  }, 400);
}

// Oldest snapshots beyond KEEP are dropped; keys sort by time.
export const toPrune = (keys, keep = KEEP) => keys.filter(k => k.startsWith('snap:')).sort().slice(0, -keep);

export async function snapshot(s, reason) {
  if (typeof indexedDB === 'undefined' || !hasData(s)) return;
  try {
    const at = new Date().toISOString();
    await idbPut(`snap:${at}`, { at, reason, json: JSON.stringify(toJSON(s)) });
    for (const k of toPrune(await idbKeys())) await idbDel(k);
  } catch (e) { warn(e); }
}

export async function listSnapshots() {
  try {
    const keys = (await idbKeys()).filter(k => k.startsWith('snap:')).sort().reverse();
    return Promise.all(keys.map(async k => { const v = await idbGet(k); return { key: k, at: v.at, reason: v.reason, summary: summarize(JSON.parse(v.json)) }; }));
  } catch (e) { warn(e); return []; }
}

export const deleteSnapshot = key => idbDel(key).catch(warn);
export async function clearSnapshots() {
  try { for (const k of (await idbKeys()).filter(k => k.startsWith('snap:'))) await idbDel(k); } catch (e) { warn(e); }
}

export async function readSnapshot(key) {
  return fromJSON(JSON.parse((await idbGet(key)).json));
}

export const summarize = raw => {
  const s = fromJSON(raw);
  return { habits: s.habits.length, checks: s.habits.reduce((n, h) => n + s.done[h.id].size, 0), entries: Object.keys(s.journal).length, goals: s.goals.length, lists: s.lists.length };
};

// Called once at startup when the main copy was missing or unreadable.
export async function recover() {
  const problem = loadProblem;
  try {
    const json = typeof indexedDB === 'undefined' ? null : await idbGet('current');
    const s = json ? fromJSON(JSON.parse(json)) : null;
    return s && hasData(s) ? s : null;
  } catch (e) {
    warn(e);
    return null;
  } finally {
    if (problem) loadProblem = null; // from now on the second copy follows the app again
  }
}
