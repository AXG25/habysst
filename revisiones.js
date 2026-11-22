import { ymd, addDays, parseYmd, weekStats, keyFor, periodOf, reviewPeriod, mean } from './logic.js';
import { save, snapshot, cleanReview, REVIEW_QS } from './store.js';
import { render } from './app.js';
import { $sheet, LEVELS, MONTHS, cap, dm, dur, esc, fmt, fmt1, plural, stamp } from './ui.js';
import { daysIn, focusIn, rate, setOf, state } from './core.js';
import { sleepOf } from './progreso.js';
import { autosave } from './registro.js';
import { compassView, goalSummary, u } from './metas.js';

// ---- Reviews: week, month, quarter, year
export const PERIOD = {
  week: { this: 'esta semana', next: 'la próxima semana', prev: 'Semana anterior', name: 'semana' },
  month: { this: 'este mes', next: 'el próximo mes', prev: 'Mes anterior', name: 'mes' },
  quarter: { this: 'este trimestre', next: 'el próximo trimestre', prev: 'Trimestre anterior', name: 'trimestre' },
  year: { this: 'este año', next: 'el próximo año', prev: 'Año anterior', name: 'año' },
};

export const qsFor = kind => (kind === 'week' ? REVIEW_QS.filter(q => q !== 'vision') : REVIEW_QS);

export const qLabel = (q, kind) => ({
  worked: `¿Qué funcionó ${PERIOD[kind].this}?`,
  didnt: '¿Qué no funcionó y por qué?',
  change: `¿Qué vas a cambiar ${PERIOD[kind].next}?`,
  focus: `Tu prioridad principal para ${PERIOD[kind].next}`,
  vision: '¿Lo que hiciste te acerca a tu visión y a tus valores?',
})[q];

export function periodLabel(p) {
  const d = parseYmd(p.from);
  if (p.kind === 'week') return weekLabel(d);
  if (p.kind === 'month') return `${cap(MONTHS[d.getMonth()])} de ${d.getFullYear()}`;
  if (p.kind === 'quarter') return `Trimestre ${Math.floor(d.getMonth() / 3) + 1} de ${d.getFullYear()}`;
  return `Año ${d.getFullYear()}`;
}

export function weekLabel(mon) {
  const sun = addDays(mon, 6);
  return mon.getMonth() === sun.getMonth() ? `Semana del ${mon.getDate()} al ${dm(sun)}` : `Semana del ${dm(mon)} al ${dm(sun)}`;
}


export const avgOf = (kind, from, to) => mean(daysIn(from, to).map(k => state.journal[k]?.[kind]).filter(Boolean));


export function reviewData(p) {
  const now = new Date(), prev = periodOf(p.prev), P = PERIOD[p.kind];
  const habits = state.habits.map(h => {
    if (p.kind === 'week') {
      const w = weekStats(h.freq, setOf(h), parseYmd(p.from), now), q = weekStats(h.freq, setOf(h), parseYmd(prev.from), now);
      return `<li><i class="sw t${h.tone}"></i><span>${esc(h.name)}</span><b>${w.done}/${w.due}</b><small>${P.prev}: ${q.done}/${q.due}</small></li>`;
    }
    const r = rate(h, p.from, p.to), q = rate(h, prev.from, prev.to);
    return r === null ? '' : `<li><i class="sw t${h.tone}"></i><span>${esc(h.name)}</span><b>${r}%</b><small>${P.prev}: ${q === null ? 'sin datos' : `${q}%`}</small></li>`;
  }).join('');
  const feel = ['mood', 'energy'].map(k => {
    const a = avgOf(k, p.from, p.to), b = avgOf(k, prev.from, prev.to);
    if (a === null) return '';
    return `<li><span>${k === 'mood' ? 'Ánimo medio' : 'Energía media'}</span><b>${fmt1(a)} de 5</b><small>${LEVELS[Math.round(a) - 1]}${b === null ? '' : ` (${P.prev.toLowerCase()}: ${fmt1(b)})`}</small></li>`;
  }).join('');
  const sl = mean(daysIn(p.from, p.to).map(sleepOf).filter(v => v !== null));
  const goals = state.goals.filter(g => g.status === 'active' || (g.closedAt && g.closedAt >= p.from && g.closedAt <= p.to)).map(g => {
    const s = goalSummary(g);
    let moved = g.status === 'done' ? 'Lograda en este periodo.' : g.status === 'dropped' ? 'Abandonada en este periodo.' : '';
    if (!moved && g.kind === 'number') {
      const before = [...g.log].reverse().find(e => e.d < p.from)?.v ?? g.start;
      const after = [...g.log].reverse().find(e => e.d <= p.to)?.v ?? g.start;
      moved = before === after ? `Sin cambios ${P.this}.` : `${cap(P.this)}: de ${fmt(before)} a ${fmt(after)}${u(g)}.`;
    }
    return `<li><span>${esc(g.title)}</span><b>${s.pctLabel}</b><small>${[moved, g.status === 'active' ? s.pace : ''].filter(Boolean).join(' ')}</small></li>`;
  }).join('');
  const entries = daysIn(p.from, p.to).filter(k => state.journal[k]).length;
  const fw = focusIn(p.from, p.to), fp = focusIn(prev.from, prev.to);
  const c = state.compass;
  return `${p.kind !== 'week' && (c.values.length || c.vision) ? `<h3>Tu brújula</h3>${compassView()}` : ''}
    ${habits ? `<h3>Hábitos</h3><ul class="legend data">${habits}</ul>` : ''}
    ${feel ? `<h3>Cómo estuviste</h3><ul class="legend data">${feel}${sl ? `<li><span>Sueño medio</span><b>${dur(Math.round(sl))}</b></li>` : ''}</ul>` : ''}
    ${goals ? `<h3>Metas</h3><ul class="legend data">${goals}</ul>` : ''}
    ${fw || fp ? `<h3>Enfoque</h3><ul class="legend data"><li><span>Tiempo de enfoque</span><b>${fw ? dur(fw) : '0 min'}</b><small>${P.prev}: ${fp ? dur(fp) : '0 min'}</small></li></ul>` : ''}
    <p class="muted">${plural(entries, 'día', 'días')} con entrada en el diario.</p>`;
}


export function openReview(key) {
  const p = periodOf(key);
  const r = state.reviews[key] ?? { answers: {}, doneAt: null };
  // Your own questions (or the built-in ones), plus any already answered here, and always the priority last.
  const base = state.reviewPrompts ?? qsFor(p.kind).filter(q => q !== 'focus');
  const qs = [...new Set([...base, ...Object.keys(r.answers).filter(q => q !== 'focus')]), 'focus'];
  const label = q => (REVIEW_QS.includes(q) ? qLabel(q, p.kind) : esc(q));
  $sheet.redraw = null;
  $sheet.innerHTML = `<form method="dialog" id="review" class="entry">
    <h2 tabindex="-1" autofocus>${periodLabel(p)}</h2>
    ${reviewData(p)}
    <h3>Tu revisión</h3>
    ${qs.map((q, i) => `<label class="field">${label(q)}<textarea name="q${i}" rows="${q === 'focus' ? 1 : 3}" maxlength="2000">${esc(r.answers[q] ?? '')}</textarea></label>`).join('')}
    <p class="muted saved" aria-live="polite">Se guarda mientras escribes.</p>
    <div class="row">${r.doneAt ? `<button class="btn">Listo</button>` : `<button type="button" class="btn" data-act="review-done" data-d="${key}">Terminar revisión</button><button class="btn ghost">Seguir luego</button>`}</div>
    ${state.reviews[key] ? `<button type="button" class="link danger" data-act="review-delete" data-d="${key}">Borrar esta revisión</button>` : ''}
  </form>`;
  const write = f => {
    const next = cleanReview({ answers: Object.fromEntries(qs.map((q, i) => [q, f.get(`q${i}`)])), doneAt: state.reviews[key]?.doneAt });
    if (next) state.reviews[key] = next;
    else delete state.reviews[key];
  };
  $sheet.flush = autosave($sheet.querySelector('#review'), write);
  if (!$sheet.open) $sheet.showModal();
}


export function finishReview(key) {
  $sheet.flush();
  state.reviews[key] = { ...(state.reviews[key] ?? { answers: {} }), doneAt: ymd(new Date()) };
  save(state);
  $sheet.close();
  stamp('Revisada');
}


export const pendingName = p => { const d = parseYmd(p.from); return { week: 'de la semana', month: `de ${MONTHS[d.getMonth()]}`, quarter: 'del trimestre', year: `del año ${d.getFullYear()}` }[p.kind]; };
// Days after a period ends during which Hoy reminds you to review it.

export const GRACE = { week: 2, month: 3, quarter: 7, year: 10 };

export function reviewNotice(now) {
  const today = ymd(now), active = state.habits.length || state.goals.length;
  const pending = active && ['year', 'quarter', 'month', 'week'].map(k => reviewPeriod(k, now))
    .find(p => !state.reviews[p.key]?.doneAt && daysIn(p.to, today).length - 1 <= GRACE[p.kind]);
  const focus = ['week', 'month', 'quarter', 'year'].map(k => {
    const f = state.reviews[periodOf(keyFor(k, now)).prev]?.answers.focus;
    return f ? `<li><span class="hmeta">${cap(PERIOD[k].this)}</span><strong>${esc(f)}</strong></li>` : '';
  }).join('');
  return (focus ? `<section class="focus panel"><ul>${focus}</ul></section>` : '') +
    (pending ? `<button class="note" data-act="review" data-d="${pending.key}">Tienes pendiente la revisión ${pendingName(pending)}. Hacerla ahora</button>` : '');
}


export function reviewList() {
  const ps = Object.keys(state.reviews).map(periodOf).sort((a, b) => b.to.localeCompare(a.to) || a.kind.localeCompare(b.kind));
  return ps.length ? `<details class="closed"><summary>Revisiones anteriores (${ps.length})</summary><ul class="manage">${ps.map(p => `<li class="panel">
    <span>${periodLabel(p)}<small>${state.reviews[p.key].doneAt ? 'Terminada' : 'Sin terminar'}</small></span>
    <button class="link" data-act="review" data-d="${p.key}">Abrir</button></li>`).join('')}</ul></details>` : '';
}


export const actions = {
  'review-delete': async el => {
    const k = el.dataset.d, label = periodLabel(periodOf(k));
    if (!confirm(`¿Borrar la revisión de ${label.toLowerCase()}? Antes se guarda una copia automática.`)) return;
    await snapshot(state, `Antes de borrar la revisión de ${label.toLowerCase()}`);
    $sheet.addEventListener('close', () => { delete state.reviews[k]; save(state); render(); }, { once: true });
    $sheet.close();
  },
  'review': (el, e) => { const { h, d } = el.dataset;
    return openReview(d);
  },
  'review-done': (el, e) => { const { h, d } = el.dataset;
    return finishReview(d);
  },
};
