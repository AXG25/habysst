import { mottoOf } from './mottos.js';
import { ymd, parseYmd } from './logic.js';
import { save, snapshot, cleanFreq, cleanReminders, MAX_REMINDERS, TONES } from './store.js';
import { blocker, enable } from './avisos.js';
import { $sheet, DAYS, MONTHS, TONE_NAMES, WD, cap, esc, fold, header, radio, setUi, stamp, ui } from './ui.js';
import { dueOn, freqLabel, info, resetCache, setOf, state, unit, weekCount } from './core.js';
import { glide } from './motion.js';
import { checkIn, metricRows, scales, sleepLine } from './registro.js';
import { reviewNotice } from './revisiones.js';
import { focusBox } from './enfoque.js';
import { render } from './app.js';

export let editMode = null; // 'habits' | 'metrics' while editing from Hoy

function backupNote(now) {
  const daysSince = state.lastBackup ? Math.floor((now - new Date(state.lastBackup)) / 864e5) : null;
  return daysSince === null || daysSince >= 7
    ? `<button class="note" data-act="export">${daysSince === null ? 'Aún no tienes respaldo.' : `Último respaldo hace ${daysSince} días.`} Exportar ahora</button>`
    : '';
}

// Reorder habits: the order of state.habits is the order everywhere, and it is saved with the data.
function moveHabit(id, to) {
  const from = state.habits.findIndex(h => h.id === id);
  if (from < 0 || to < 0 || to >= state.habits.length || to === from) return false;
  state.habits.splice(to, 0, ...state.habits.splice(from, 1));
  save(state);
  return true;
}

document.addEventListener('keydown', e => {
  const g = e.target.closest?.('.grip');
  if (!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const id = g.dataset.h;
  if (moveHabit(id, state.habits.findIndex(h => h.id === id) + (e.key === 'ArrowUp' ? -1 : 1))) {
    render();
    document.querySelector(`.grip[data-h="${id}"]`)?.focus();
  }
});

// Drag by the handle: the row follows the finger, its neighbours slide out of the way, and the drop saves.
let drag = null;
document.addEventListener('pointerdown', e => {
  const g = e.target.closest?.('.grip');
  if (!g || drag) return; // one finger at a time
  const li = g.closest('.sortable'), rows = [...li.parentElement.children];
  const rects = rows.map(r => r.getBoundingClientRect()), from = rows.indexOf(li);
  // Rows differ in height (long names wrap): neighbours move by the dragged row's height plus the gap.
  const gap = rows.length > 1 ? rects[1].top - rects[0].bottom : 0;
  drag = { li, rows, mids: rects.map(r => (r.top + r.bottom) / 2), shift: rects[from].height + gap, from, to: from, y: e.clientY, id: e.pointerId };
  g.setPointerCapture(e.pointerId);
  li.classList.add('lifted');
});
document.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const { li, rows, mids, shift, from } = drag, dy = e.clientY - drag.y, centre = mids[from] + dy;
  // The new slot: how many other rows' midpoints the dragged row's centre has passed.
  drag.to = from + mids.filter((m, i) => i > from && centre > m).length - mids.filter((m, i) => i < from && centre < m).length;
  li.style.transform = `translateY(${dy}px)`;
  rows.forEach((r, i) => {
    if (r === li) return;
    const s = i > from && i <= drag.to ? -shift : i < from && i >= drag.to ? shift : 0;
    r.style.transform = s ? `translateY(${s}px)` : '';
  });
});
const drop = e => {
  if (!drag || e.pointerId !== drag.id) return;
  const { li, to } = drag;
  drag = null;
  // Measure where the rows are drawn now, then let glide settle them into the new order.
  glide('.sortable', 'h', () => {
    if (e.type === 'pointercancel' || !moveHabit(li.dataset.h, to)) li.parentElement.querySelectorAll('.sortable').forEach(r => { r.style.transform = ''; r.classList.remove('lifted'); });
    else render();
  });
};
document.addEventListener('pointerup', drop);
document.addEventListener('pointercancel', drop);

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
  const editItem = h => `<li class="sortable" data-h="${h.id}">
    <button class="grip" data-h="${h.id}" aria-label="Mover ${esc(h.name)}. Flechas arriba y abajo para cambiar su lugar"></button>
    <button class="habit panel editing" data-act="edit" data-h="${h.id}">
      <i class="sw t${h.tone}"></i><span class="hname">${esc(h.name)}</span><span class="hmeta">${freqLabel(h.freq)}</span><span class="link">Editar</span></button></li>`;
  if (editMode === 'habits') return top + backupNote(now) + fold('habits', 'Hábitos', 'Arrastra para ordenar', secActions('habits'), `
    <ul class="habits sortlist">${state.habits.map(editItem).join('')}</ul>`) + checkIn(key) + metricsSec + bottom;
  const item = (h, i) => {
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
  return top + backupNote(now) + fold('habits', 'Hábitos', `${doneToday} de ${due.length} hechos`, secActions('habits'), `
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
    <fieldset class="reminders"><legend>Recordatorios</legend>
      <div class="rems">${(h?.reminders ?? []).map(r => reminderRow(r.t, r.d, r.msg)).join('')}</div>
      <button type="button" class="link" data-add-rem>Añadir recordatorio</button>
      ${blocker() ? `<p class="muted small">${blocker()}</p>` : ''}
    </fieldset>
    <fieldset><legend>Trama</legend><div class="tones">
      ${TONE_NAMES.map((n, i) => `<label><input type="radio" name="tone" value="${i}"${i === tone ? ' checked' : ''}><i class="sw t${i}"></i><span>${n}</span></label>`).join('')}
    </div></fieldset>
    <div class="row"><button class="btn">${h ? 'Guardar' : 'Crear hábito'}</button>
    <button type="button" class="btn ghost" data-act="close">Cancelar</button></div>
    ${h ? `<button type="button" class="link danger" data-act="delete" data-h="${h.id}">Borrar hábito</button>` : ''}
  </form>`;
  const form = $sheet.querySelector('#editor'), rems = form.querySelector('.rems'), add = form.querySelector('[data-add-rem]');
  const fit = () => (add.hidden = rems.children.length >= MAX_REMINDERS);
  fit();
  add.onclick = () => {
    rems.insertAdjacentHTML('beforeend', reminderRow('09:00', fq.type === 'days' ? fq.days : [0, 1, 2, 3, 4, 5, 6]));
    rems.lastElementChild.querySelector('input').focus();
    fit();
  };
  rems.onclick = e => { if (e.target.closest('[data-rm]')) { e.target.closest('.rem').remove(); fit(); } };
  form.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = f.get('label').trim();
    if (!name) return;
    const freq = cleanFreq({ type: f.get('ftype'), days: f.getAll('days').map(Number), times: +f.get('times') });
    if (f.get('ftype') !== freq.type) return alert(f.get('ftype') === 'days' ? 'Elige al menos un día.' : 'Las veces por semana van de 1 a 6.');
    const rows = [...rems.children].map(r => ({ t: r.querySelector('input[type=time]').value, d: [...r.querySelectorAll(':checked')].map(x => +x.value), msg: r.querySelector('input[type=text]').value }));
    if (rows.some(r => !r.t)) return alert('Pon la hora de cada recordatorio.');
    if (rows.some(r => !r.d.length)) return alert('Elige al menos un día para cada recordatorio.');
    const reminders = cleanReminders(rows);
    if (h) Object.assign(h, { name, tone: +f.get('tone'), freq, reminders });
    else {
      const id = crypto.randomUUID();
      state.habits.push({ id, name, tone: +f.get('tone'), freq, reminders, createdAt: new Date().toISOString() });
      state.done[id] = new Set();
      navigator.storage?.persist?.(); // asks the browser not to evict our data
    }
    save(state);
    $sheet.close();
    render();
    // Still inside the tap, so the phone can show its permission prompt.
    if (reminders.length && !blocker() && Notification.permission === 'default') enable(state.habits).then(msg => msg && alert(msg));
  };
  $sheet.showModal();
}

const reminderRow = (t, days, msg = '') => `<div class="rem">
  <input type="time" value="${t}" aria-label="Hora" required>
  <div class="weekdays" role="group" aria-label="Días del recordatorio">${WD.map((d, i) => `<label><input type="checkbox" value="${i}"${days.includes(i) ? ' checked' : ''}><span>${d}</span></label>`).join('')}</div>
  <button type="button" class="link danger" data-rm>Quitar</button>
  <label class="field rem-msg">Mensaje (opcional)<input type="text" maxlength="80" value="${esc(msg)}" placeholder="¿Ya leíste tus 20 páginas?" autocomplete="off"></label>
</div>`;


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
