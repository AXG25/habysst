import { parseYmd } from './logic.js';

export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export const WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export const TONE_NAMES = ['Tinta', 'Puntos', 'Diagonal', 'Rejilla', 'Rayado', 'Rojo', 'Puntos finos', 'Horizontal', 'Inversa', 'Ajedrez', 'Puntos rojos', 'Rayas rojas'];


export const $view = document.getElementById('view');

export const $sheet = document.getElementById('sheet');

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export const esc = s => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export const cap = s => s[0].toUpperCase() + s.slice(1);

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// `label` is HTML: escape user text before passing it.

export const radio = (name, value, label, on = false) =>
  `<label class="opt"><input type="radio" name="${name}" value="${value}"${on ? ' checked' : ''}><span>${label}</span></label>`;


const chevron = points => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="${points}"/></svg>`;

export const header = (title, sub, nav = '', brand = false, tool = '') =>
  `<header class="hero">${nav ? `<button class="nav" data-act="prev" aria-label="Anterior">${chevron('15 18 9 12 15 6')}</button>` : ''}
    <div><h1${brand || nav ? ` class="fit" style="--len:${title.length}"` : ''}>${title}</h1><p>${sub}</p></div>
    ${nav ? `<button class="nav" data-act="next" aria-label="Siguiente">${chevron('9 18 15 12 9 6')}</button>` : ''}
    ${brand ? `<span class="brand" aria-label="HabyssT">HabyssT</span>` : ''}${tool}</header>`;

// A settings button for a header: the gear opens that tab's options.
export const gear = (act, label) => `<button class="nav gear" data-act="${act}" aria-label="${label}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>`;
// Opens the share sheet (share.js): an arrow out of a tray.
export const shareTool = `<button class="nav tool" data-act="share-open" aria-label="Compartir imagen de tu constancia"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></button>`;


// UI-only preferences for this device; never part of the backup.
export const ui = (() => { try { return JSON.parse(localStorage.getItem('habysst:ui')) ?? {}; } catch { return {}; } })();

export const setUi = patch => { Object.assign(ui, patch); try { localStorage.setItem('habysst:ui', JSON.stringify(ui)); } catch {} };

export const fold = (id, title, note, actions, body) =>
  `<section class="fold-wrap${actions ? ' has-act' : ''}"><details class="fold sec" id="fold-${id}"${ui.closed[id] ? '' : ' open'}>
    <summary><h2>${title}</h2>${note ? `<span class="hmeta">${note}</span>` : ''}<i class="chev" aria-hidden="true"></i></summary>
    <div class="fold-body">${body}</div></details>${actions ? `<div class="sec-act">${actions}</div>` : ''}</section>`;


// Formatters are built once: creating one per call made long lists and chart tables slow.
const numberFmt = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });
const dayMonthFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
export const fmt = n => numberFmt.format(n);

export const fmtDate = k => dayMonthFmt.format(parseYmd(k));


// A hanko-style stamp for the rare moment a goal is achieved.
export function stamp(text) {
  const el = Object.assign(document.createElement('div'), { className: 'stamp', textContent: text });
  el.setAttribute('role', 'status');
  el.addEventListener('animationend', () => el.remove());
  document.body.append(el);
}



// ---- Journal
export const LEVELS = ['Muy bajo', 'Bajo', 'Normal', 'Bueno', 'Muy bueno'];

export const KINDS = { mood: 'Ánimo', energy: 'Energía', sleep: 'Calidad' };

export const longDate = k => { const d = parseYmd(k); return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}`; };


export const dm = d => `${d.getDate()} de ${MONTHS[d.getMonth()]}`;

// ---- Sleep (stored on the day you wake up)
export const dur = mins => (mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60} min` : ''}`);

// ---- Analysis
export const fmt1 = n => fmt(Math.round(n * 10) / 10);

export const short = fmtDate;

// <details> toggle does not bubble, so listen in the capture phase.
document.addEventListener('toggle', e => {
  if (e.target.id?.startsWith('fold-')) setUi({ closed: { ...ui.closed, [e.target.id.slice(5)]: !e.target.open } });
}, true);


export const actions = {
  'close': (el, e) => { 
    return $sheet.close();
  },
};
