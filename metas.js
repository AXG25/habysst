import { ymd, goalProgress } from './logic.js';
import { save, snapshot, cleanGoal } from './store.js';
import { $sheet, dur, esc, fmt, fmtDate, header, plural, radio, stamp } from './ui.js';
import { MAX_GOALS, activeGoals, focusIn, info, state, unit } from './core.js';
import { glide, go } from './motion.js';
import { calMode } from './progreso.js';
import { when } from './ajustes.js';
import { render } from './app.js';

export const u = g => (g.unit ? ` ${esc(g.unit)}` : '');


export function goalSummary(g) {
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


export const progressBar = s =>
  `<div class="pbar" role="progressbar" aria-label="Progreso" aria-valuenow="${Math.round(s.pct * 100)}" aria-valuemin="0" aria-valuemax="100">
    <i style="--p:${s.pct}"></i>${s.expected !== null ? `<b style="left:${(s.expected * 100).toFixed(1)}%"></b>` : ''}</div>`;


export const ifThen = (a, b) => (a || b ? `<p class="plan">Si ${esc(a || '…')}, entonces ${esc(b || '…')}.</p>` : '');


export let metasMode = 'metas', openList = null, listEdit = false;

export const metasSwitch = () => `<div class="seg" role="group" aria-label="Vista">
  <button data-act="metas-mode" data-m="metas" aria-pressed="${metasMode === 'metas'}">Metas</button>
  <button data-act="metas-mode" data-m="listas" aria-pressed="${metasMode === 'listas'}">Listas</button></div>`;


export function viewMetas() {
  if (metasMode === 'listas') return viewListas();
  const act = activeGoals(), closed = state.goals.filter(g => g.status !== 'active');
  return header('Metas', `${act.length} de ${MAX_GOALS} activas`) + metasSwitch() + compassBox() +
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


export function openGoal(id) {
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


export function logGoal(id) {
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


export function openGoalEditor(g) {
  const kind = g?.kind ?? 'number';
  const val = x => (x ? esc(String(x)) : '');
  $sheet.redraw = null;
  $sheet.innerHTML = `<form id="geditor">
    <h2${g ? ' tabindex="-1" autofocus' : ''}>${g ? 'Editar meta' : 'Nueva meta'}</h2>
    ${state.compass.values.length ? `<p class="muted small">Tus valores: ${state.compass.values.map(esc).join(', ')}.</p>` : ''}
    <label class="field">Meta<input name="title" required maxlength="80" value="${val(g?.title)}" placeholder="Correr una media maratón" autocomplete="off"></label>
    <label class="field">Por qué te importa<textarea name="why" rows="2" maxlength="500" placeholder="Opcional">${val(g?.why)}</textarea></label>
    <label class="field">Fecha límite<input name="deadline" type="date" value="${g?.deadline ?? ''}"></label>
    <fieldset class="freq"><legend>Cómo se mide</legend>
      <div class="opts">${radio('kind', 'number', 'Con un número', kind === 'number')}${radio('kind', 'steps', 'Con pasos', kind === 'steps')}</div>
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


// ---- Values and vision
export const compassView = () => {
  const c = state.compass;
  return `${c.values.length ? `<ul class="values">${c.values.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}${c.vision ? `<p class="plan">${esc(c.vision)}</p>` : ''}`;
};

export function compassBox() {
  const c = state.compass;
  if (!c.values.length && !c.vision) return `<section class="compass panel"><p>Antes de elegir metas, define qué es importante para ti: tus valores y cómo quieres que sea tu vida en unos años.</p>
    <button class="btn ghost" data-act="compass">Definir valores y visión</button></section>`;
  return `<section class="compass panel"><div class="compass-head"><h2>Valores y visión</h2><button class="link" data-act="compass">Editar</button></div>${compassView()}</section>`;
}

export function openCompass() {
  const c = state.compass;
  $sheet.redraw = null;
  $sheet.innerHTML = `<form id="compassf">
    <h2>Valores y visión</h2>
    <label class="field">Tus valores, uno por línea (hasta 5)<textarea name="values" rows="5" placeholder="Salud&#10;Familia&#10;Aprender&#10;Libertad">${esc(c.values.join('\n'))}</textarea></label>
    <label class="field">Tu visión: cómo quieres que sea tu vida dentro de 3 a 5 años<textarea name="vision" rows="5" maxlength="1000" placeholder="Opcional">${esc(c.vision)}</textarea></label>
    <p class="muted small">Te los recordaremos al crear metas y en las revisiones del mes, el trimestre y el año.</p>
    <div class="row"><button class="btn">Guardar</button><button type="button" class="btn ghost" data-act="close">Cancelar</button></div>
  </form>`;
  $sheet.querySelector('#compassf').onsubmit = e => {
    e.preventDefault();
    const lines = e.target.values.value.split('\n').map(v => v.trim().slice(0, 40)).filter(Boolean);
    if (lines.length > 5) return alert('Elige como máximo 5 valores. Menos es más claro.');
    state.compass = { values: lines, vision: e.target.vision.value.trim() };
    save(state);
    $sheet.close();
    render();
  };
  $sheet.showModal();
}


// ---- Lists
export function viewListas() {
  const l = state.lists.find(x => x.id === openList);
  if (!l) {
    openList = null;
    const cards = state.lists.map(x => {
      const n = x.items.filter(i => i.done).length;
      return `<li><button class="listcard panel" data-act="list-open" data-l="${x.id}">
        <span class="hname">${esc(x.name)}</span><span class="hmeta">${x.items.length ? `${n} de ${x.items.length} hechas` : 'Vacía'}</span>
        <i class="track"><i style="--p:${x.items.length ? n / x.items.length : 0}"></i></i></button></li>`;
    }).join('');
    return header('Listas', plural(state.lists.length, 'lista', 'listas')) + metasSwitch() +
      (cards ? `<ul class="lists">${cards}</ul>` : `<p class="muted">Crea listas para lo que quieras: la compra, viajes, libros por leer o las cosas que quieres hacer antes de morir.</p>
        <div class="chips wrap">${['Supermercado', 'Antes de morir', 'Libros por leer'].map(n => `<button class="chip" data-act="list-new" data-n="${n}">${n}</button>`).join('')}</div>`) +
      `<button class="btn wide" data-act="list-new">Crear lista</button>`;
  }
  const pending = l.items.filter(i => !i.done);
  const done = l.items.filter(i => i.done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  const row = i => `<li><button class="item${i.done ? ' done' : ''}" data-act="item" data-i="${i.id}" aria-pressed="${i.done}">
      <span class="box" aria-hidden="true"></span><span class="txt">${esc(i.text)}</span>${i.done && i.doneAt ? `<small>${fmtDate(i.doneAt)}</small>` : ''}</button>
      ${listEdit ? `<button class="del" data-act="item-del" data-i="${i.id}" aria-label="Borrar ${esc(i.text)}"></button>` : ''}</li>`;
  return `<header class="hero"><button class="nav" data-act="list-back" aria-label="Volver a las listas">‹</button>
      <div><h1>${esc(l.name)}</h1><p>${l.items.length ? `${done.length} de ${l.items.length} hechas` : 'Vacía'}</p></div></header>
    <form id="additem" class="additem"><input id="newitem" maxlength="200" placeholder="Añadir a la lista" autocomplete="off" enterkeyhint="done" aria-label="Nuevo elemento">
      <button class="btn">Añadir</button></form>
    ${pending.length ? `<ul class="items">${pending.map(row).join('')}</ul>` : l.items.length ? '<p class="muted">Todo hecho.</p>' : ''}
    ${done.length ? `<h3 class="sub-sm" data-i="done-h">Hechas (${done.length})</h3><ul class="items">${done.map(row).join('')}</ul>` : ''}
    <div class="row list-tools">
      ${l.items.length ? `<button class="link" data-act="list-edit">${listEdit ? 'Listo' : 'Borrar elementos'}</button>` : ''}
      ${done.length ? `<button class="link" data-act="list-clear">Quitar las hechas</button>` : ''}
      <button class="link" data-act="list-rename">Renombrar o borrar lista</button>
    </div>`;
}


export function createList(name) {
  const id = crypto.randomUUID();
  state.lists.push({ id, name, items: [] });
  save(state);
  // No slide here: the keyboard opening resizes the viewport, which would cut the transition short.
  openList = id;
  listEdit = false;
  render();
  document.getElementById('newitem')?.focus();
}


export function openListEditor(l) {
  $sheet.redraw = null;
  $sheet.innerHTML = `<form id="listf">
    <h2>${l ? 'Lista' : 'Nueva lista'}</h2>
    <label class="field">Nombre<input name="name" required maxlength="60" value="${l ? esc(l.name) : ''}" placeholder="Antes de morir" autocomplete="off"></label>
    <div class="row"><button class="btn">${l ? 'Guardar' : 'Crear lista'}</button><button type="button" class="btn ghost" data-act="close">Cancelar</button></div>
    ${l ? `<button type="button" class="link danger" data-act="list-delete" data-l="${l.id}">Borrar lista</button>` : ''}
  </form>`;
  $sheet.querySelector('#listf').onsubmit = e => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    $sheet.close();
    if (l) { l.name = name; save(state); render(); } else createList(name);
  };
  $sheet.showModal();
}


document.addEventListener('submit', e => {
  if (e.target.id !== 'additem') return;
  e.preventDefault();
  const input = e.target.querySelector('#newitem'), text = input.value.trim();
  if (!text) return;
  state.lists.find(x => x.id === openList).items.push({ id: crypto.randomUUID(), text: text.slice(0, 200), done: false, doneAt: null });
  save(state);
  render();
  document.getElementById('newitem').focus(); // keep the keyboard up for the next item
  document.querySelector('#view .items:first-of-type li:last-child')?.classList.add('added');
});


export const actions = {
  'metas-mode': (el, e) => { 
    const m = el.dataset.m; return go(() => { metasMode = m; render(true); }, m === 'listas' ? 'fwd' : 'back');
  },
  'list-open': (el, e) => { 
    const id = el.dataset.l; return go(() => { openList = id; listEdit = false; render(); }, 'fwd');
  },
  'list-back': (el, e) => { 
    return go(() => { openList = null; listEdit = false; render(); }, 'back');
  },
  'list-new': (el, e) => { 
    return el.dataset.n ? createList(el.dataset.n) : openListEditor();
  },
  'list-edit': (el, e) => { 
    listEdit = !listEdit; return render();
  },
  'list-rename': (el, e) => { 
    return openListEditor(state.lists.find(l => l.id === openList));
  },
  'item': (el, e) => { const { h, d } = el.dataset;
    const l = state.lists.find(x => x.id === openList), it = l.items.find(x => x.id === el.dataset.i);
    glide('#view .items [data-act="item"], #view [data-i="done-h"]', 'i', () => {
      Object.assign(it, { done: !it.done, doneAt: it.done ? null : ymd(new Date()) });
      save(state);
      render();
    });
    document.querySelector(`[data-act="item"][data-i="${it.id}"]`)?.classList.add('pop');
    return;
  },
  'item-del': (el, e) => { 
    const l = state.lists.find(x => x.id === openList);
    l.items = l.items.filter(x => x.id !== el.dataset.i);
    save(state);
    return render();
  },
  'list-clear': (el, e) => { 
    const l = state.lists.find(x => x.id === openList), n = l.items.filter(x => x.done).length;
    if (!confirm(`¿Quitar ${plural(n, 'elemento hecho', 'elementos hechos')} de "${l.name}"?`)) return;
    snapshot(state, `Antes de quitar las hechas de «${l.name}»`);
    l.items = l.items.filter(x => !x.done);
    save(state);
    return render();
  },
  'list-delete': (el, e) => { 
    const l = state.lists.find(x => x.id === el.dataset.l);
    if (!confirm(`¿Borrar la lista "${l.name}" y todo lo que tiene?`)) return;
    snapshot(state, `Antes de borrar la lista «${l.name}»`);
    state.lists = state.lists.filter(x => x !== l);
    openList = null;
    save(state);
    $sheet.close();
    return render();
  },
  'compass': (el, e) => { 
    return openCompass();
  },
  'goal': (el, e) => { 
    return openGoal(el.dataset.g);
  },
  'goal-new': (el, e) => { 
    return openGoalEditor();
  },
  'goal-edit': (el, e) => { 
    return openGoalEditor(state.goals.find(g => g.id === el.dataset.g));
  },
  'goal-log': (el, e) => { 
    return logGoal(el.dataset.g);
  },
  'goal-step': (el, e) => {  const step = calMode === 'ano' ? 12 : 1;
    const g = state.goals.find(x => x.id === el.dataset.g);
    const st = g.steps[+el.dataset.i];
    st.done = !st.done;
    save(state);
    $sheet.redraw();
    render();
    if (st.done) $sheet.querySelector(`[data-act="goal-step"][data-i="${el.dataset.i}"]`)?.classList.add('pop');
    return;
  },
  'goal-close': (el, e) => { 
    const g = state.goals.find(x => x.id === el.dataset.g);
    Object.assign(g, { status: el.dataset.s, closedAt: ymd(new Date()) });
    save(state);
    $sheet.close();
    render();
    if (g.status === 'done') stamp('Lograda');
    return;
  },
  'goal-reopen': (el, e) => { 
    if (activeGoals().length >= MAX_GOALS) return alert(`Ya tienes ${MAX_GOALS} metas activas. Cierra una antes de reactivar esta.`);
    Object.assign(state.goals.find(x => x.id === el.dataset.g), { status: 'active', closedAt: null });
    save(state);
    $sheet.redraw();
    return render();
  },
  'goal-delete': (el, e) => { 
    const g = state.goals.find(x => x.id === el.dataset.g);
    if (!confirm(`¿Borrar la meta "${g.title}"?`)) return;
    snapshot(state, `Antes de borrar la meta «${g.title}»`);
    state.goals = state.goals.filter(x => x !== g);
    save(state);
    $sheet.close();
    return render();
  },
};
