import { ymd, addDays, parseYmd, runs, longestRun, streaks, weeksOfMonth, monthRow } from './logic.js';
import { load, save, fromJSON, toJSON, TONES } from './store.js';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const TONE_NAMES = ['Tinta', 'Puntos', 'Diagonal', 'Rejilla', 'Rayado', 'Rojo'];

let state = load();
let tab = 'hoy';
let cursor = new Date();
let yearFilter = 'all';

const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const esc = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const setOf = h => (state.done[h.id] ??= new Set());
const cap = s => s[0].toUpperCase() + s.slice(1);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One bar per streak run. `cl`/`cr` mark a run that continues past the row edge.
function bars(days, h, row, colOffset = 0) {
  const set = setOf(h);
  return runs(days, set).map(([s, e]) => {
    const cl = (s === 0 || !days[s - 1]) && set.has(ymd(addDays(days[s], -1)));
    const cr = (e === days.length - 1 || !days[e + 1]) && set.has(ymd(addDays(days[e], 1)));
    return `<i class="bar t${h.tone}${cl ? ' cl' : ''}${cr ? ' cr' : ''}" style="grid-row:${row};grid-column:${s + 1 + colOffset}/${e + 2 + colOffset}"></i>`;
  }).join('');
}

const header = (title, sub, nav = '') =>
  `<header class="hero">${nav ? `<button class="nav" data-act="prev" aria-label="Anterior">‹</button>` : ''}
    <div><h1>${title}</h1><p>${sub}</p></div>
    ${nav ? `<button class="nav" data-act="next" aria-label="Siguiente">›</button>` : ''}</header>`;

const emptyState = `<section class="empty panel">
  <p>Todavía no tienes hábitos.</p>
  <button class="btn" data-act="new">Crear hábito</button></section>`;

function viewHoy() {
  const now = new Date(), key = ymd(now);
  const head = header(`${DAYS[now.getDay()]} ${now.getDate()}`, `${cap(MONTHS[now.getMonth()])} ${now.getFullYear()}`);
  if (!state.habits.length) return head + emptyState;

  const strip = Array.from({ length: 14 }, (_, i) => addDays(now, i - 13));
  const doneToday = state.habits.filter(h => setOf(h).has(key)).length;
  const daysSince = state.lastBackup ? Math.floor((now - new Date(state.lastBackup)) / 864e5) : null;
  const backupNote = daysSince === null || daysSince >= 7
    ? `<button class="note" data-act="export">${daysSince === null ? 'Aún no tienes respaldo.' : `Último respaldo hace ${daysSince} días.`} Exportar ahora</button>`
    : '';

  return head + `<p class="count">${doneToday} de ${state.habits.length} hechos hoy</p>${backupNote}
  <ul class="habits">${state.habits.map(h => {
    const on = setOf(h).has(key);
    const { cur, best } = streaks(setOf(h), now);
    return `<li><button class="habit panel${on ? ' on' : ''}" data-act="toggle" data-h="${h.id}" data-d="${key}" aria-pressed="${on}">
      <span class="check" aria-hidden="true"></span>
      <span class="hname">${esc(h.name)}</span>
      <span class="hmeta">Racha ${plural(cur, 'día', 'días')}. Mejor: ${best}</span>
      <span class="strip" aria-hidden="true">${bars(strip, h, 1)}</span>
    </button></li>`;
  }).join('')}</ul>`;
}

function viewMes() {
  const y = cursor.getFullYear(), m = cursor.getMonth(), t = ymd(new Date()), hs = state.habits;
  const head = header(cap(MONTHS[m]), String(y), true);
  if (!hs.length) return head + emptyState;
  const weeks = weeksOfMonth(y, m);
  const monthDays = weeks.flat().filter(Boolean);
  const elapsed = monthDays.filter(d => ymd(d) <= t).length;

  return head + `<div class="cal panel">
    <div class="wd">${WD.map(d => `<span>${d}</span>`).join('')}</div>
    ${weeks.map(w => `<div class="wk" style="--n:${hs.length}">
      ${w.map((d, i) => {
        if (!d) return `<span class="day pad" style="grid-column:${i + 1}"></span>`;
        const k = ymd(d);
        return `<button class="day${k === t ? ' today' : ''}" style="grid-column:${i + 1}" data-act="day" data-d="${k}"${k > t ? ' disabled' : ''} aria-label="${d.getDate()} de ${MONTHS[m]}"><span>${d.getDate()}</span></button>`;
      }).join('')}
      ${hs.map((h, j) => bars(w, h, j + 2)).join('')}
    </div>`).join('')}
  </div>
  <ul class="legend">${hs.map(h => {
    const n = monthDays.filter(d => setOf(h).has(ymd(d))).length;
    return `<li><i class="sw t${h.tone}"></i><span>${esc(h.name)}</span><b>${n}/${elapsed}</b><small>Mejor racha del mes: ${longestRun(monthDays, setOf(h))}</small></li>`;
  }).join('')}</ul>`;
}

function viewAno() {
  const y = cursor.getFullYear(), t = ymd(new Date());
  const head = header(String(y), 'Rachas del año', true);
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
      return `<button class="yr" data-act="month" data-m="${m}" style="--n:${hs.length};--lane:${lane}px" aria-label="Ver ${name}">
        <span class="ml">${name.slice(0, 3)}</span><i class="ticks"></i>${voids}${fut}
        ${hs.map((h, j) => bars(days, h, j + 1, 1)).join('')}</button>`;
    }).join('')}
  </div>
  <ul class="legend">${hs.map(h => {
    const n = yearDays.filter(d => setOf(h).has(ymd(d))).length;
    return `<li><i class="sw t${h.tone}"></i><span>${esc(h.name)}</span><b>${plural(n, 'día', 'días')}</b><small>Mejor racha del año: ${longestRun(yearDays, setOf(h))}</small></li>`;
  }).join('')}</ul>`;
}

function viewHabitos() {
  const last = state.lastBackup ? new Date(state.lastBackup).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : 'nunca';
  return header('Hábitos', plural(state.habits.length, 'activo', 'activos')) + `
  <ul class="manage">${state.habits.map(h => `<li class="panel">
    <i class="sw t${h.tone}"></i><span>${esc(h.name)}</span>
    <button class="link" data-act="edit" data-h="${h.id}">Editar</button></li>`).join('')}</ul>
  <button class="btn wide" data-act="new">Crear hábito</button>
  <section class="panel backup">
    <h2>Respaldo</h2>
    <p>Tus datos se guardan solo en este teléfono. Exporta un respaldo y guárdalo en Drive, en tu correo o en Archivos. Para pasar tus datos a otro teléfono, importa ese archivo allí.</p>
    <p class="muted">Último respaldo: ${last}</p>
    <div class="row"><button class="btn" data-act="export">Exportar respaldo</button>
    <label class="btn ghost">Importar respaldo<input type="file" accept="application/json,.json" id="import" hidden></label></div>
  </section>`;
}

const views = { hoy: viewHoy, mes: viewMes, ano: viewAno, habitos: viewHabitos };

function render() {
  $view.innerHTML = views[tab]();
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
}

function toggle(hid, key) {
  const set = state.done[hid];
  if (!set) return;
  set.has(key) ? set.delete(key) : set.add(key);
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
      <button class="btn wide">Listo</button></form>`;
  };
  $sheet.redraw = draw;
  draw();
  $sheet.showModal();
}

function openEditor(h) {
  const tone = h?.tone ?? state.habits.length % TONES;
  $sheet.redraw = null;
  $sheet.innerHTML = `<form id="editor">
    <h2>${h ? 'Editar hábito' : 'Nuevo hábito'}</h2>
    <label class="field">Nombre<input name="name" required maxlength="60" value="${h ? esc(h.name) : ''}" placeholder="Leer 20 minutos" autocomplete="off"></label>
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
    if (h) Object.assign(h, { name, tone: +f.get('tone') });
    else {
      const id = crypto.randomUUID();
      state.habits.push({ id, name, tone: +f.get('tone'), createdAt: new Date().toISOString() });
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
  const name = `habysst-${ymd(new Date())}.json`;
  const file = new File([JSON.stringify(toJSON(state), null, 1)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Respaldo de Habysst' });
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
  if (el.dataset.tab) {
    tab = el.dataset.tab;
    if (tab === 'mes' || tab === 'ano') cursor = new Date();
    return render();
  }
  const { act, h, d } = el.dataset;
  const step = tab === 'ano' ? 12 : 1;
  switch (act) {
    case 'toggle':
      toggle(h, d);
      $sheet.open && $sheet.redraw ? $sheet.redraw() : null;
      return render();
    case 'day': return openDay(d);
    case 'prev': cursor = new Date(cursor.getFullYear(), cursor.getMonth() - step, 1); return render();
    case 'next': cursor = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1); return render();
    case 'month': cursor = new Date(cursor.getFullYear(), +el.dataset.m, 1); tab = 'mes'; return render();
    case 'yf': yearFilter = h; return render();
    case 'new': return openEditor();
    case 'edit': return openEditor(state.habits.find(x => x.id === h));
    case 'close': return $sheet.close();
    case 'export': return exportBackup();
    case 'delete': {
      const habit = state.habits.find(x => x.id === h);
      if (!confirm(`¿Borrar "${habit.name}" y todo su historial? No se puede deshacer.`)) return;
      state.habits = state.habits.filter(x => x.id !== h);
      delete state.done[h];
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

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
render();
