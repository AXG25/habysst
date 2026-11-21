import { ymd, reviewPeriod, sleepMins } from './logic.js';
import { save, snapshot, cleanEntry } from './store.js';
import { $sheet, KINDS, LEVELS, cap, dur, esc, fmt, fold, header, longDate, plural } from './ui.js';
import { entryOf, state, unit, valOf } from './core.js';
import { PERIOD, reviewList } from './revisiones.js';
import { u } from './metas.js';
import { render } from './app.js';

// Five steps from sparse screentone to solid ink: the scale reads without color or faces.
export const scale5 = (kind, key) => {
  const v = entryOf(key)?.[kind] ?? null;
  return `<div class="scale" role="group" aria-label="${KINDS[kind]}">
    <span class="scale-l">${KINDS[kind]}</span>
    <div class="scale-b">${LEVELS.map((l, i) => `<button type="button" class="lv lv${i + 1}" data-act="rate" data-k="${kind}" data-d="${key}" data-v="${i + 1}" aria-pressed="${v === i + 1}" aria-label="${l}"></button>`).join('')}</div>
    <span class="scale-v">${v ? LEVELS[v - 1] : 'Sin marcar'}</span></div>`;
};

export const scales = key => `<div class="scales">${scale5('mood', key)}${scale5('energy', key)}</div>`;


export function checkIn(key) {
  const e = entryOf(key);
  const written = e?.text || Object.keys(e?.answers ?? {}).length;
  const sm = sleepMins(e?.bed, e?.wake);
  const summary = [e?.mood && `Ánimo: ${LEVELS[e.mood - 1].toLowerCase()}`, e?.energy && `Energía: ${LEVELS[e.energy - 1].toLowerCase()}`, sm && `Sueño: ${dur(sm)}`].filter(Boolean).join('. ') || 'Sin registrar todavía';
  return fold('checkin', 'Ánimo, energía y sueño', summary, '', `<div class="panel checkin-body">${scales(key)}${sleepLine(key)}
    <button class="link" data-act="entry" data-d="${key}">${written ? 'Seguir escribiendo' : 'Escribir en el diario'}</button></div>`);
}


export function setEntry(key, patch) {
  const next = cleanEntry({ ...(entryOf(key) ?? {}), ...patch });
  if (next) state.journal[key] = next;
  else delete state.journal[key];
}


export function rate5(kind, key, v) {
  setEntry(key, { [kind]: entryOf(key)?.[kind] === v ? null : v }); // tap again to clear
  save(state);
  if ($sheet.open && $sheet.redraw) $sheet.redraw();
  render();
}


export let pendingFlush = null; // typed text not yet saved; written immediately if the app goes to the background
// Saves a sheet's form shortly after each keystroke, and once more when the sheet closes, however it closes.

export function autosave(form, write) {
  let timer = null;
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    write(new FormData(form));
    save(state);
    form.querySelector('.saved').textContent = 'Guardado.';
  };
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(flush, 300); pendingFlush = () => timer && flush(); });
  $sheet.addEventListener('close', () => { if (timer) flush(); pendingFlush = null; render(); }, { once: true });
  return flush;
}


export function openEntry(key) {
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


export function entryCards(q) {
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


export function viewDiario() {
  const n = Object.keys(state.journal).length;
  return header('Diario', plural(n, 'entrada', 'entradas')) + `
    <div class="row stack"><button class="btn" data-act="entry" data-d="${ymd(new Date())}">${entryOf(ymd(new Date())) ? 'Seguir con la entrada de hoy' : 'Escribir la entrada de hoy'}</button>
    </div>
    <h2 class="sub">Revisar</h2>
    <div class="seg review-seg" role="group" aria-label="Revisar">${['week', 'month', 'quarter', 'year'].map(k => `<button data-act="review" data-d="${reviewPeriod(k, new Date()).key}">${cap(PERIOD[k].name)}</button>`).join('')}</div>
    ${reviewList()}
    <label class="field search">Buscar en el diario<input type="search" id="jsearch" placeholder="Palabra o frase" autocomplete="off"></label>
    <div id="entries">${entryCards('')}</div>
    <details class="closed"><summary>Preguntas guía</summary>
      <label class="field">Una por línea. Déjalo vacío si prefieres escribir libre.<textarea id="prompts" rows="4">${esc(state.prompts.join('\n'))}</textarea></label>
      <button class="btn" data-act="prompts">Guardar preguntas</button></details>`;
}


export function savePrompts() {
  state.prompts = document.getElementById('prompts').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 8);
  save(state);
  render();
}


document.addEventListener('input', e => {
  if (e.target.id === 'jsearch') document.getElementById('entries').innerHTML = entryCards(e.target.value);
});


export function sleepLine(key) {
  const e = entryOf(key), mins = sleepMins(e?.bed, e?.wake);
  const txt = mins ? `${dur(mins)}${e.sleep ? `. Calidad: ${LEVELS[e.sleep - 1].toLowerCase()}` : ''}` : 'Sin registrar';
  return `<button class="sleep-line" data-act="sleep" data-d="${key}"><span class="scale-l">Sueño</span><span>${txt}</span><span class="link">${mins ? 'Editar' : 'Registrar'}</span></button>`;
}


export function lastSleep() {
  const k = Object.keys(state.journal).sort().reverse().find(k => state.journal[k].bed);
  return k ? state.journal[k] : { bed: '23:30', wake: '07:00' };
}


export function openSleep(key) {
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


export function lastValue(m, before) {
  const k = Object.keys(state.values[m.id] ?? {}).filter(k => k < before).sort().at(-1);
  return k ? state.values[m.id][k] : null;
}

export function metricRows(key, editing = false) {
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
export function history(m) {
  const rows = Object.entries(state.values[m.id] ?? {}).sort((a, b) => b[0].localeCompare(a[0]));
  if (!rows.length) return '';
  const u = m.unit ? ` ${esc(m.unit)}` : '';
  return `<h3>Historial</h3><ul class="log">${rows.slice(0, 10).map(([k, v], i) => {
    const prev = rows[i + 1]?.[1], diff = prev === undefined ? '' : v - prev;
    return `<li><span>${longDate(k)}</span><b>${fmt(v)}${u}${diff ? `<small> (${diff > 0 ? '+' : ''}${fmt(Math.round(diff * 100) / 100)})</small>` : ''}</b></li>`;
  }).join('')}</ul>
  <p class="muted small">${rows.length > 10 ? `Mostrando 10 de ${rows.length} registros. ` : ''}La gráfica completa está en Progreso, Análisis.</p>`;
}


export function openMetric(id, key) {
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


export function openMetricEditor(m) {
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


addEventListener('pagehide', () => pendingFlush?.());

document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && pendingFlush?.());


export const actions = {
  'entry': (el, e) => { const { h, d } = el.dataset;
    return openEntry(d);
  },
  'rate': (el, e) => { const { h, d } = el.dataset;
    return rate5(el.dataset.k, d, +el.dataset.v);
  },
  'prompts': (el, e) => { 
    return savePrompts();
  },
  'sleep': (el, e) => { const { h, d } = el.dataset;
    return openSleep(d);
  },
  'sleep-clear': (el, e) => { const { h, d } = el.dataset;
    setEntry(d, { bed: null, wake: null, sleep: null }); save(state); $sheet.close(); return render();
  },
  'metric': (el, e) => { const { h, d } = el.dataset;
    return openMetric(el.dataset.m, d);
  },
  'metric-new': (el, e) => { 
    return openMetricEditor();
  },
  'metric-edit': (el, e) => { 
    return openMetricEditor(state.metrics.find(m => m.id === el.dataset.m));
  },
  'metric-clear': (el, e) => { const { h, d } = el.dataset;
    delete state.values[el.dataset.m]?.[d]; save(state); $sheet.close(); return render();
  },
  'metric-delete': (el, e) => { 
    const m = state.metrics.find(x => x.id === el.dataset.m);
    if (!confirm(`¿Borrar "${m.name}" y todos sus valores?`)) return;
    snapshot(state, `Antes de borrar la métrica «${m.name}»`);
    state.metrics = state.metrics.filter(x => x !== m);
    delete state.values[m.id];
    save(state);
    $sheet.close();
    return render();
  },
};
