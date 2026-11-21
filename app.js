import { save, hasData, loadProblem, recover } from './store.js';
import { $sheet, $view, reduceMotion, ui } from './ui.js';
import { resetCache, setState, setTab, state, tab } from './core.js';
import { viewHoy } from './hoy.js';
import { calMode, viewAnalisis, viewAno, viewMes } from './progreso.js';
import { viewDiario } from './registro.js';
import { viewMetas } from './metas.js';
import { renderZen } from './enfoque.js';
import { fillDataStatus, setTheme, viewHabitos } from './ajustes.js';
import { TABS, go } from './motion.js';
import { resetCursor } from './progreso.js';
import { actions as uiActions } from './ui.js';
import { actions as hoyActions } from './hoy.js';
import { actions as progresoActions } from './progreso.js';
import { actions as registroActions } from './registro.js';
import { actions as revisionesActions } from './revisiones.js';
import { actions as metasActions } from './metas.js';
import { actions as enfoqueActions } from './enfoque.js';
import { actions as ajustesActions } from './ajustes.js';

const views = { hoy: viewHoy, rachas: () => (calMode === 'mes' ? viewMes() : calMode === 'ano' ? viewAno() : viewAnalisis()), diario: viewDiario, metas: viewMetas, habitos: viewHabitos };


// `enter` replays the ink-stroke reveal; only on navigation, never on a check-in.
export function render(enter = false) {
  resetCache();
  if (tab === 'habitos') queueMicrotask(fillDataStatus);
  renderZen();
  $view.classList.toggle('enter', enter && !reduceMotion.matches);
  $view.innerHTML = views[tab]();
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
}


// Every tappable element names its action in data-act; each module handles its own.
const actions = { ...uiActions, ...hoyActions, ...progresoActions, ...registroActions, ...revisionesActions, ...metasActions, ...enfoqueActions, ...ajustesActions };
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act], [data-tab]');
  if (!el) {
    if (e.target === $sheet) $sheet.close(); // tap on backdrop
    return;
  }
  if (el.tagName === 'BUTTON' && el.closest('summary')) e.preventDefault(); // act without folding the section
  if (el.dataset.tab) {
    const next = el.dataset.tab;
    if (next === tab) return;
    return go(() => { setTab(next); if (next === 'rachas') resetCursor(); render(true); }, TABS.indexOf(next) > TABS.indexOf(tab) ? 'fwd' : 'back');
  }
  actions[el.dataset.act]?.(el, e);
});

// Re-render when returning to the app so "today" is correct after midnight.
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && !$sheet.open && render());


if (ui.theme && ui.theme !== 'system') setTheme(ui.theme);


// Startup: ask the browser to keep our data, and recover from the second copy if the main one is gone or broken.
if (hasData(state)) navigator.storage?.persist?.();

const startProblem = loadProblem;
if (startProblem) recover().then(s => {
  if (!s) {
    if (startProblem === 'corrupt') alert('Tus datos guardados estaban dañados y no hay copia interna. Si tienes un respaldo, impórtalo desde Ajustes.');
    return;
  }
  setState(s);
  save(state);
  render();
  alert('Recuperamos tus datos desde la copia interna de este teléfono.');
});


if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

render(true);

