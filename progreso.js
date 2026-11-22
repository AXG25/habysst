import { ymd, addDays, parseYmd, weeksOfMonth, monthRow, sleepMins, mean, compareDays } from './logic.js';
import { MONTHS, WD, cap, dur, esc, fmt1, header, longDate, plural, short } from './ui.js';
import { bars, dueOn, entryOf, focusIn, focusOn, info, lastDays, legendItem, rate, setOf, setTab, state, valOf } from './core.js';
import { go } from './motion.js';
import { emptyState } from './hoy.js';
import { render } from './app.js';

export let cursor = new Date();

export let yearFilter = 'all';

export let calMode = 'mes';

export let anaDays = 30;


export const calSwitch = () => `<div class="seg" role="group" aria-label="Vista">
  <button data-act="cal" data-m="mes" aria-pressed="${calMode === 'mes'}">Mes</button>
  <button data-act="cal" data-m="ano" aria-pressed="${calMode === 'ano'}">Año</button>
  <button data-act="cal" data-m="analisis" aria-pressed="${calMode === 'analisis'}">Análisis</button></div>`;


export function viewMes() {
  const y = cursor.getFullYear(), m = cursor.getMonth(), t = ymd(new Date()), hs = state.habits;
  const head = header(cap(MONTHS[m]), String(y), true) + calSwitch();
  if (!hs.length) return head + emptyState;
  const weeks = weeksOfMonth(y, m);
  const monthDays = weeks.flat().filter(Boolean);

  return head + `<div class="cal panel">
    <div class="wd">${WD.map(d => `<span>${d}</span>`).join('')}</div>
    ${weeks.map((w, r) => `<div class="wk" style="--r:${r}">
      ${w.map((d, i) => {
        if (!d) return `<span class="day pad" style="grid-column:${i + 1}"></span>`;
        const k = ymd(d);
        const did = hs.filter(h => setOf(h).has(k));
        return `<button class="day${k === t ? ' today' : ''}${state.journal[k] ? ' has-entry' : ''}" style="grid-column:${i + 1}" data-act="day" data-d="${k}"${k > t ? ' disabled' : ''} aria-label="${d.getDate()} de ${MONTHS[m]}: ${did.length} de ${hs.length} hábitos"><span>${d.getDate()}</span>
          <span class="dots" aria-hidden="true">${hs.map(h => (did.includes(h) ? `<i class="sw dot t${h.tone}"></i>` : '<i></i>')).join('')}</span></button>`;
      }).join('')}
    </div>`).join('')}
  </div>
  <ul class="legend">${hs.map(h => legendItem(h, monthDays.filter(d => setOf(h).has(ymd(d))).length, ymd(monthDays[0]), ymd(monthDays.at(-1)), 'del mes')).join('')}</ul>`;
}


export function viewAno() {
  const y = cursor.getFullYear(), t = ymd(new Date());
  const head = header(String(y), 'Rachas del año', true) + calSwitch();
  if (!state.habits.length) return head + emptyState;
  if (yearFilter !== 'all' && !state.habits.some(h => h.id === yearFilter)) yearFilter = 'all';
  const hs = yearFilter === 'all' ? state.habits : state.habits.filter(h => h.id === yearFilter);
  const lane = hs.length === 1 ? 12 : Math.max(4, Math.floor(26 / hs.length));
  const yearDays = Array.from({ length: 12 }, (_, m) => monthRow(y, m)).flat().filter(Boolean);

  return head + `<div class="chips" role="group" aria-label="Filtrar hábitos">
    <button class="chip" data-act="yf" data-h="all" aria-pressed="${yearFilter === 'all'}">Todos</button>
    ${state.habits.map(h => `<button class="chip" data-act="yf" data-h="${h.id}" aria-pressed="${yearFilter === h.id}"><i class="sw t${h.tone}"></i>${esc(h.name)}</button>`).join('')}
  </div>
  <div class="year panel">
    <div class="yr head"><span></span>${[1, 8, 15, 22, 29].map(n => `<small style="grid-column:${n + 1}">${n}</small>`).join('')}</div>
    ${MONTHS.map((name, m) => {
      const days = monthRow(y, m);
      const voids = days.map((d, i) => (d ? '' : `<i class="void" style="grid-column:${i + 2}"></i>`)).join('');
      const future = days.findIndex(d => d && ymd(d) > t);
      const fut = future >= 0 ? `<i class="future" style="grid-column:${future + 2}/-1"></i>` : '';
      return `<button class="yr" data-act="month" data-m="${m}" style="--n:${hs.length};--lane:${lane}px;--r:${m}" aria-label="Ver ${name}">
        <span class="ml">${name.slice(0, 3)}</span><i class="ticks"></i>${voids}${fut}
        ${hs.map((h, j) => bars(days, h, j + 1, 1)).join('')}</button>`;
    }).join('')}
  </div>
  <ul class="legend">${hs.map(h => legendItem(h, yearDays.filter(d => setOf(h).has(ymd(d))).length, `${y}-01-01`, `${y}-12-31`, 'del año')).join('')}</ul>`;
}


// Single-series line chart: ink line, recessive grid, tap or drag to read any day.
export const CW = 320, CH = 128, PL = 30, PR = 8, PT = 10, PB = 20;

export const charts = new Map();

export function lineChart(id, title, pts, { min, max, show }) {
  const n = pts.length;
  const x = i => PL + (n === 1 ? 0 : (i * (CW - PL - PR)) / (n - 1));
  const y = v => PT + (1 - (v - min) / (max - min)) * (CH - PT - PB);
  // Daily values are noisy: dots show each day, the ink line is the 7-day mean (needs 3+ values in the window).
  const avg = pts.map((_, i) => { const w = pts.slice(Math.max(0, i - 6), i + 1).map(p => p.v).filter(v => v !== null); return w.length >= 3 ? mean(w) : null; });
  let d = '', pen = false;
  avg.forEach((v, i) => {
    if (v === null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const lone = pts.map((p, i) => (p.v !== null ? `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${n > 40 ? 1.6 : 2.2}" class="pt"/>` : '')).join('');
  const ticks = [min, (min + max) / 2, max].map(v => `<line x1="${PL}" x2="${CW - PR}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${PL - 6}" y="${y(v) + 3.5}" class="ax" text-anchor="end">${show(v)}</text>`).join('');
  charts.set(id, { pts, avg, x, y, show });
  const filled = pts.filter(p => p.v !== null);
  return `<figure class="chart" data-chart="${id}">
    <figcaption>${title}<small>Puntos: cada día. Línea: media de 7 días.</small></figcaption>
    <svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="${title}. ${filled.length} días con dato, de ${short(pts[0].k)} a ${short(pts.at(-1).k)}.">
      ${ticks}
      <text x="${PL}" y="${CH - 4}" class="ax">${short(pts[0].k)}</text><text x="${CW - PR}" y="${CH - 4}" class="ax" text-anchor="end">${short(pts.at(-1).k)}</text>
      ${lone}<path d="${d}" class="ln" pathLength="1"/>
      <line class="cross" y1="${PT}" y2="${CH - PB}" x1="-10" x2="-10"/><circle class="cdot" r="4.5" cx="-10" cy="-10"/>
    </svg>
    <p class="tip" aria-live="polite">Toca o desliza sobre la gráfica para ver cada día.</p>
    <details><summary>Ver datos</summary><table><tbody>${filled.slice().reverse().map(p => `<tr><td>${short(p.k)}</td><td>${show(p.v)}</td></tr>`).join('')}</tbody></table></details>
  </figure>`;
}


export function scrub(e) {
  const svg = e.target.closest?.('.chart svg');
  if (!svg) return;
  const fig = svg.closest('.chart'), c = charts.get(fig.dataset.chart);
  if (!c) return;
  const r = svg.getBoundingClientRect();
  const vx = ((e.clientX - r.left) / r.width) * CW;
  const n = c.pts.length;
  const i = Math.max(0, Math.min(n - 1, Math.round(((vx - PL) / (CW - PL - PR)) * (n - 1))));
  const p = c.pts[i], cx = c.x(i);
  const cross = svg.querySelector('.cross'), dot = svg.querySelector('.cdot');
  cross.setAttribute('x1', cx);
  cross.setAttribute('x2', cx);
  dot.setAttribute('cx', p.v === null ? -10 : cx);
  dot.setAttribute('cy', p.v === null ? -10 : c.y(p.v));
  svg.classList.add('on');
  fig.querySelector('.tip').textContent = `${longDate(p.k)}: ${p.v === null ? 'sin dato' : c.show(p.v)}${c.avg[i] === null ? '' : `. Media de 7 días: ${c.show(c.avg[i])}`}`;
}

document.addEventListener('pointerdown', scrub);

document.addEventListener('pointermove', scrub);


export const tile = (label, value, before) => (value === null ? '' : `<li class="tile panel"><span class="hmeta">${label}</span><b>${value}</b>${before ? `<small>${before}</small>` : ''}</li>`);

export const meter = (name, pct, figure, note, sw = '') =>
  `<li class="meter">${sw}<span>${name}</span><b>${figure}</b><i class="track"><i style="--p:${Math.max(0, Math.min(1, pct))}"></i></i>${note ? `<small>${note}</small>` : ''}</li>`;


export function habitRate(keys) {
  let ok = 0, all = 0;
  for (const h of state.habits) {
    const ps = info(h).ps.filter(p => ymd(p.start) >= keys[0] && ymd(p.start) <= keys.at(-1));
    all += ps.length;
    ok += ps.filter(p => p.ok).length;
  }
  return all ? Math.round((100 * ok) / all) : null;
}

export const avgK = (keys, f) => mean(keys.map(f).filter(v => v !== null && v !== undefined));

export const sleepOf = k => sleepMins(entryOf(k)?.bed, entryOf(k)?.wake);


export function insights(keys) {
  const measures = [
    { f: k => entryOf(k)?.mood ?? null, label: 'tu ánimo medio es' },
    { f: k => entryOf(k)?.energy ?? null, label: 'tu energía media es' },
  ];
  const conds = state.habits.map(h => {
    const first = [...setOf(h)].sort()[0];
    return { yes: `haces «${esc(h.name)}»`, no: 'no lo haces', f: k => (!first || k < first || !dueOn(h, parseYmd(k)) ? null : setOf(h).has(k)) };
  });
  conds.push({ yes: 'duermes 7 horas o más', no: 'duermes menos', f: k => { const m = sleepOf(k); return m === null ? null : m >= 420; } });
  const firstFocus = state.focus.map(f => ymd(new Date(f.start))).sort()[0];
  if (firstFocus) conds.push({ yes: 'haces una sesión de enfoque', no: 'no la haces', f: k => (k < firstFocus ? null : focusOn(k) > 0) });
  const out = [];
  for (const c of conds) for (const m of measures) {
    const r = compareDays(keys, m.f, c.f);
    if (r && Math.abs(r.yes - r.no) >= 0.4) out.push({ ...r, c, m });
  }
  return out.sort((a, b) => Math.abs(b.yes - b.no) - Math.abs(a.yes - a.no)).slice(0, 6);
}


export function viewAnalisis() {
  charts.clear();
  const keys = lastDays(anaDays), prev = lastDays(anaDays, addDays(new Date(), -anaDays));
  const range = `<div class="seg small" role="group" aria-label="Periodo">${[30, 90].map(n => `<button data-act="range" data-n="${n}" aria-pressed="${anaDays === n}">${n} días</button>`).join('')}</div>`;
  const before = (v, f) => (v === null ? 'Periodo anterior: sin datos' : `Periodo anterior: ${f(v)}`);

  const hr = habitRate(keys), hp = habitRate(prev);
  const mood = avgK(keys, k => entryOf(k)?.mood), moodP = avgK(prev, k => entryOf(k)?.mood);
  const en = avgK(keys, k => entryOf(k)?.energy), enP = avgK(prev, k => entryOf(k)?.energy);
  const sl = avgK(keys, sleepOf), slP = avgK(prev, sleepOf);
  const fo = focusIn(keys[0], keys.at(-1)), foP = focusIn(prev[0], prev.at(-1));
  const tiles = [
    tile('Cumplimiento de hábitos', hr === null ? null : `${hr}%`, before(hp, v => `${v}%`)),
    tile('Ánimo medio', mood === null ? null : `${fmt1(mood)} de 5`, before(moodP, fmt1)),
    tile('Energía media', en === null ? null : `${fmt1(en)} de 5`, before(enP, fmt1)),
    tile('Sueño medio', sl === null ? null : dur(Math.round(sl)), before(slP, v => dur(Math.round(v)))),
    tile('Enfoque', fo ? dur(fo) : null, foP ? `Periodo anterior: ${dur(foP)}` : 'Periodo anterior: sin sesiones'),
  ].join('');

  const ins = insights(keys);
  const insHtml = ins.length
    ? `<ul class="insights">${ins.map(r => `<li class="panel"><p>Los días que ${r.c.yes}, ${r.m.label} <b>${fmt1(r.yes)}</b>. Los días que ${r.c.no}, <b>${fmt1(r.no)}</b>.</p>
        <ul class="meters">${meter('Sí', r.yes / 5, fmt1(r.yes), plural(r.nYes, 'día', 'días'))}${meter('No', r.no / 5, fmt1(r.no), plural(r.nNo, 'día', 'días'))}</ul></li>`).join('')}</ul>
       <p class="muted small">Son coincidencias en tus propios datos, no prueban que una cosa cause la otra. Solo se muestran diferencias de 0,4 puntos o más, con al menos 5 días en cada lado.</p>`
    : `<p class="muted">Aún no hay suficientes datos. Para comparar hacen falta al menos 5 días con y 5 sin cada hábito (o con y sin 7 horas de sueño) en los que hayas marcado ánimo o energía.</p>`;

  const series = f => keys.map(k => ({ k, v: f(k) ?? null }));
  const enough = sr => sr.filter(p => p.v !== null).length >= 2;
  const trends = [];
  const s1 = series(k => entryOf(k)?.mood), s2 = series(k => entryOf(k)?.energy);
  const s3 = series(k => { const m = sleepOf(k); return m === null ? null : m / 60; });
  if (enough(s1)) trends.push(lineChart('mood', 'Ánimo', s1, { min: 1, max: 5, show: v => fmt1(v) }));
  if (enough(s2)) trends.push(lineChart('energy', 'Energía', s2, { min: 1, max: 5, show: v => fmt1(v) }));
  if (enough(s3)) {
    const top = Math.max(10, Math.ceil(Math.max(...s3.filter(p => p.v !== null).map(p => p.v))));
    trends.push(lineChart('sleep', 'Horas de sueño', s3, { min: 0, max: top, show: v => `${fmt1(v)} h` }));
  }
  for (const m of state.metrics) {
    const sm = series(k => valOf(m, k));
    if (!enough(sm)) continue;
    const vs = sm.filter(p => p.v !== null).map(p => p.v);
    const padv = (Math.max(...vs) - Math.min(...vs)) * 0.15 || 1;
    trends.push(lineChart(`m-${m.id}`, esc(m.name), sm, { min: Math.min(...vs) - padv, max: Math.max(...vs) + padv, show: v => `${fmt1(v)}${m.unit ? ` ${esc(m.unit)}` : ''}` }));
  }

  const now = new Date(), t = ymd(now);
  const d14 = ymd(addDays(now, -13)), d15 = ymd(addDays(now, -14)), d28 = ymd(addDays(now, -27));
  const habitsHtml = state.habits.map(h => {
    const r = rate(h, keys[0], keys.at(-1));
    if (r === null) return '';
    const now14 = rate(h, d14, t), was14 = rate(h, d28, d15);
    const risk = now14 !== null && was14 !== null && was14 - now14 >= 25;
    return meter(esc(h.name), r / 100, `${r}%`, risk ? `<strong class="risk">En riesgo.</strong> Bajó de ${was14}% a ${now14}% en las últimas dos semanas.` : '', `<i class="sw t${h.tone}"></i>`);
  }).join('');

  const byGoal = new Map();
  for (const f of state.focus) {
    const k = ymd(new Date(f.start));
    if (k >= keys[0] && k <= keys.at(-1)) byGoal.set(f.goal, (byGoal.get(f.goal) ?? 0) + f.mins);
  }
  const ranked = [...byGoal.entries()].sort((a, b) => b[1] - a[1]);
  const topMins = ranked[0]?.[1] ?? 1;
  const focusHtml = ranked.map(([g, mins]) => meter(g ? esc(state.goals.find(x => x.id === g)?.title ?? 'Meta borrada') : 'Sin meta', mins / topMins, dur(mins), '')).join('');

  return header('Análisis', `Últimos ${anaDays} días`) + calSwitch() + range + `
    ${tiles ? `<ul class="tiles">${tiles}</ul>` : ''}
    <h2 class="sub">Lo que muestran tus datos</h2>${insHtml}
    ${trends.length ? `<h2 class="sub">Tendencias</h2>${trends.join('')}` : ''}
    ${habitsHtml ? `<h2 class="sub">Hábitos</h2><ul class="meters">${habitsHtml}</ul>` : ''}
    ${focusHtml ? `<h2 class="sub">Enfoque por meta</h2><ul class="meters">${focusHtml}</ul>` : ''}`;
}


export const actions = {
  'prev': (el, e) => {  const step = calMode === 'ano' ? 12 : 1;
    return go(() => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - step, 1); render(true); }, 'back');
  },
  'next': (el, e) => {  const step = calMode === 'ano' ? 12 : 1;
    return go(() => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1); render(true); }, 'fwd');
  },
  'month': (el, e) => { 
    cursor = new Date(cursor.getFullYear(), +el.dataset.m, 1); setTab('rachas'); calMode = 'mes'; return render(true);
  },
  'yf': (el, e) => { const { h, d } = el.dataset;
    yearFilter = h; return render();
  },
  'cal': (el, e) => { 
    const order = ['mes', 'ano', 'analisis'], m = el.dataset.m; return go(() => { calMode = m; render(true); }, order.indexOf(m) > order.indexOf(calMode) ? 'fwd' : 'back');
  },
  'range': (el, e) => { 
    return go(() => { anaDays = +el.dataset.n; render(true); }, anaDays < +el.dataset.n ? 'fwd' : 'back');
  },
};

export const resetCursor = () => (cursor = new Date());
