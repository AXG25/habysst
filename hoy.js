import { mottoOf } from './mottos.js';
import { ymd, parseYmd } from './logic.js';
import { save, snapshot, cleanFreq, TONES } from './store.js';
import { $sheet, DAYS, MONTHS, TONE_NAMES, WD, cap, esc, fold, header, radio, setUi, stamp, ui } from './ui.js';
import { dueOn, freqLabel, info, resetCache, setOf, state, unit, weekCount } from './core.js';
import { glide } from './motion.js';
import { checkIn, metricRows, scales, sleepLine } from './registro.js';
import { reviewNotice } from './revisiones.js';
import { focusBox } from './enfoque.js';
import { render } from './app.js';

export let editMode = null; // 'habits' | 'metrics' while editing from Hoy

ui.closed ??= { checkin: !!ui.checkinClosed };

export const secActions = kind => {
  const has = kind === 'habits' ? state.habits.length : state.metrics.length;
  return `${has ? `<button class="link" data-act="editmode" data-k="${kind}" aria-pressed="${editMode === kind}">${editMode === kind ? 'Listo' : 'Editar'}</button>` : ''}
    <button class="add" data-act="${kind === 'habits' ? 'new' : 'metric-new'}" aria-label="${kind === 'habits' ? 'Añadir hábito' : 'Añadir métrica'}"></button>`;
};
// A section that folds; whether it is open is remembered per device.

export const emptyState = `<section class="empty panel">
  <p>Todavía no tienes hábitos.</p>
  <button class="btn" data-act="new">Crear hábito</button></section>`;


export function viewHoy() {
  const now = new Date(), key = ymd(now);
  const [la] = mottoOf(now);
  const motto = `<button class="motto" lang="la" data-act="motto" aria-label="Frase del día: ${la}. Ver su significado">${la}</button>`;
  const head = header(`${DAYS[now.getDay()]} ${now.getDate()}`, `${cap(MONTHS[now.getMonth()])} ${now.getFullYear()}${motto}`, '', true);
  const metricsSec = fold('metrics', 'Métricas', '', secActions('metrics'),
    state.metrics.length ? metricRows(key, editMode === 'metrics') : `<p class="muted">Añade algo que quieras medir con un número: peso, páginas leídas, dinero ahorrado.</p>`);
  // A running session sits on top; the start button sits at the bottom. Never both.
  const top = head + reviewNotice(now) + (state.timer ? focusBox(key) : '');
  const bottom = state.timer ? '' : focusBox(key);
  if (!state.habits.length) return top + fold('habits', 'Hábitos', '', secActions('habits'), emptyState) + checkIn(key) + metricsSec + bottom;

  const pendingFirst = list => [...list.filter(h => !setOf(h).has(key)), ...list.filter(h => setOf(h).has(key))];
  const due = pendingFirst(state.habits.filter(h => dueOn(h, now)));
  const rest = pendingFirst(state.habits.filter(h => !dueOn(h, now)));
  const doneToday = due.filter(h => setOf(h).has(key)).length;
  const item = (h, i) => {
    if (editMode === 'habits') return `<li><button class="habit panel editing" data-act="edit" data-h="${h.id}">
      <i class="sw t${h.tone}"></i><span class="hname">${esc(h.name)}</span><span class="hmeta">${freqLabel(h.freq)}</span><span class="link">Editar</span></button></li>`;
    const on = setOf(h).has(key);
    const { cur, best } = info(h);
    const weekly = h.freq.type === 'weekly';
    return `<li style="--r:${i}"><button class="habit panel${on ? ' on' : ''}" data-act="toggle" data-h="${h.id}" data-d="${key}" aria-pressed="${on}">
      <span class="check" aria-hidden="true"></span>
      <span class="hname">${esc(h.name)}</span>
      <span class="hmeta">${weekly ? `Semana ${weekCount(h, now)}/${h.freq.times}. Racha ${cur} sem., mejor ${best}` : `Racha ${unit(h, cur)}, mejor ${best}`}</span>
      <i class="sw dot t${h.tone}" aria-hidden="true"></i>
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
  ${bottom}`;
}


export function toggle(hid, key) {
  const set = state.done[hid];
  if (!set) return;
  set.has(key) ? set.delete(key) : set.add(key);
  resetCache();
  save(state);
}


export function openDay(key) {
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


export function openEditor(h) {
  const used = new Set(state.habits.map(x => x.tone));
  const tone = h?.tone ?? [...Array(TONES).keys()].find(i => !used.has(i)) ?? state.habits.length % TONES;
  const fq = h?.freq ?? { type: 'daily' };
  const days = fq.type === 'days' ? fq.days : [0, 1, 2, 3, 4];
  const times = fq.type === 'weekly' ? fq.times : 3;
  $sheet.redraw = null;
  $sheet.innerHTML = `<form id="editor">
    <h2${h ? ' tabindex="-1" autofocus' : ''}>${h ? 'Editar hábito' : 'Nuevo hábito'}</h2>
    <label class="field">Nombre<input name="label" required maxlength="60" value="${h ? esc(h.name) : ''}" placeholder="Leer 20 minutos" autocomplete="off"></label>
    <fieldset class="freq"><legend>Frecuencia</legend>
      <div class="opts">${radio('ftype', 'daily', 'Diario', fq.type === 'daily')}${radio('ftype', 'days', 'Días concretos', fq.type === 'days')}${radio('ftype', 'weekly', 'Veces por semana', fq.type === 'weekly')}</div>
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
    const name = f.get('label').trim();
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


export const actions = {
  'motto': () => {
    const [la, es, note] = mottoOf(new Date());
    $sheet.redraw = null;
    $sheet.innerHTML = `<form method="dialog" class="motto-sheet">
      <h2 tabindex="-1" autofocus lang="la">${la}</h2>
      <p class="motto-es">${es}</p>
      <p class="muted">${note}</p>
      <p class="muted small">Mañana, otra frase.</p>
      <div class="row"><button class="btn">Cerrar</button></div>
    </form>`;
    $sheet.showModal();
  },
  'toggle': (el, e) => { const { h, d } = el.dataset;
    glide('#view .habits [data-act="toggle"]', 'h', () => {
      toggle(h, d);
      if ($sheet.open && $sheet.redraw) $sheet.redraw();
      render();
    });
    // Animate only the check-in that changed, not the whole list.
    document.querySelectorAll(`[data-act="toggle"][data-h="${h}"][data-d="${d}"]`).forEach(b => b.classList.add('pop'));
    // Closing the last habit due today is worth a mark, once.
    const now = new Date(), due = state.habits.filter(x => dueOn(x, now));
    if (d === ymd(now) && setOf({ id: h }).has(d) && due.some(x => x.id === h) && due.every(x => setOf(x).has(d))) stamp('Día completo');
    return;
  },
  'day': (el, e) => { const { h, d } = el.dataset;
    return openDay(d);
  },
  'editmode': (el, e) => { 
    editMode = editMode === el.dataset.k ? null : el.dataset.k;
    if (editMode) setUi({ closed: { ...ui.closed, [editMode]: false } });
    return render();
  },
  'new': (el, e) => { 
    return openEditor();
  },
  'edit': (el, e) => { const { h, d } = el.dataset;
    return openEditor(state.habits.find(x => x.id === h));
  },
  'delete': (el, e) => { const { h, d } = el.dataset;
    const habit = state.habits.find(x => x.id === h);
    if (!confirm(`¿Borrar "${habit.name}" y todo su historial?`)) return;
    snapshot(state, `Antes de borrar el hábito «${habit.name}»`);
    state.habits = state.habits.filter(x => x.id !== h);
    delete state.done[h];
    state.goals.forEach(g => (g.habits = g.habits.filter(x => x !== h)));
    save(state);
    $sheet.close();
    return render();
  },
};
