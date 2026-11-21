import { advancePomodoro } from './logic.js';
import { save } from './store.js';
import { $sheet, dur, esc, plural, radio } from './ui.js';
import { activeGoals, focusOn, state } from './core.js';
import { render } from './app.js';

// ---- Focus sessions. The running timer lives in state, so it survives closing the app.
export const pad = n => String(n).padStart(2, '0');

export const clock = secs => { const a = Math.abs(secs); return `${a >= 3600 ? `${Math.floor(a / 3600)}:` : ''}${pad(Math.floor((a % 3600) / 60))}:${pad(a % 60)}`; };

export function focusBox(key) {
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


export const isPomo = t => t?.phase !== undefined;

export function phaseLabel() {
  const t = state.timer;
  if (!isPomo(t)) return t.target ? 'Tiempo restante' : 'Tiempo en sesión';
  return { work: `Pomodoro ${t.pomo + 1}. Enfoque`, break: t.target === 15 ? 'Descanso largo. Levántate y respira.' : 'Descanso. Aléjate de la pantalla.', ready: `Descanso terminado. Llevas ${plural(t.pomo, 'pomodoro', 'pomodoros')}.` }[t.phase];
}

export function focusButtons() {
  const t = state.timer;
  if (isPomo(t) && t.phase === 'ready') return `<button class="btn" data-act="focus-next">Siguiente pomodoro</button><button class="btn ghost" data-act="focus-end">Terminar</button>`;
  if (isPomo(t) && t.phase === 'break') return `<button class="btn ghost" data-act="focus-end">Terminar</button>`;
  return `<button class="btn" data-act="focus-stop">Terminar</button><button class="btn ghost" data-act="focus-cancel">Descartar</button>`;
}


export function clockText() {
  const t = state.timer, el = Math.floor((Date.now() - Date.parse(t.start)) / 1000);
  if (t.phase === 'ready') return '00:00';
  if (!t.target) return clock(el);
  const left = t.target * 60 - el;
  return left >= 0 ? clock(left) : `+${clock(left)}`;
}


export let buzzed = false;

export function tick() {
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
export let zenOpen = false, wakeLock = null;

export const $zen = document.getElementById('zen');

export function ringLeft() {
  const t = state.timer;
  if (!t?.target) return 0;
  return Math.min(1, (Date.now() - Date.parse(t.start)) / (t.target * 60000)).toFixed(4);
}

export async function keepAwake(on) {
  try {
    if (on && !wakeLock) wakeLock = await navigator.wakeLock?.request('screen');
    if (!on) { await wakeLock?.release(); wakeLock = null; }
  } catch { wakeLock = null; } // denied or unsupported: the timer still works
}

export function renderZen() {
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


export function openFocusSetup() {
  const goals = activeGoals();
  $sheet.redraw = null;
  $sheet.innerHTML = `<form id="focusf">
    <h2>Sesión de enfoque</h2>
    <fieldset><legend>Duración</legend><div class="opts">
      ${radio('target', 'pomo', 'Pomodoro: 25 minutos y descansos', true)}${radio('target', 25, '25 minutos')}${radio('target', 50, '50 minutos')}${radio('target', 90, '90 minutos')}${radio('target', '', 'Sin límite')}</div></fieldset>
    ${goals.length ? `<fieldset><legend>¿Para qué meta?</legend><div class="opts">
      ${radio('goal', '', 'Ninguna en concreto', true)}${goals.map(g => radio('goal', g.id, esc(g.title))).join('')}</div></fieldset>` : ''}
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


export function stopFocus(keep) {
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


export const actions = {
  'focus-setup': (el, e) => { 
    return openFocusSetup();
  },
  'focus-stop': (el, e) => { 
    return stopFocus(true);
  },
  'focus-cancel': (el, e) => { 
    return stopFocus(false);
  },
  'focus-end': (el, e) => { 
    return stopFocus(true);
  },
  'focus-next': (el, e) => { 
    Object.assign(state.timer, { phase: 'work', target: 25, start: new Date().toISOString() }); save(state); return render();
  },
  'zen': (el, e) => { 
    zenOpen = true; return renderZen();
  },
  'zen-exit': (el, e) => { 
    zenOpen = false; return renderZen();
  },
};
