import { $sheet, reduceMotion } from './ui.js';
import { setTheme } from './ajustes.js';
import { render } from './app.js';

// Re-renders, then lets rows that changed place glide there instead of jumping.
export function glide(selector, key, update) {
  const rows = () => document.querySelectorAll(selector);
  const before = new Map([...rows()].map(b => [b.dataset[key], b.getBoundingClientRect().top]));
  update();
  if (reduceMotion.matches) return;
  rows().forEach(b => {
    const el = b.closest('li') ?? b;
    // Something new (like the "Hechas" heading) fades in once the others have moved.
    if (!before.has(b.dataset[key])) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 420, fill: 'backwards', easing: 'ease' });
    const dy = before.get(b.dataset[key]) - b.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
      { duration: 460, delay: 90, fill: 'backwards', easing: 'cubic-bezier(0.77, 0, 0.175, 1)' });
  });
}


// ---- Motion helpers
export const TABS = ['hoy', 'rachas', 'diario', 'metas', 'habitos'];
// Page changes slide in the direction you moved; the tab bar stays put. Falls back to an instant swap.

export function go(update, dir = '') {
  if (!document.startViewTransition || reduceMotion.matches) return update();
  document.documentElement.dataset.dir = dir;
  // A resize mid-transition (keyboard, rotation) aborts it; the update still applies, so nothing to report.
  document.startViewTransition(update).ready.catch(() => {});
}


// The new theme spreads from the button you pressed.
export function themeReveal(v, x, y) {
  const apply = () => { setTheme(v); render(); };
  if (!document.startViewTransition || reduceMotion.matches) return apply();
  document.documentElement.dataset.dir = 'theme';
  const t = document.startViewTransition(apply);
  t.ready.then(() => {
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.documentElement.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 560, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {}); // aborted (e.g. resize): the theme is applied anyway
}


// Sheets: drag the handle or title down to dismiss. A quick flick is enough; dragging up meets friction.
new MutationObserver(() => {
  if (!$sheet.querySelector(':scope > .grab')) $sheet.insertAdjacentHTML('afterbegin', '<div class="grab" aria-hidden="true"></div>');
}).observe($sheet, { childList: true });

// Every sheet opens at the top, not where the previous one was scrolled.
$sheet.addEventListener('close', () => { $sheet.scrollTop = 0; });
export let drag = null;

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

export function release() {
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
