import { ymd, addDays, parseYmd, runs, periods, streaks, bestIn, covered, weekdayIdx, weeksOfMonth, monthRow, goalProgress, mondayOf, weekStats, reviewWeek, sleepMins, mean, compareDays, advancePomodoro } from './logic.js';
import { load, save, fromJSON, toJSON, cleanFreq, cleanGoal, cleanEntry, cleanReview, REVIEW_QS, TONES } from './store.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const TONE_NAMES = ['Tinta', 'Puntos', 'Diagonal', 'Rejilla', 'Rayado', 'Rojo'];

let state = load();
let tab = 'hoy';
let cursor = new Date();
let yearFilter = 'all';
let calMode = 'mes';
let anaDays = 30;

const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const esc = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const setOf = h => (state.done[h.id] ??= new Set());
const cap = s => s[0].toUpperCase() + s.slice(1);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Per-render cache of each habit's periods, streaks and drawn days.
let cache = new Map();
function info(h) {
  if (!cache.has(h.id)) {
    const now = new Date(), done = setOf(h), ps = periods(h.freq, done, now);
    cache.set(h.id, { ps, cov: covered(ps, done, now), ...streaks(ps) });
  }
  return cache.get(h.id);
}
const unit = (h, n) => (h.freq.type === 'weekly' ? plural(n, 'semana', 'semanas') : plural(n, 'día', 'días'));
const freqLabel = f =>
  f.type === 'days' ? f.days.map(i => WD[i]).join(' ') : f.type === 'weekly' ? `${f.times} ${f.times === 1 ? 'vez' : 'veces'} por semana` : 'Diario';
const dueOn = (h, d) => h.freq.type !== 'days' || h.freq.days.includes(weekdayIdx(d));
function weekCount(h, d) {
  const mon = addDays(d, -weekdayIdx(d));
  return Array.from({ length: 7 }, (_, i) => ymd(addDays(mon, i))).filter(k => setOf(h).has(k)).length;
}
// Share of finished periods met in [from, to]; null when nothing to measure yet.
function rate(h, from, to) {
  const ps = info(h).ps.filter(p => ymd(p.start) >= from && ymd(p.start) <= to);
  return ps.length ? Math.round((100 * ps.filter(p => p.ok).length) / ps.length) : null;
}
function legendItem(h, n, from, to, scope) {
  const r = rate(h, from, to);
  return `<li><i class="sw t${h.tone}"></i><span>${esc(h.name)}</span><b>${plural(n, 'día', 'días')}</b>
    <small>${r === null ? '' : `Cumplimiento ${r}%. `}Mejor racha ${scope}: ${unit(h, bestIn(info(h).ps, from, to))}</small></li>`;
}

// One bar per streak run. `cl`/`cr` mark a run that continues past the row edge.
function bars(days, h, row, colOffset = 0) {
  const set = info(h).cov;
  return runs(days, set).map(([s, e]) => {
    const cl = (s === 0 || !days[s - 1]) && set.has(ymd(addDays(days[s], -1)));
    const cr = (e === days.length - 1 || !days[e + 1]) && set.has(ymd(addDays(days[e], 1)));
    return `<i class="bar t${h.tone}${cl ? ' cl' : ''}${cr ? ' cr' : ''}" style="grid-row:${row};grid-column:${s + 1 + colOffset}/${e + 2 + colOffset}"></i>`;
  }).join('');
}

const header = (title, sub, nav = '', brand = false) =>
  `<header class="hero">${nav ? `<button class="nav" data-act="prev" aria-label="Anterior">‹</button>` : ''}
    <div><h1${brand ? ` class="fit" style="--len:${title.length}"` : ''}>${title}</h1><p>${sub}</p></div>
    ${nav ? `<button class="nav" data-act="next" aria-label="Siguiente">›</button>` : ''}
    ${brand ? `<span class="brand" aria-label="HabyssT">HabyssT</span>` : ''}</header>`;

// UI-only preferences for this device; never part of the backup.
const ui = (() => { try { return JSON.parse(localStorage.getItem('habysst:ui')) ?? {}; } catch { return {}; } })();
const setUi = patch => { Object.assign(ui, patch); try { localStorage.setItem('habysst:ui', JSON.stringify(ui)); } catch {} };
let editMode = null; // 'habits' | 'metrics' while editing from Hoy

ui.closed ??= { checkin: !!ui.checkinClosed };
const secActions = kind => {
  const has = kind === 'habits' ? state.habits.length : state.metrics.length;
  return `${has ? `<button class="link" data-act="editmode" data-k="${kind}" aria-pressed="${editMode === kind}">${editMode === kind ? 'Listo' : 'Editar'}</button>` : ''}
    <button class="add" data-act="${kind === 'habits' ? 'new' : 'metric-new'}" aria-label="${kind === 'habits' ? 'Añadir hábito' : 'Añadir métrica'}"></button>`;
};
// A section that folds; whether it is open is remembered per device.
const fold = (id, title, note, actions, body) =>
  `<details class="fold sec" id="fold-${id}"${ui.closed[id] ? '' : ' open'}>
    <summary><h2>${title}</h2>${note ? `<span class="hmeta">${note}</span>` : ''}<span class="sec-act">${actions}</span><i class="chev" aria-hidden="true"></i></summary>
    <div class="fold-body">${body}</div></details>`;

const emptyState = `<section class="empty panel">
  <p>Todavía no tienes hábitos.</p>
  <button class="btn" data-act="new">Crear hábito</button></section>`;

function viewHoy() {
  const now = new Date(), key = ymd(now);
  const head = header(`${DAYS[now.getDay()]} ${now.getDate()}`, `${cap(MONTHS[now.getMonth()])} ${now.getFullYear()}`, '', true);
  const metricsSec = fold('metrics', 'Métricas', '', secActions('metrics'),
    state.metrics.length ? metricRows(key, editMode === 'metrics') : `<p class="muted">Añade algo que quieras medir con un número: peso, páginas leídas, dinero ahorrado.</p>`);
  const top = head + reviewNotice(now) + (state.timer ? focusBox(key) : '');
  if (!state.habits.length) return top + fold('habits', 'Hábitos', '', secActions('habits'), emptyState) + checkIn(key) + metricsSec + focusBox(key);

  const strip = Array.from({ length: 14 }, (_, i) => addDays(now, i - 13));
  const pendingFirst = list => [...list.filter(h => !setOf(h).has(key)), ...list.filter(h => setOf(h).has(key))];
  const due = pendingFirst(state.habits.filter(h => dueOn(h, now)));
  const rest = pendingFirst(state.habits.filter(h => !dueOn(h, now)));
  const doneToday = due.filter(h => setOf(h).has(key)).length;
  const item = (h, i) => {
    if (editMode === 'habits') return `<li><button class="habit panel editing" data-act="edit" data-h="${h.id}">
      <i class="sw t${h.tone}"></i><span class="hname">${esc(h.name)}</span><span class="hmeta">${freqLabel(h.freq)}</span><span class="link">Editar</span></button></li>`;
    const on = setOf(h).has(key);
    const { cur, best } = info(h);
    const week = h.freq.type === 'weekly' ? `${weekCount(h, now)} de ${h.freq.times} esta semana. ` : '';
    return `<li style="--r:${i}"><button class="habit panel${on ? ' on' : ''}" data-act="toggle" data-h="${h.id}" data-d="${key}" aria-pressed="${on}">
      <span class="check" aria-hidden="true"></span>
      <span class="hname">${esc(h.name)}</span>
      <span class="hmeta">${week}Racha ${unit(h, cur)}. Mejor: ${best}</span>
      <span class="strip" aria-hidden="true">${bars(strip, h, 1)}</span>
    </button></li>`;
  };
  const daysSince = state.lastBackup ? Math.floor((now - new Date(state.lastBackup)) / 864e5) : null;
  const backupNote = daysSince === null || daysSince >= 7
    ? `<button class="note" data-act="export">${daysSince === null ? 'Aún no tienes respaldo.' : `Último respaldo hace ${daysSince} días.`} Exportar ahora</button>`
    : '';

  return top + backupNote + fold('habits', 'Hábitos', `${doneToday} de ${due.length} hechos`, secActions('habits'), `
    <ul class="habits">${due.map(item).join('')}</ul>
    ${rest.length ? `<h3 class="sub-sm">Hoy no toca</h3><ul class="habits rest">${rest.map(item).join('')}</ul>` : ''}`) + `
  ${checkIn(key)}
  ${metricsSec}
  ${state.timer ? '' : focusBox(key)}`;
}

const calSwitch = () => `<div class="seg" role="group" aria-label="Vista">
  <button data-act="cal" data-m="mes" aria-pressed="${calMode === 'mes'}">Mes</button>
  <button data-act="cal" data-m="ano" aria-pressed="${calMode === 'ano'}">Año</button>
  <button data-act="cal" data-m="analisis" aria-pressed="${calMode === 'analisis'}">Análisis</button></div>`;

function viewMes() {
  const y = cursor.getFullYear(), m = cursor.getMonth(), t = ymd(new Date()), hs = state.habits;
  const head = header(cap(MONTHS[m]), String(y), true) + calSwitch();
  if (!hs.length) return head + emptyState;
  const weeks = weeksOfMonth(y, m);
  const monthDays = weeks.flat().filter(Boolean);

  return head + `<div class="cal panel">
    <div class="wd">${WD.map(d => `<span>${d}</span>`).join('')}</div>
    ${weeks.map((w, r) => `<div class="wk" style="--n:${hs.length};--r:${r}">
      ${w.map((d, i) => {
        if (!d) return `<span class="day pad" style="grid-column:${i + 1}"></span>`;
        const k = ymd(d);
        return `<button class="day${k === t ? ' today' : ''}${state.journal[k] ? ' has-entry' : ''}" style="grid-column:${i + 1}" data-act="day" data-d="${k}"${k > t ? ' disabled' : ''} aria-label="${d.getDate()} de ${MONTHS[m]}"><span>${d.getDate()}</span></button>`;
      }).join('')}
      ${hs.map((h, j) => bars(w, h, j + 2)).join('')}
    </div>`).join('')}
  </div>
  <ul class="legend">${hs.map(h => legendItem(h, monthDays.filter(d => setOf(h).has(ymd(d))).length, ymd(monthDays[0]), ymd(monthDays.at(-1)), 'del mes')).join('')}</ul>`;
}

function viewAno() {
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

function viewHabitos() {
  const last = state.lastBackup ? new Date(state.lastBackup).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : 'nunca';
  const theme = ui.theme ?? 'system';
  return header('Ajustes', 'Hábitos, métricas, tema y respaldo') + `
  <h2 class="sub">Hábitos</h2>
  <ul class="manage">${state.habits.map(h => `<li class="panel">
    <i class="sw t${h.tone}"></i><span>${esc(h.name)}<small>${freqLabel(h.freq)}</small></span>
    <button class="link" data-act="edit" data-h="${h.id}">Editar</button></li>`).join('')}</ul>
  <button class="btn wide" data-act="new">Crear hábito</button>
  <h2 class="sub">Métricas</h2>
  ${state.metrics.length ? `<ul class="manage">${state.metrics.map(m => `<li class="panel"><span>${esc(m.name)}<small>${m.unit ? esc(m.unit) : 'Sin unidad'}</small></span>
    <button class="link" data-act="metric-edit" data-m="${m.id}">Editar</button></li>`).join('')}</ul>` : ''}
  <button class="btn ghost wide" data-act="metric-new">Crear métrica</button>
  <h2 class="sub">Tema</h2>
  <div class="seg" role="group" aria-label="Tema">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<button data-act="theme" data-v="${v}" aria-pressed="${theme === v}">${l}</button>`).join('')}</div>
  <section class="panel backup">
    <h2>Respaldo</h2>
    <p>Tus datos se guardan solo en este teléfono. Exporta un respaldo y guárdalo en Drive, en tu correo o en Archivos. Para pasar tus datos a otro teléfono, importa ese archivo allí.</p>
    <p class="muted">Último respaldo: ${last}</p>
    <div class="row"><button class="btn" data-act="export">Exportar respaldo</button>
    <label class="btn ghost">Importar respaldo<input type="file" accept="application/json,.json" id="import" hidden></label></div>
  </section>
  <footer class="signature">
    <span class="seal" aria-hidden="true">AXG<br>25</span>
    <p><span class="brand">HabyssT</span>Diseñada y creada por <strong>AXG25</strong>.</p>
    <p class="muted small">2026. Tus datos viven solo en este teléfono.</p>
  </footer>`;
}


const MAX_GOALS = 3;
const activeGoals = () => state.goals.filter(g => g.status === 'active');
const fmt = n => n.toLocaleString('es', { maximumFractionDigits: 2 });
const fmtDate = k => parseYmd(k).toLocaleDateString('es', { day: 'numeric', month: 'short' });

const u = g => (g.unit ? ` ${esc(g.unit)}` : '');

function goalSummary(g) {
  const p = goalProgress(g, new Date());
  const amount = g.kind === 'steps'
    ? `${p.value} de ${plural(g.steps.length, 'paso', 'pasos')}`
    : g.target < g.start
      ? `${fmt(p.value)}${u(g)}, objetivo ${fmt(g.target)}${u(g)}`
      : `${fmt(p.value)} de ${fmt(g.target)}${u(g)}`;
  let pace = '';
  if (p.daysLeft !== null && g.status === 'active') {
    if (p.daysLeft < 0) pace = `Venció hace ${plural(-p.daysLeft, 'día', 'días')}.`;
    else {
      const diff = Math.round((p.pct - p.expected) * 100);
      const left = p.daysLeft === 0 ? 'Vence hoy' : `Quedan ${plural(p.daysLeft, 'día', 'días')}`;
      pace = `${left}. ${diff >= 0 ? `Vas a ritmo${diff > 0 ? `, ${diff}% por delante` : ''}.` : `Vas ${-diff}% por detrás.`}`;
    }
  }
  return { ...p, amount, pace, pctLabel: `${Math.round(p.pct * 100)}%` };
}

const progressBar = s =>
  `<div class="pbar" role="progressbar" aria-label="Progreso" aria-valuenow="${Math.round(s.pct * 100)}" aria-valuemin="0" aria-valuemax="100">
    <i style="--p:${s.pct}"></i>${s.expected !== null ? `<b style="left:${(s.expected * 100).toFixed(1)}%"></b>` : ''}</div>`;

const ifThen = (a, b) => (a || b ? `<p class="plan">Si ${esc(a || '…')}, entonces ${esc(b || '…')}.</p>` : '');

function viewMetas() {
  const act = activeGoals(), closed = state.goals.filter(g => g.status !== 'active');
  return header('Metas', `${act.length} de ${MAX_GOALS} activas`) +
    (act.length
      ? `<ul class="goals">${act.map((g, i) => {
          const s = goalSummary(g);
          return `<li style="--r:${i}"><button class="goal panel" data-act="goal" data-g="${g.id}">
            <span class="gtitle">${esc(g.title)}</span>
            ${progressBar(s)}
            <span class="gline"><b>${s.pctLabel}</b> ${s.amount}</span>
            ${s.pace ? `<span class="hmeta">${s.pace}</span>` : ''}
            ${ifThen(g.plan.when, g.plan.then)}
          </button></li>`;
        }).join('')}</ul>`
      : `<section class="empty panel"><p>Todavía no tienes metas.</p></section>`) +
    (act.length < MAX_GOALS
      ? `<button class="btn wide" data-act="goal-new">Crear meta</button>`
      : `<p class="muted">Tienes ${MAX_GOALS} metas activas, el máximo. Logra o abandona una para crear otra.</p>`) +
    (closed.length
      ? `<details class="closed"><summary>Cerradas (${closed.length})</summary><ul class="manage">${closed.map(g => `<li class="panel">
          <span>${esc(g.title)}<small>${g.status === 'done' ? 'Lograda' : 'Abandonada'}${g.closedAt ? ` el ${fmtDate(g.closedAt)}` : ''}</small></span>
          <button class="link" data-act="goal" data-g="${g.id}">Ver</button></li>`).join('')}</ul></details>`
      : '');
}

function openGoal(id) {
  const draw = () => {
    const g = state.goals.find(x => x.id === id);
    if (!g) return $sheet.close();
    const s = goalSummary(g), active = g.status === 'active';
    const linked = state.habits.filter(h => g.habits.includes(h.id));
    $sheet.innerHTML = `<form method="dialog" class="gdetail">
      <h2 tabindex="-1" autofocus>${esc(g.title)}</h2>
      ${g.why ? `<p class="why">${esc(g.why)}</p>` : ''}
      ${progressBar(s)}
      <p class="gline"><b>${s.pctLabel}</b> ${s.amount}</p>
      ${s.pace ? `<p class="hmeta">${s.pace}</p>` : ''}
      ${active && g.kind === 'number' ? `<div class="logrow">
        <label class="field">Valor actual${g.unit ? ` (${esc(g.unit)})` : ''}<input name="v" type="number" step="any" inputmode="decimal" value="${s.value}"></label>
        <button type="button" class="btn" data-act="goal-log" data-g="${g.id}">Registrar</button></div>` : ''}
      ${g.kind === 'steps' ? `<ul class="habits">${g.steps.map((st, i) => `<li><button type="button" class="habit compact panel${st.done ? ' on' : ''}" data-act="goal-step" data-g="${g.id}" data-i="${i}" aria-pressed="${st.done}"${active ? '' : ' disabled'}>
        <span class="check" aria-hidden="true"></span><span class="hname">${esc(st.text)}</span></button></li>`).join('')}</ul>` : ''}
      ${state.focus.some(f => f.goal === g.id) ? `<p class="hmeta">Enfoque dedicado: ${dur(focusIn('0000-00-00', '9999-12-31', g.id))}</p>` : ''}
      ${g.plan.when || g.plan.then ? `<h3>Plan</h3>${ifThen(g.plan.when, g.plan.then)}` : ''}
      ${g.obstacle.if || g.obstacle.then ? `<h3>Obstáculo previsto</h3>${ifThen(g.obstacle.if, g.obstacle.then)}` : ''}
      ${linked.length ? `<h3>Hábitos vinculados</h3><ul class="legend">${linked.map(h => `<li><i class="sw t${h.tone}"></i><span>${esc(h.name)}</span><b>${unit(h, info(h).cur)}</b><small>Racha actual. Mejor: ${info(h).best}</small></li>`).join('')}</ul>` : ''}
      ${g.kind === 'number' && g.log.length ? `<h3>Registro</h3><ul class="log">${g.log.slice(-5).reverse().map(e => `<li><span>${fmtDate(e.d)}</span><b>${fmt(e.v)}</b></li>`).join('')}</ul>` : ''}
      <div class="row">${active
        ? `<button type="button" class="btn" data-act="goal-close" data-g="${g.id}" data-s="done">Marcar como lograda</button>
           <button type="button" class="btn ghost" data-act="goal-edit" data-g="${g.id}">Editar</button>`
        : `<button type="button" class="btn ghost" data-act="goal-reopen" data-g="${g.id}">Reactivar</button>`}
        <button class="btn ghost">Cerrar</button></div>
      ${active
        ? `<button type="button" class="link danger" data-act="goal-close" data-g="${g.id}" data-s="dropped">Abandonar meta</button>`
        : `<button type="button" class="link danger" data-act="goal-delete" data-g="${g.id}">Borrar meta</button>`}
    </form>`;
  };
  $sheet.redraw = draw;
  draw();
  if (!$sheet.open) $sheet.showModal();
}

function logGoal(id) {
  const g = state.goals.find(x => x.id === id);
  const v = parseFloat($sheet.querySelector('input[name="v"]').value);
  if (!Number.isFinite(v)) return alert('Escribe un número.');
  const d = ymd(new Date());
  if (g.log.at(-1)?.d === d) g.log.at(-1).v = v; // one entry per day; the last one wins
  else g.log.push({ d, v });
  save(state);
  $sheet.redraw();
  $sheet.querySelector('.pbar')?.classList.add('pop');
  render();
}

function openGoalEditor(g) {
  const kind = g?.kind ?? 'number';
  const val = x => (x ? esc(String(x)) : '');
  const radio = (v, label) => `<label class="opt"><input type="radio" name="kind" value="${v}"${kind === v ? ' checked' : ''}><span>${label}</span></label>`;
  $sheet.redraw = null;
  $sheet.innerHTML = `<form id="geditor">
    <h2${g ? ' tabindex="-1" autofocus' : ''}>${g ? 'Editar meta' : 'Nueva meta'}</h2>
    <label class="field">Meta<input name="title" required maxlength="80" value="${val(g?.title)}" placeholder="Correr una media maratón" autocomplete="off"></label>
    <label class="field">Por qué te importa<textarea name="why" rows="2" maxlength="500" placeholder="Opcional">${val(g?.why)}</textarea></label>
    <label class="field">Fecha límite<input name="deadline" type="date" value="${g?.deadline ?? ''}"></label>
    <fieldset class="freq"><legend>Cómo se mide</legend>
      <div class="opts">${radio('number', 'Con un número')}${radio('steps', 'Con pasos')}</div>
      <div class="when-number nums">
        <label class="field">Valor inicial<input name="start" type="number" step="any" inputmode="decimal" value="${g?.start ?? 0}"></label>
        <label class="field">Objetivo<input name="target" type="number" step="any" inputmode="decimal" value="${g && g.kind === 'number' ? g.target : ''}"></label>
        <label class="field">Unidad<input name="unit" maxlength="20" value="${val(g?.unit)}" placeholder="km"></label>
      </div>
      <label class="when-steps field">Pasos, uno por línea<textarea name="steps" rows="4" placeholder="Correr 5 km sin parar&#10;Correr 10 km&#10;Inscribirme en la carrera">${g ? esc(g.steps.map(x => x.text).join('\n')) : ''}</textarea></label>
    </fieldset>
    <fieldset><legend>Plan: cuándo y dónde actuarás</legend>
      <label class="field">Si…<input name="when" maxlength="160" value="${val(g?.plan.when)}" placeholder="son las 7:00 y termino el café"></label>
      <label class="field">entonces…<input name="then" maxlength="160" value="${val(g?.plan.then)}" placeholder="salgo a correr 30 minutos"></label>
    </fieldset>
    <fieldset><legend>Obstáculo previsto</legend>
      <label class="field">Si…<input name="oif" maxlength="160" value="${val(g?.obstacle.if)}" placeholder="llueve o llego cansado"></label>
      <label class="field">entonces…<input name="othen" maxlength="160" value="${val(g?.obstacle.then)}" placeholder="hago 15 minutos de cinta en casa"></label>
    </fieldset>
    ${state.habits.length ? `<fieldset><legend>Hábitos que la sostienen</legend><div class="opts">${state.habits.map(h => `<label class="opt"><input type="checkbox" name="habits" value="${h.id}"${g?.habits.includes(h.id) ? ' checked' : ''}><i class="sw t${h.tone}"></i><span>${esc(h.name)}</span></label>`).join('')}</div></fieldset>` : ''}
    <div class="row"><button class="btn">${g ? 'Guardar' : 'Crear meta'}</button>
    <button type="button" class="btn ghost" data-act="close">Cancelar</button></div>
  </form>`;
  $sheet.querySelector('#geditor').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const k = f.get('kind');
    const n = x => (f.get(x) === '' ? NaN : parseFloat(f.get(x)));
    const texts = f.get('steps').split('\n').map(t => t.trim()).filter(Boolean);
    if (k === 'number' && (!Number.isFinite(n('start')) || !Number.isFinite(n('target')) || n('start') === n('target')))
      return alert('Escribe un valor inicial y un objetivo distintos.');
    if (k === 'steps' && !texts.length) return alert('Escribe al menos un paso.');
    const prevDone = new Set(g?.steps.filter(x => x.done).map(x => x.text));
    const next = cleanGoal({
      id: g?.id ?? crypto.randomUUID(),
      title: f.get('title'),
      why: f.get('why'),
      kind: k,
      unit: f.get('unit'),
      start: n('start'),
      target: n('target'),
      log: g?.log ?? [],
      steps: texts.map(text => ({ text, done: prevDone.has(text) })),
      plan: { when: f.get('when'), then: f.get('then') },
      obstacle: { if: f.get('oif'), then: f.get('othen') },
      habits: f.getAll('habits'),
      startDate: g?.startDate ?? ymd(new Date()),
      deadline: f.get('deadline') || null,
      status: g?.status ?? 'active',
      closedAt: g?.closedAt ?? null,
    }, new Set(state.habits.map(h => h.id)));
    if (!next) return alert('Escribe el nombre de la meta.');
    if (next.deadline && next.deadline < next.startDate) return alert('La fecha límite no puede ser anterior al inicio de la meta.');
    if (g) Object.assign(g, next);
    else state.goals.push(next);
    save(state);
    $sheet.close();
    render();
  };
  $sheet.showModal();
}

// A hanko-style stamp for the rare moment a goal is achieved.
function stamp(text) {
  const el = Object.assign(document.createElement('div'), { className: 'stamp', textContent: text });
  el.setAttribute('role', 'status');
  el.addEventListener('animationend', () => el.remove());
  document.body.append(el);
}


// ---- Journal
const LEVELS = ['Muy bajo', 'Bajo', 'Normal', 'Bueno', 'Muy bueno'];
const KINDS = { mood: 'Ánimo', energy: 'Energía', sleep: 'Calidad' };
const entryOf = k => state.journal[k];

// Five steps from sparse screentone to solid ink: the scale reads without color or faces.
const scale5 = (kind, key) => {
  const v = entryOf(key)?.[kind] ?? null;
  return `<div class="scale" role="group" aria-label="${KINDS[kind]}">
    <span class="scale-l">${KINDS[kind]}</span>
    <div class="scale-b">${LEVELS.map((l, i) => `<button type="button" class="lv lv${i + 1}" data-act="rate" data-k="${kind}" data-d="${key}" data-v="${i + 1}" aria-pressed="${v === i + 1}" aria-label="${l}"></button>`).join('')}</div>
    <span class="scale-v">${v ? LEVELS[v - 1] : 'Sin marcar'}</span></div>`;
};
const scales = key => `<div class="scales">${scale5('mood', key)}${scale5('energy', key)}</div>`;

function checkIn(key) {
  const e = entryOf(key);
  const written = e?.text || Object.keys(e?.answers ?? {}).length;
  const sm = sleepMins(e?.bed, e?.wake);
  const summary = [e?.mood && `Ánimo: ${LEVELS[e.mood - 1].toLowerCase()}`, e?.energy && `Energía: ${LEVELS[e.energy - 1].toLowerCase()}`, sm && `Sueño: ${dur(sm)}`].filter(Boolean).join('. ') || 'Sin registrar todavía';
  return fold('checkin', 'Ánimo, energía y sueño', summary, '', `<div class="panel checkin-body">${scales(key)}${sleepLine(key)}
    <button class="link" data-act="entry" data-d="${key}">${written ? 'Seguir escribiendo' : 'Escribir en el diario'}</button></div>`);
}

function setEntry(key, patch) {
  const next = cleanEntry({ ...(entryOf(key) ?? {}), ...patch });
  if (next) state.journal[key] = next;
  else delete state.journal[key];
}

function rate5(kind, key, v) {
  setEntry(key, { [kind]: entryOf(key)?.[kind] === v ? null : v }); // tap again to clear
  save(state);
  if ($sheet.open && $sheet.redraw) $sheet.redraw();
  render();
}

const longDate = k => { const d = parseYmd(k); return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`; };

// Saves a sheet's form shortly after each keystroke, and once more when the sheet closes, however it closes.
function autosave(form, write) {
  let timer = null;
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    write(new FormData(form));
    save(state);
    form.querySelector('.saved').textContent = 'Guardado.';
  };
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 300); });
  $sheet.addEventListener('close', () => { if (timer) flush(); render(); }, { once: true });
  return flush;
}

function openEntry(key) {
  const e = entryOf(key) ?? { answers: {} };
  // Questions answered before you edited the list stay visible on their entries.
  const qs = [...new Set([...state.prompts, ...Object.keys(e.answers ?? {})])];
  const draw = () => {
    $sheet.innerHTML = `<form method="dialog" id="entry" class="entry">
      <h2 tabindex="-1" autofocus>${longDate(key)}</h2>
      ${scales(key)}
      ${qs.map((q, i) => `<label class="field">${esc(q)}<textarea name="q${i}" rows="2" maxlength="5000">${esc(e.answers?.[q] ?? '')}</textarea></label>`).join('')}
      <label class="field">Notas<textarea name="text" rows="6" maxlength="20000" placeholder="Escribe lo que quieras.">${esc(e.text ?? '')}</textarea></label>
      <p class="muted saved" aria-live="polite">Se guarda mientras escribes.</p>
      <div class="row"><button class="btn">Listo</button></div>
    </form>`;
    autosave($sheet.querySelector('#entry'), f =>
      setEntry(key, { text: f.get('text'), answers: Object.fromEntries(qs.map((q, i) => [q, f.get(`q${i}`)])) }));
  };
  // Rating inside the entry only redraws the scales, so typed text is untouched.
  $sheet.redraw = () => { const sc = $sheet.querySelector('.scales'); if (sc) sc.outerHTML = scales(key); };
  draw();
  if (!$sheet.open) $sheet.showModal();
}

function entryCards(q) {
  const needle = q.trim().toLowerCase();
  const keys = Object.keys(state.journal).sort().reverse();
  const hits = keys.filter(k => {
    if (!needle) return true;
    const e = state.journal[k];
    return [e.text, ...Object.values(e.answers)].join('\n').toLowerCase().includes(needle);
  });
  if (!hits.length) return `<p class="muted">${needle ? 'Ninguna entrada contiene ese texto.' : 'Aún no hay entradas. Empieza por la de hoy.'}</p>`;
  return `<ul class="entries">${hits.slice(0, 200).map(k => {
    const e = state.journal[k];
    const body = [...Object.values(e.answers), e.text].filter(Boolean).map(t => (/[.!?…]$/.test(t) ? t : `${t}.`)).join(' ');
    const sm = sleepMins(e.bed, e.wake);
    const meta = [e.mood && `Ánimo: ${LEVELS[e.mood - 1].toLowerCase()}`, e.energy && `Energía: ${LEVELS[e.energy - 1].toLowerCase()}`, sm && `Sueño: ${dur(sm)}`].filter(Boolean).join('. ');
    return `<li><button class="entry-card panel" data-act="entry" data-d="${k}">
      <span class="ename">${longDate(k)}</span>
      ${meta ? `<span class="hmeta">${meta}.</span>` : ''}
      ${body ? `<span class="excerpt">${esc(body.slice(0, 180))}${body.length > 180 ? '…' : ''}</span>` : ''}
    </button></li>`;
  }).join('')}</ul>`;
}

function viewDiario() {
  const n = Object.keys(state.journal).length;
  return header('Diario', plural(n, 'entrada', 'entradas')) + `
    <div class="row stack"><button class="btn" data-act="entry" data-d="${ymd(new Date())}">${entryOf(ymd(new Date())) ? 'Seguir con la entrada de hoy' : 'Escribir la entrada de hoy'}</button>
    <button class="btn ghost" data-act="review" data-d="${ymd(reviewWeek(new Date()))}">Revisión de la semana</button></div>
    ${reviewList()}
    <label class="field search">Buscar en el diario<input type="search" id="jsearch" placeholder="Palabra o frase" autocomplete="off"></label>
    <div id="entries">${entryCards('')}</div>
    <details class="closed"><summary>Preguntas guía</summary>
      <label class="field">Una por línea. Déjalo vacío si prefieres escribir libre.<textarea id="prompts" rows="4">${esc(state.prompts.join('\n'))}</textarea></label>
      <button class="btn" data-act="prompts">Guardar preguntas</button></details>`;
}

function savePrompts() {
  state.prompts = document.getElementById('prompts').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8);
  save(state);
  render();
}

document.addEventListener('input', e => {
  if (e.target.id === 'jsearch') document.getElementById('entries').innerHTML = entryCards(e.target.value);
});

// ---- Weekly review
const Q_LABELS = {
  worked: '¿Qué funcionó esta semana?',
  didnt: '¿Qué no funcionó y por qué?',
  change: '¿Qué vas a cambiar la próxima semana?',
  focus: 'Tu prioridad principal para la próxima semana',
};
const dm = d => `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
function weekLabel(mon) {
  const sun = addDays(mon, 6);
  return mon.getMonth() === sun.getMonth() ? `Semana del ${mon.getDate()} al ${dm(sun)}` : `Semana del ${dm(mon)} al ${dm(sun)}`;
}

function avgOf(kind, mon) {
  const vals = Array.from({ length: 7 }, (_, i) => state.journal[ymd(addDays(mon, i))]?.[kind]).filter(Boolean);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function reviewData(mon) {
  const now = new Date(), prev = addDays(mon, -7);
  const habits = state.habits.map(h => {
    const w = weekStats(h.freq, setOf(h), mon, now), p = weekStats(h.freq, setOf(h), prev, now);
    return `<li><i class="sw t${h.tone}"></i><span>${esc(h.name)}</span><b>${w.done}/${w.due}</b>
      <small>Semana anterior: ${p.done}/${p.due}</small></li>`;
  }).join('');
  const feel = ['mood', 'energy'].map(k => {
    const a = avgOf(k, mon), b = avgOf(k, prev);
    if (a === null) return '';
    const delta = b === null ? '' : ` (semana anterior: ${fmt(Math.round(b * 10) / 10)})`;
    return `<li><span>${k === 'mood' ? 'Ánimo medio' : 'Energía media'}</span><b>${fmt(Math.round(a * 10) / 10)} de 5</b><small>${LEVELS[Math.round(a) - 1]}${delta}</small></li>`;
  }).join('');
  const sun = ymd(addDays(mon, 6)), monKey = ymd(mon);
  const goals = activeGoals().map(g => {
    const s = goalSummary(g);
    let moved = '';
    if (g.kind === 'number') {
      const before = [...g.log].reverse().find(e => e.d < monKey)?.v ?? g.start;
      const after = [...g.log].reverse().find(e => e.d <= sun)?.v ?? g.start;
      moved = before === after ? 'Sin cambios esta semana.' : `Esta semana: de ${fmt(before)} a ${fmt(after)}${u(g)}.`;
    }
    return `<li><span>${esc(g.title)}</span><b>${s.pctLabel}</b><small>${[moved, s.pace].filter(Boolean).join(' ')}</small></li>`;
  }).join('');
  const entries = Array.from({ length: 7 }, (_, i) => state.journal[ymd(addDays(mon, i))]).filter(Boolean).length;
  const fw = focusIn(monKey, sun), fp = focusIn(ymd(prev), ymd(addDays(prev, 6)));
  return `${habits ? `<h3>Hábitos</h3><ul class="legend data">${habits}</ul>` : ''}
    ${feel ? `<h3>Cómo estuviste</h3><ul class="legend data">${feel}</ul>` : ''}
    ${goals ? `<h3>Metas</h3><ul class="legend data">${goals}</ul>` : ''}
    ${fw || fp ? `<h3>Enfoque</h3><ul class="legend data"><li><span>Tiempo de enfoque</span><b>${fw ? dur(fw) : '0 h'}</b><small>Semana anterior: ${fp ? dur(fp) : '0 h'}</small></li></ul>` : ''}
    <p class="muted">${plural(entries, 'día', 'días')} con entrada en el diario.</p>`;
}

function openReview(key) {
  const mon = parseYmd(key);
  const r = state.reviews[key] ?? { answers: {}, doneAt: null };
  $sheet.redraw = null;
  $sheet.innerHTML = `<form method="dialog" id="review" class="entry">
    <h2 tabindex="-1" autofocus>${weekLabel(mon)}</h2>
    ${reviewData(mon)}
    <h3>Tu revisión</h3>
    ${REVIEW_QS.map(q => `<label class="field">${Q_LABELS[q]}<textarea name="${q}" rows="${q === 'focus' ? 1 : 3}" maxlength="2000">${esc(r.answers[q] ?? '')}</textarea></label>`).join('')}
    <p class="muted saved" aria-live="polite">Se guarda mientras escribes.</p>
    <div class="row">${r.doneAt ? `<button class="btn">Listo</button>` : `<button type="button" class="btn" data-act="review-done" data-d="${key}">Terminar revisión</button><button class="btn ghost">Seguir luego</button>`}</div>
  </form>`;
  const write = f => {
    const next = cleanReview({ answers: Object.fromEntries(REVIEW_QS.map(q => [q, f.get(q)])), doneAt: state.reviews[key]?.doneAt });
    if (next) state.reviews[key] = next;
    else delete state.reviews[key];
  };
  $sheet.flush = autosave($sheet.querySelector('#review'), write);
  if (!$sheet.open) $sheet.showModal();
}

function finishReview(key) {
  $sheet.flush();
  state.reviews[key] = { ...(state.reviews[key] ?? { answers: Object.fromEntries(REVIEW_QS.map(q => [q, ''])) }), doneAt: ymd(new Date()) };
  save(state);
  $sheet.close();
  stamp('Revisada');
}

function reviewNotice(now) {
  const key = ymd(reviewWeek(now));
  const pending = [0, 1, 2].includes(now.getDay()) && !state.reviews[key]?.doneAt && (state.habits.length || state.goals.length);
  const focus = state.reviews[ymd(addDays(mondayOf(now), -7))]?.answers.focus;
  return (focus ? `<section class="focus panel"><span class="hmeta">Prioridad de esta semana</span><strong>${esc(focus)}</strong></section>` : '') +
    (pending ? `<button class="note" data-act="review" data-d="${key}">Tienes pendiente la revisión de la semana. Hacerla ahora (10 minutos)</button>` : '');
}

function reviewList() {
  const keys = Object.keys(state.reviews).sort().reverse();
  return keys.length ? `<details class="closed"><summary>Revisiones anteriores (${keys.length})</summary><ul class="manage">${keys.map(k => `<li class="panel">
    <span>${weekLabel(parseYmd(k))}<small>${state.reviews[k].doneAt ? 'Terminada' : 'Sin terminar'}</small></span>
    <button class="link" data-act="review" data-d="${k}">Abrir</button></li>`).join('')}</ul></details>` : '';
}

// ---- Sleep (stored on the day you wake up)
const dur = mins => (mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}`);
function sleepLine(key) {
  const e = entryOf(key), mins = sleepMins(e?.bed, e?.wake);
  const txt = mins ? `${dur(mins)}${e.sleep ? `. Calidad: ${LEVELS[e.sleep - 1].toLowerCase()}` : ''}` : 'Sin registrar';
  return `<button class="sleep-line" data-act="sleep" data-d="${key}"><span class="scale-l">Sueño</span><span>${txt}</span><span class="link">${mins ? 'Editar' : 'Registrar'}</span></button>`;
}

function lastSleep() {
  const k = Object.keys(state.journal).sort().reverse().find(k => state.journal[k].bed);
  return k ? state.journal[k] : { bed: '23:30', wake: '07:00' };
}

function openSleep(key) {
  const e = entryOf(key) ?? {}, last = lastSleep();
  $sheet.innerHTML = `<form method="dialog" id="sleepf" class="entry">
    <h2 tabindex="-1" autofocus>Sueño</h2>
    <p class="muted">La noche que termina el ${longDate(key).toLowerCase()}.</p>
    <div class="nums two">
      <label class="field">Me acosté<input type="time" name="bed" value="${e.bed ?? last.bed}"></label>
      <label class="field">Me levanté<input type="time" name="wake" value="${e.wake ?? last.wake}"></label>
    </div>
    <p class="gline" id="sleepdur"></p>
    <div class="scales">${scale5('sleep', key)}</div>
    <p class="muted saved" aria-live="polite">Se guarda al cambiar.</p>
    <div class="row"><button class="btn">Listo</button>
    <button type="button" class="btn ghost" data-act="sleep-clear" data-d="${key}">Borrar sueño</button></div>
  </form>`;
  const form = $sheet.querySelector('#sleepf');
  const show = () => { const m = sleepMins(form.bed.value, form.wake.value); form.querySelector('#sleepdur').textContent = m ? `Dormiste ${dur(m)}.` : ''; };
  form.addEventListener('input', show);
  show();
  const flush = autosave(form, f => setEntry(key, { bed: f.get('bed') || null, wake: f.get('wake') || null }));
  if (!e.bed) flush(); // opening the sheet with prefilled times records them; "Borrar sueño" undoes it
  $sheet.redraw = () => { const sc = $sheet.querySelector('.scales'); if (sc) sc.innerHTML = scale5('sleep', key); };
  if (!$sheet.open) $sheet.showModal();
}

// ---- Custom metrics
const valOf = (m, key) => state.values[m.id]?.[key];
function lastValue(m, before) {
  const k = Object.keys(state.values[m.id] ?? {}).filter(k => k < before).sort().at(-1);
  return k ? state.values[m.id][k] : null;
}
function metricRows(key, editing = false) {
  if (!state.metrics.length) return '';
  return `<ul class="metrics">${state.metrics.map(m => {
    const v = valOf(m, key), prev = lastValue(m, key);
    if (editing) return `<li><button class="metric panel editing" data-act="metric-edit" data-m="${m.id}"><span class="hname">${esc(m.name)}</span><span class="link">Editar</span>
      <span class="hmeta">${m.unit ? `Unidad: ${esc(m.unit)}` : 'Sin unidad'}</span></button></li>`;
    return `<li><button class="metric panel" data-act="metric" data-m="${m.id}" data-d="${key}">
      <span class="hname">${esc(m.name)}</span>
      <b>${v === undefined ? '' : `${fmt(v)}${m.unit ? ` ${esc(m.unit)}` : ''}`}</b>
      <span class="hmeta">${v === undefined ? 'Sin registrar' : ''}${prev !== null ? `${v === undefined ? '. ' : ''}Anterior: ${fmt(prev)}${m.unit ? ` ${esc(m.unit)}` : ''}` : ''}</span>
    </button></li>`;
  }).join('')}</ul>`;
}

// Every value lives in state.values[metricId][YYYY-MM-DD]; this shows the latest ones.
function history(m) {
  const rows = Object.entries(state.values[m.id] ?? {}).sort((a, b) => b[0].localeCompare(a[0]));
  if (!rows.length) return '';
  const u = m.unit ? ` ${esc(m.unit)}` : '';
  return `<h3>Historial</h3><ul class="log">${rows.slice(0, 10).map(([k, v], i) => {
    const prev = rows[i + 1]?.[1], diff = prev === undefined ? '' : v - prev;
    return `<li><span>${longDate(k)}</span><b>${fmt(v)}${u}${diff ? `<small> (${diff > 0 ? '+' : ''}${fmt(Math.round(diff * 100) / 100)})</small>` : ''}</b></li>`;
  }).join('')}</ul>
  <p class="muted small">${rows.length > 10 ? `Mostrando 10 de ${rows.length} registros. ` : ''}La gráfica completa está en Progreso, Análisis.</p>`;
}

function openMetric(id, key) {
  const m = state.metrics.find(x => x.id === id), v = valOf(m, key);
  $sheet.redraw = null;
  $sheet.innerHTML = `<form id="metricf">
    <h2>${esc(m.name)}</h2>
    <p class="muted">${longDate(key)}</p>
    <label class="field">Valor${m.unit ? ` (${esc(m.unit)})` : ''}<input name="v" type="number" step="any" inputmode="decimal" required value="${v ?? ''}" placeholder="${lastValue(m, key) ?? ''}"></label>
    <div class="row"><button class="btn">Guardar</button><button type="button" class="btn ghost" data-act="close">Cancelar</button></div>
    ${history(m)}
    ${v !== undefined ? `<button type="button" class="link danger" data-act="metric-clear" data-m="${id}" data-d="${key}">Borrar el valor de este día</button>` : ''}
  </form>`;
  $sheet.querySelector('#metricf').onsubmit = e => {
    e.preventDefault();
    const n = parseFloat(e.target.v.value);
    if (!Number.isFinite(n)) return alert('Escribe un número.');
    (state.values[id] ??= {})[key] = n;
    save(state);
    $sheet.close();
    render();
  };
  if (!$sheet.open) $sheet.showModal();
}

function openMetricEditor(m) {
  $sheet.redraw = null;
  $sheet.innerHTML = `<form id="meditor">
    <h2${m ? ' tabindex="-1" autofocus' : ''}>${m ? 'Editar métrica' : 'Nueva métrica'}</h2>
    <p class="muted">Algo que quieras medir con un número: peso, páginas leídas, dinero ahorrado, cigarrillos.</p>
    <label class="field">Nombre<input name="name" required maxlength="40" value="${m ? esc(m.name) : ''}" placeholder="Peso" autocomplete="off"></label>
    <label class="field">Unidad<input name="unit" maxlength="12" value="${m ? esc(m.unit) : ''}" placeholder="kg" autocomplete="off"></label>
    <div class="row"><button class="btn">${m ? 'Guardar' : 'Crear métrica'}</button><button type="button" class="btn ghost" data-act="close">Cancelar</button></div>
    ${m ? `<button type="button" class="link danger" data-act="metric-delete" data-m="${m.id}">Borrar métrica y sus valores</button>` : ''}
  </form>`;
  $sheet.querySelector('#meditor').onsubmit = e => {
    e.preventDefault();
    const name = e.target.name.value.trim(), unit = e.target.unit.value.trim();
    if (!name) return;
    if (m) Object.assign(m, { name, unit });
    else { const id = crypto.randomUUID(); state.metrics.push({ id, name, unit }); state.values[id] = {}; }
    save(state);
    $sheet.close();
    render();
  };
  $sheet.showModal();
}

// ---- Focus sessions. The running timer lives in state, so it survives closing the app.
const pad = n => String(n).padStart(2, '0');
const clock = secs => { const a = Math.abs(secs); return `${a >= 3600 ? `${Math.floor(a / 3600)}:` : ''}${pad(Math.floor((a % 3600) / 60))}:${pad(a % 60)}`; };
const focusOn = key => state.focus.filter(f => ymd(new Date(f.start)) === key).reduce((n, f) => n + f.mins, 0);
const focusIn = (from, to, goal) => state.focus
  .filter(f => { const k = ymd(new Date(f.start)); return k >= from && k <= to && (goal === undefined || f.goal === goal); })
  .reduce((n, f) => n + f.mins, 0);

function focusBox(key) {
  const t = state.timer;
  if (!t) {
    const today = focusOn(key);
    return `<section class="focusbox idle"><button class="btn ghost wide" data-act="focus-setup">Empezar sesión de enfoque</button>
      ${today ? `<span class="hmeta">Hoy: ${dur(today)} de enfoque</span>` : ''}</section>`;
  }
  const goal = state.goals.find(g => g.id === t.goal);
  return `<section class="focusbox running panel" aria-live="off">
    <span class="hmeta" id="clocklabel">${phaseLabel()}</span>
    <span class="clock" id="clock">${clockText()}</span>
    ${goal ? `<span class="hmeta">Para: ${esc(goal.title)}</span>` : ''}
    <div class="row">${focusButtons()}<button class="btn ghost" data-act="zen">Modo zen</button></div>
  </section>`;
}

const isPomo = t => t?.phase !== undefined;
function phaseLabel() {
  const t = state.timer;
  if (!isPomo(t)) return t.target ? 'Tiempo restante' : 'Tiempo en sesión';
  return { work: `Pomodoro ${t.pomo + 1}. Enfoque`, break: t.target === 15 ? 'Descanso largo. Levántate y respira.' : 'Descanso. Aléjate de la pantalla.', ready: `Descanso terminado. Llevas ${plural(t.pomo, 'pomodoro', 'pomodoros')}.` }[t.phase];
}
function focusButtons() {
  const t = state.timer;
  if (isPomo(t) && t.phase === 'ready') return `<button class="btn" data-act="focus-next">Siguiente pomodoro</button><button class="btn ghost" data-act="focus-end">Terminar</button>`;
  if (isPomo(t) && t.phase === 'break') return `<button class="btn ghost" data-act="focus-end">Terminar</button>`;
  return `<button class="btn" data-act="focus-stop">Terminar</button><button class="btn ghost" data-act="focus-cancel">Descartar</button>`;
}

function clockText() {
  const t = state.timer, el = Math.floor((Date.now() - Date.parse(t.start)) / 1000);
  if (t.phase === 'ready') return '00:00';
  if (!t.target) return clock(el);
  const left = t.target * 60 - el;
  return left >= 0 ? clock(left) : `+${clock(left)}`;
}

let buzzed = false;
function tick() {
  if (!state.timer) return;
  if (isPomo(state.timer)) {
    const { timer, sessions } = advancePomodoro(state.timer, Date.now());
    if (timer.phase !== state.timer.phase || timer.start !== state.timer.start) {
      state.timer = timer;
      state.focus.push(...sessions);
      save(state);
      navigator.vibrate?.([200, 100, 200]);
      return render();
    }
  }
  for (const id of ['clock', 'zclock']) { const el = document.getElementById(id); if (el) el.textContent = clockText(); }
  const ring = document.getElementById('zring');
  if (ring) ring.style.strokeDashoffset = ringLeft();
  const c = document.getElementById('clock');
  if (!c || isPomo(state.timer)) return;
  const over = state.timer.target && Date.now() - Date.parse(state.timer.start) >= state.timer.target * 60000;
  if (over) {
    document.getElementById('clocklabel').textContent = 'Tiempo cumplido. Termina cuando quieras.';
    c.classList.add('over');
    if (!buzzed) { buzzed = true; navigator.vibrate?.([200, 100, 200]); }
  }
}
setInterval(tick, 1000);

// ---- Zen: full screen, nothing but the ring and the time. Keeps the screen on while open.
let zenOpen = false, wakeLock = null;
const $zen = document.getElementById('zen');
function ringLeft() {
  const t = state.timer;
  if (!t?.target) return 0;
  return Math.min(1, (Date.now() - Date.parse(t.start)) / (t.target * 60000)).toFixed(4);
}
async function keepAwake(on) {
  try {
    if (on && !wakeLock) wakeLock = await navigator.wakeLock?.request('screen');
    if (!on) { await wakeLock?.release(); wakeLock = null; }
  } catch { wakeLock = null; } // denied or unsupported: the timer still works
}
function renderZen() {
  const show = zenOpen && !!state.timer;
  $zen.hidden = !show;
  document.body.classList.toggle('zen-on', show);
  keepAwake(show);
  if (!show) return;
  const t = state.timer, goal = state.goals.find(g => g.id === t.goal);
  const wasOpen = $zen.contains(document.activeElement);
  $zen.className = `zen ${t.phase ?? 'work'}`;
  $zen.innerHTML = `<p class="zen-phase">${phaseLabel()}</p>
    <div class="zen-ring">
      <svg viewBox="0 0 260 260" aria-hidden="true"><circle cx="130" cy="130" r="118" class="track"/><circle cx="130" cy="130" r="118" class="fill" id="zring" pathLength="1" style="stroke-dashoffset:${ringLeft()}"/></svg>
      <span class="zen-clock" id="zclock">${clockText()}</span>
    </div>
    ${goal ? `<p class="zen-goal">${esc(goal.title)}</p>` : ''}
    <div class="row">${focusButtons()}<button class="btn ghost" data-act="zen-exit">Salir</button></div>`;
  if (!wasOpen) $zen.querySelector('[data-act="zen-exit"]').focus({ preventScroll: true }); // keep keyboard focus inside the overlay
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && zenOpen) { zenOpen = false; renderZen(); } });
document.addEventListener('visibilitychange', () => { wakeLock = null; if (document.visibilityState === 'visible' && zenOpen) keepAwake(true); });

function openFocusSetup() {
  const goals = activeGoals();
  const opt = (v, label, on) => `<label class="opt"><input type="radio" name="target" value="${v}"${on ? ' checked' : ''}><span>${label}</span></label>`;
  $sheet.redraw = null;
  $sheet.innerHTML = `<form id="focusf">
    <h2>Sesión de enfoque</h2>
    <fieldset><legend>Duración</legend><div class="opts">
      ${opt('pomo', 'Pomodoro: 25 minutos y descansos', true)}${opt(25, '25 minutos')}${opt(50, '50 minutos')}${opt(90, '90 minutos')}${opt('', 'Sin límite')}</div></fieldset>
    ${goals.length ? `<fieldset><legend>¿Para qué meta?</legend><div class="opts">
      <label class="opt"><input type="radio" name="goal" value="" checked><span>Ninguna en concreto</span></label>
      ${goals.map(g => `<label class="opt"><input type="radio" name="goal" value="${g.id}"><span>${esc(g.title)}</span></label>`).join('')}</div></fieldset>` : ''}
    <div class="row"><button class="btn">Empezar</button><button type="button" class="btn ghost" data-act="close">Cancelar</button></div>
  </form>`;
  $sheet.querySelector('#focusf').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const pomo = f.get('target') === 'pomo';
    state.timer = { start: new Date().toISOString(), target: pomo ? 25 : +f.get('target') || null, goal: f.get('goal') || null, ...(pomo && { phase: 'work', pomo: 0 }) };
    buzzed = false;
    zenOpen = pomo;
    save(state);
    $sheet.close();
    render();
  };
  $sheet.showModal();
}

function stopFocus(keep) {
  if (isPomo(state.timer) && state.timer.phase !== 'work') { state.timer = null; zenOpen = false; save(state); return render(); }
  const t = state.timer, mins = Math.round((Date.now() - Date.parse(t.start)) / 60000);
  if (!keep && mins >= 1 && !confirm(`¿Descartar esta sesión de ${dur(mins)}? No se guardará.`)) return;
  if (keep && mins < 1) alert('Las sesiones de menos de un minuto no se guardan.');
  if (keep && mins >= 1) state.focus.push({ start: t.start, mins, goal: t.goal });
  state.timer = null;
  zenOpen = false;
  save(state);
  render();
}

// ---- Analysis
const fmt1 = n => fmt(Math.round(n * 10) / 10);
const short = k => parseYmd(k).toLocaleDateString('es', { day: 'numeric', month: 'short' });
const lastDays = (n, end = new Date()) => Array.from({ length: n }, (_, i) => ymd(addDays(end, i - n + 1)));

// Single-series line chart: ink line, recessive grid, tap or drag to read any day.
const CW = 320, CH = 128, PL = 30, PR = 8, PT = 10, PB = 20;
const charts = new Map();
function lineChart(id, title, pts, { min, max, show }) {
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

function scrub(e) {
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

const tile = (label, value, before) => (value === null ? '' : `<li class="tile panel"><span class="hmeta">${label}</span><b>${value}</b>${before ? `<small>${before}</small>` : ''}</li>`);
const meter = (name, pct, figure, note, sw = '') =>
  `<li class="meter">${sw}<span>${name}</span><b>${figure}</b><i class="track"><i style="--p:${Math.max(0, Math.min(1, pct))}"></i></i>${note ? `<small>${note}</small>` : ''}</li>`;

function habitRate(keys) {
  let ok = 0, all = 0;
  for (const h of state.habits) {
    const ps = info(h).ps.filter(p => ymd(p.start) >= keys[0] && ymd(p.start) <= keys.at(-1));
    all += ps.length;
    ok += ps.filter(p => p.ok).length;
  }
  return all ? Math.round((100 * ok) / all) : null;
}
const avgK = (keys, f) => mean(keys.map(f).filter(v => v !== null && v !== undefined));
const sleepOf = k => sleepMins(entryOf(k)?.bed, entryOf(k)?.wake);

function insights(keys) {
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

function viewAnalisis() {
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

const views = { hoy: viewHoy, rachas: () => (calMode === 'mes' ? viewMes() : calMode === 'ano' ? viewAno() : viewAnalisis()), diario: viewDiario, metas: viewMetas, habitos: viewHabitos };

// `enter` replays the ink-stroke reveal; only on navigation, never on a check-in.
function render(enter = false) {
  cache = new Map();
  renderZen();
  $view.classList.toggle('enter', enter && !reduceMotion.matches);
  $view.innerHTML = views[tab]();
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
}

function toggle(hid, key) {
  const set = state.done[hid];
  if (!set) return;
  set.has(key) ? set.delete(key) : set.add(key);
  cache = new Map();
  save(state);
}

function openDay(key) {
  const d = parseYmd(key);
  const draw = () => {
    $sheet.innerHTML = `<form method="dialog">
      <h2>${d.getDate()} de ${MONTHS[d.getMonth()]}</h2>
      <ul class="habits">${state.habits.map(h => {
        const on = setOf(h).has(key);
        return `<li><button type="button" class="habit compact panel${on ? ' on' : ''}" data-act="toggle" data-h="${h.id}" data-d="${key}" aria-pressed="${on}">
          <span class="check" aria-hidden="true"></span><span class="hname">${esc(h.name)}</span></button></li>`;
      }).join('')}</ul>
      ${scales(key)}${sleepLine(key)}${metricRows(key)}
      <div class="row"><button type="button" class="btn ghost" data-act="entry" data-d="${key}">${state.journal[key]?.text || Object.keys(state.journal[key]?.answers ?? {}).length ? 'Ver entrada del diario' : 'Escribir en el diario'}</button>
      <button class="btn">Listo</button></div></form>`;
  };
  $sheet.redraw = draw;
  draw();
  $sheet.showModal();
}

function openEditor(h) {
  const tone = h?.tone ?? state.habits.length % TONES;
  const fq = h?.freq ?? { type: 'daily' };
  const days = fq.type === 'days' ? fq.days : [0, 1, 2, 3, 4];
  const times = fq.type === 'weekly' ? fq.times : 3;
  const radio = (v, label) => `<label class="opt"><input type="radio" name="ftype" value="${v}"${fq.type === v ? ' checked' : ''}><span>${label}</span></label>`;
  $sheet.redraw = null;
  $sheet.innerHTML = `<form id="editor">
    <h2${h ? ' tabindex="-1" autofocus' : ''}>${h ? 'Editar hábito' : 'Nuevo hábito'}</h2>
    <label class="field">Nombre<input name="name" required maxlength="60" value="${h ? esc(h.name) : ''}" placeholder="Leer 20 minutos" autocomplete="off"></label>
    <fieldset class="freq"><legend>Frecuencia</legend>
      <div class="opts">${radio('daily', 'Diario')}${radio('days', 'Días concretos')}${radio('weekly', 'Veces por semana')}</div>
      <div class="when-days weekdays" role="group" aria-label="Días">${WD.map((d, i) => `<label><input type="checkbox" name="days" value="${i}"${days.includes(i) ? ' checked' : ''}><span>${d}</span></label>`).join('')}</div>
      <label class="when-weekly field inline">Veces por semana<input type="number" name="times" min="1" max="6" value="${times}" inputmode="numeric"></label>
    </fieldset>
    <fieldset><legend>Trama</legend><div class="tones">
      ${TONE_NAMES.map((n, i) => `<label><input type="radio" name="tone" value="${i}"${i === tone ? ' checked' : ''}><i class="sw t${i}"></i><span>${n}</span></label>`).join('')}
    </div></fieldset>
    <div class="row"><button class="btn">${h ? 'Guardar' : 'Crear hábito'}</button>
    <button type="button" class="btn ghost" data-act="close">Cancelar</button></div>
    ${h ? `<button type="button" class="link danger" data-act="delete" data-h="${h.id}">Borrar hábito</button>` : ''}
  </form>`;
  $sheet.querySelector('#editor').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = f.get('name').trim();
    if (!name) return;
    const freq = cleanFreq({ type: f.get('ftype'), days: f.getAll('days').map(Number), times: +f.get('times') });
    if (f.get('ftype') !== freq.type) return alert(f.get('ftype') === 'days' ? 'Elige al menos un día.' : 'Las veces por semana van de 1 a 6.');
    if (h) Object.assign(h, { name, tone: +f.get('tone'), freq });
    else {
      const id = crypto.randomUUID();
      state.habits.push({ id, name, tone: +f.get('tone'), freq, createdAt: new Date().toISOString() });
      state.done[id] = new Set();
      navigator.storage?.persist?.(); // asks the browser not to evict our data
    }
    save(state);
    $sheet.close();
    render();
  };
  $sheet.showModal();
}

async function exportBackup() {
  const prev = state.lastBackup;
  state.lastBackup = new Date().toISOString();
  const name = `HabyssT-${ymd(new Date())}.json`;
  const file = new File([JSON.stringify(toJSON(state), null, 1)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Respaldo de HabyssT' });
    else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  } catch (e) {
    state.lastBackup = prev;
    if (e.name !== 'AbortError') alert(`No se pudo exportar: ${e.message}`);
    return;
  }
  save(state);
  render();
}

async function importBackup(file) {
  try {
    const next = fromJSON(JSON.parse(await file.text()));
    const days = next.habits.reduce((n, h) => n + next.done[h.id].size, 0);
    if (!confirm(`Este respaldo tiene ${plural(next.habits.length, 'hábito', 'hábitos')} y ${days} registros. Reemplazará los datos de este teléfono. ¿Importar?`)) return;
    state = next;
    save(state);
    render();
  } catch (e) {
    alert(e instanceof SyntaxError ? 'El archivo está dañado o no es JSON.' : e.message);
  }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act], [data-tab]');
  if (!el) {
    if (e.target === $sheet) $sheet.close(); // tap on backdrop
    return;
  }
  if (el.tagName === 'BUTTON' && el.closest('summary')) e.preventDefault();
  if (el.dataset.tab) {
    const next = el.dataset.tab;
    if (next === tab) return;
    return go(() => { tab = next; if (tab === 'rachas') cursor = new Date(); render(true); }, TABS.indexOf(next) > TABS.indexOf(tab) ? 'fwd' : 'back');
  }
  const { act, h, d } = el.dataset;
  const step = calMode === 'ano' ? 12 : 1;
  switch (act) {
    case 'toggle': {
      const rows = () => document.querySelectorAll('#view .habits [data-act="toggle"]');
      const before = new Map([...rows()].map(b => [b.dataset.h, b.getBoundingClientRect().top]));
      toggle(h, d);
      if ($sheet.open && $sheet.redraw) $sheet.redraw();
      render();
      if (!reduceMotion.matches) rows().forEach(b => {
        const dy = (before.get(b.dataset.h) ?? NaN) - b.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) b.parentElement.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
          { duration: 460, delay: 90, fill: 'backwards', easing: 'cubic-bezier(0.77, 0, 0.175, 1)' });
      });
      // Animate only the check-in that changed, not the whole list.
      document.querySelectorAll(`[data-act="toggle"][data-h="${h}"][data-d="${d}"]`).forEach(b => b.classList.add('pop'));
      // Closing the last habit due today is worth a mark, once.
      const now = new Date(), due = state.habits.filter(x => dueOn(x, now));
      if (d === ymd(now) && setOf({ id: h }).has(d) && due.some(x => x.id === h) && due.every(x => setOf(x).has(d))) stamp('Día completo');
      return;
    }
    case 'day': return openDay(d);
    case 'prev': return go(() => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() - step, 1); render(true); }, 'back');
    case 'next': return go(() => { cursor = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1); render(true); }, 'fwd');
    case 'month': cursor = new Date(cursor.getFullYear(), +el.dataset.m, 1); tab = 'rachas'; calMode = 'mes'; return render(true);
    case 'yf': yearFilter = h; return render();
    case 'cal': { const order = ['mes', 'ano', 'analisis'], m = el.dataset.m; return go(() => { calMode = m; render(true); }, order.indexOf(m) > order.indexOf(calMode) ? 'fwd' : 'back'); }
    case 'range': return go(() => { anaDays = +el.dataset.n; render(true); }, anaDays < +el.dataset.n ? 'fwd' : 'back');
    case 'entry': return openEntry(d);
    case 'rate': return rate5(el.dataset.k, d, +el.dataset.v);
    case 'prompts': return savePrompts();
    case 'review': return openReview(d);
    case 'sleep': return openSleep(d);
    case 'editmode':
      editMode = editMode === el.dataset.k ? null : el.dataset.k;
      if (editMode) setUi({ closed: { ...ui.closed, [editMode]: false } });
      return render();
    case 'theme': return themeReveal(el.dataset.v, e.clientX, e.clientY);
    case 'focus-setup': return openFocusSetup();
    case 'focus-stop': return stopFocus(true);
    case 'focus-cancel': return stopFocus(false);
    case 'focus-end': return stopFocus(true);
    case 'focus-next': Object.assign(state.timer, { phase: 'work', target: 25, start: new Date().toISOString() }); save(state); return render();
    case 'zen': zenOpen = true; return renderZen();
    case 'zen-exit': zenOpen = false; return renderZen();
    case 'sleep-clear': setEntry(d, { bed: null, wake: null, sleep: null }); save(state); $sheet.close(); return render();
    case 'metric': return openMetric(el.dataset.m, d);
    case 'metric-new': return openMetricEditor();
    case 'metric-edit': return openMetricEditor(state.metrics.find(m => m.id === el.dataset.m));
    case 'metric-clear': delete state.values[el.dataset.m]?.[d]; save(state); $sheet.close(); return render();
    case 'metric-delete': {
      const m = state.metrics.find(x => x.id === el.dataset.m);
      if (!confirm(`¿Borrar "${m.name}" y todos sus valores? No se puede deshacer.`)) return;
      state.metrics = state.metrics.filter(x => x !== m);
      delete state.values[m.id];
      save(state);
      $sheet.close();
      return render();
    }
    case 'review-done': return finishReview(d);
    case 'new': return openEditor();
    case 'edit': return openEditor(state.habits.find(x => x.id === h));
    case 'close': return $sheet.close();
    case 'export': return exportBackup();
    case 'goal': return openGoal(el.dataset.g);
    case 'goal-new': return openGoalEditor();
    case 'goal-edit': return openGoalEditor(state.goals.find(g => g.id === el.dataset.g));
    case 'goal-log': return logGoal(el.dataset.g);
    case 'goal-step': {
      const g = state.goals.find(x => x.id === el.dataset.g);
      const st = g.steps[+el.dataset.i];
      st.done = !st.done;
      save(state);
      $sheet.redraw();
      render();
      if (st.done) $sheet.querySelector(`[data-act="goal-step"][data-i="${el.dataset.i}"]`)?.classList.add('pop');
      return;
    }
    case 'goal-close': {
      const g = state.goals.find(x => x.id === el.dataset.g);
      Object.assign(g, { status: el.dataset.s, closedAt: ymd(new Date()) });
      save(state);
      $sheet.close();
      render();
      if (g.status === 'done') stamp('Lograda');
      return;
    }
    case 'goal-reopen': {
      if (activeGoals().length >= MAX_GOALS) return alert(`Ya tienes ${MAX_GOALS} metas activas. Cierra una antes de reactivar esta.`);
      Object.assign(state.goals.find(x => x.id === el.dataset.g), { status: 'active', closedAt: null });
      save(state);
      $sheet.redraw();
      return render();
    }
    case 'goal-delete': {
      const g = state.goals.find(x => x.id === el.dataset.g);
      if (!confirm(`¿Borrar la meta "${g.title}"? No se puede deshacer.`)) return;
      state.goals = state.goals.filter(x => x !== g);
      save(state);
      $sheet.close();
      return render();
    }
    case 'delete': {
      const habit = state.habits.find(x => x.id === h);
      if (!confirm(`¿Borrar "${habit.name}" y todo su historial? No se puede deshacer.`)) return;
      state.habits = state.habits.filter(x => x.id !== h);
      delete state.done[h];
      state.goals.forEach(g => (g.habits = g.habits.filter(x => x !== h)));
      save(state);
      $sheet.close();
      return render();
    }
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'import' && e.target.files[0]) importBackup(e.target.files[0]);
});

// Re-render when returning to the app so "today" is correct after midnight.
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && !$sheet.open && render());

// Theme: 'system' follows the phone; the choice is per device, like the collapsed panels.
function setTheme(v) {
  setUi({ theme: v });
  if (v === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = v;
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', paper));
}
if (ui.theme && ui.theme !== 'system') setTheme(ui.theme);

// <details> toggle does not bubble, so listen in the capture phase.
document.addEventListener('toggle', e => {
  if (e.target.id?.startsWith('fold-')) setUi({ closed: { ...ui.closed, [e.target.id.slice(5)]: !e.target.open } });
}, true);

// ---- Motion helpers
const TABS = ['hoy', 'rachas', 'diario', 'metas', 'habitos'];
// Page changes slide in the direction you moved; the tab bar stays put. Falls back to an instant swap.
function go(update, dir = '') {
  if (!document.startViewTransition || reduceMotion.matches) return update();
  document.documentElement.dataset.dir = dir;
  document.startViewTransition(update);
}

// The new theme spreads from the button you pressed.
function themeReveal(v, x, y) {
  const apply = () => { setTheme(v); render(); };
  if (!document.startViewTransition || reduceMotion.matches) return apply();
  document.documentElement.dataset.dir = 'theme';
  const t = document.startViewTransition(apply);
  t.ready.then(() => {
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.documentElement.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 560, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', pseudoElement: '::view-transition-new(root)' });
  });
}

// Sheets: drag the handle or title down to dismiss. A quick flick is enough; dragging up meets friction.
new MutationObserver(() => {
  if (!$sheet.querySelector(':scope > .grab')) $sheet.insertAdjacentHTML('afterbegin', '<div class="grab" aria-hidden="true"></div>');
}).observe($sheet, { childList: true });
let drag = null;
$sheet.addEventListener('pointerdown', e => {
  if (!e.target.closest('.grab, #sheet > form > h2')) return;
  drag = { y: e.clientY, t: performance.now(), dy: 0 };
  $sheet.setPointerCapture(e.pointerId);
  $sheet.style.transition = 'none';
});
$sheet.addEventListener('pointermove', e => {
  if (!drag) return;
  const dy = e.clientY - drag.y;
  drag.dy = dy > 0 ? dy : dy / 6;
  $sheet.style.transform = `translateY(${drag.dy}px)`;
});
function release() {
  if (!drag) return;
  const { dy, t } = drag, v = dy / (performance.now() - t);
  drag = null;
  const done = ms => setTimeout(() => { $sheet.style.transition = ''; $sheet.style.transform = ''; }, ms);
  if (dy > 120 || (dy > 24 && v > 0.11)) {
    $sheet.style.transition = 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)';
    $sheet.style.transform = 'translateY(100%)';
    setTimeout(() => $sheet.close(), 200);
    done(420);
  } else {
    $sheet.style.transition = 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)';
    $sheet.style.transform = '';
    done(320);
  }
}
$sheet.addEventListener('pointerup', release);
$sheet.addEventListener('pointercancel', release);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
render(true);
