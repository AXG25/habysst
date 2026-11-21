// First run: a ready-made starting point (habits, goals, metrics, lists) plus about 90 days of
// past records so streaks, calendars and charts have something to show. Every generated record
// is listed in `demo`, so Ajustes can remove exactly those and nothing the person logged.
import { ymd, addDays } from './logic.js';
import { fromJSON } from './store.js';

const id = () => crypto.randomUUID();
const DAYS_BACK = 90;

export function starter(now) {
  // Deterministic noise: the same history every time, no Math.random in tests.
  let seed = 20261121;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const h = (name, tone, freq = { type: 'daily' }) => ({ id: id(), name, tone, freq, createdAt: now.toISOString() });

  const sleep = h('Dormir antes de las 23:00', 0);
  const move = h('Moverme 30 minutos', 5, { type: 'weekly', times: 3 });
  const read = h('Leer 20 minutos', 2);
  const meditate = h('Meditar 10 minutos', 1);
  const water = h('Beber 2 litros de agua', 7);
  const screens = h('Sin pantallas 1 hora antes de dormir', 3);
  const habits = [sleep, move, read, meditate, water, screens];

  const start = ymd(today);
  const goals = [
    {
      id: id(), title: 'Leer 12 libros en un año', kind: 'number', start: 0, target: 12, unit: 'libros', log: [], steps: [],
      why: 'Leer un poco cada día suma más que leer mucho de vez en cuando.',
      plan: { when: 'me meto en la cama', then: 'leo 20 minutos antes de apagar la luz' },
      obstacle: { if: 'estoy muy cansado', then: 'leo solo dos páginas, pero leo' },
      habits: [read.id], startDate: start, deadline: ymd(addDays(today, 365)), status: 'active',
    },
    {
      id: id(), title: 'Correr 5 km sin parar', kind: 'steps', start: 0, target: 0, unit: '', log: [],
      steps: ['Caminar 30 minutos tres veces por semana', 'Alternar 1 minuto corriendo y 2 caminando', 'Correr 2 km sin parar', 'Correr 3,5 km sin parar', 'Correr 5 km sin parar']
        .map(text => ({ text, done: false })),
      why: 'Más energía, mejor sueño y mejor ánimo.',
      plan: { when: 'es lunes, miércoles o viernes a las 7:00', then: 'me pongo las zapatillas y salgo antes de mirar el móvil' },
      obstacle: { if: 'llueve', then: 'hago 20 minutos de ejercicio en casa' },
      habits: [move.id], startDate: start, deadline: ymd(addDays(today, 90)), status: 'active',
    },
  ];

  const weight = { id: id(), name: 'Peso', unit: 'kg' };
  const screenTime = { id: id(), name: 'Tiempo de pantalla', unit: 'h' };
  const lists = [
    { id: id(), name: 'Antes de morir', items: ['Ver una aurora boreal', 'Aprender un idioma nuevo', 'Correr una carrera de 10 km', 'Viajar solo a otro país',
      'Escribir una carta a alguien que me cambió la vida', 'Plantar un árbol', 'Aprender a cocinar 10 platos de memoria'] },
    { id: id(), name: 'Compra saludable', items: ['Verduras de hoja verde', 'Fruta de temporada', 'Huevos', 'Avena', 'Legumbres', 'Frutos secos', 'Pescado azul', 'Yogur natural'] },
  ].map(l => ({ ...l, items: l.items.map(text => ({ id: id(), text, done: false, doneAt: null })) }));

  // ---- past records: adherence that improves over the weeks, with streaks and slips
  const odds = new Map([[sleep, 0.6], [read, 0.7], [meditate, 0.5], [water, 0.75], [screens, 0.45]]);
  const done = Object.fromEntries(habits.map(x => [x.id, []]));
  const journal = {}, values = { [weight.id]: {}, [screenTime.id]: {} }, focus = [];
  const was = new Map();
  let kg = 82.4, hours = 5.2;
  const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

  for (let k = DAYS_BACK; k >= 1; k--) {
    const d = addDays(today, -k), key = ymd(d), lift = (DAYS_BACK - k) / DAYS_BACK * 0.2;
    for (const [x, p] of odds) {
      const on = rnd() < Math.min(0.95, p + lift + (was.get(x) ? 0.12 : -0.08)); // momentum makes streaks
      was.set(x, on);
      if (on) done[x.id].push(key);
    }
    const moved = [1, 3, 5].includes(d.getDay()) ? rnd() < 0.7 + lift : rnd() < 0.12;
    if (moved) done[move.id].push(key);

    // Bedtime follows the night before: going to bed early shows up as more sleep today.
    const early = done[sleep.id].includes(ymd(addDays(d, -1)));
    const bed = early ? 22 * 60 + 30 + rnd() * 30 : 23 * 60 + 25 + rnd() * 80;
    const mins = (7 * 60 + rnd() * 40) + 24 * 60 - bed;
    if (rnd() < 0.85) {
      const clamp = v => Math.max(1, Math.min(5, Math.round(v)));
      journal[key] = {
        mood: clamp(2.6 + (moved ? 0.9 : 0) + (done[meditate.id].includes(key) ? 0.4 : 0) + (rnd() - 0.5) * 1.4),
        energy: clamp(2.3 + (mins >= 420 ? 1.1 : 0) + (rnd() - 0.5) * 1.4),
        sleep: clamp(2.5 + (mins >= 420 ? 1.2 : 0) + (rnd() - 0.5)),
        bed: hhmm(bed), wake: hhmm(bed + mins), text: '', answers: {},
      };
    }
    kg += -0.025 + (rnd() - 0.5) * 0.3;
    if (rnd() < 0.6) values[weight.id][key] = Math.round(kg * 10) / 10;
    hours += -0.017 + (rnd() - 0.5) * 0.4;
    if (rnd() < 0.7) values[screenTime.id][key] = Math.round(Math.max(1.5, hours - (done[screens.id].includes(key) ? 0.6 : 0)) * 10) / 10;
    if (rnd() < 0.35) focus.push({ start: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9 + Math.floor(rnd() * 8)).toISOString(), mins: rnd() < 0.7 ? 25 : 50, goal: null });
  }

  const demo = {
    done: Object.fromEntries(Object.entries(done).map(([k, v]) => [k, [...v]])),
    journal: Object.keys(journal),
    values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Object.keys(v)])),
    focus: focus.map(f => f.start),
  };
  return fromJSON({ version: 1, habits, done, goals, journal, lists, metrics: [weight, screenTime], values, focus, demo, lastBackup: null });
}

// Removes only the generated history. Starter habits, goals, metrics and lists stay; so does any
// day where the person wrote in the journal.
export function removeFiller(s) {
  const d = s.demo;
  if (!d) return;
  for (const [hid, dates] of Object.entries(d.done)) dates.forEach(k => s.done[hid]?.delete(k));
  for (const k of d.journal) {
    const e = s.journal[k];
    if (e && !e.text && !Object.keys(e.answers).length) delete s.journal[k];
  }
  for (const [mid, dates] of Object.entries(d.values)) dates.forEach(k => delete s.values[mid]?.[k]);
  const gen = new Set(d.focus);
  s.focus = s.focus.filter(f => !gen.has(f.start));
  s.demo = null;
}
