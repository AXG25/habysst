// The share poster: the year as a printed manga page, 1080×1920.
// Literal colors only, so the image is the same whatever theme the app is in.
import { addDays, constancy, monthRow, runs, ymd } from './logic.js';
import { info, setOf, state } from './core.js';
import { mottoOf } from './mottos.js';
import { MONTHS, cap } from './ui.js';

export const W = 1080, H = 1920;
const M = 72, INK = '#000000', PAPER = '#ffffff', HANKO = '#d42a1f', RULE = '#d6d6d6', MUTED = '#6b6b6b';
const DISPLAY = '"Dela Gothic One", sans-serif', BODY = '"Zen Kaku Gothic New", sans-serif', GOTHIC = '"UnifrakturMaguntia", serif';
const GRID = { top: 730, bottom: 1500, label: 96 }, PANEL = { x: M, y: 208, w: W - 2 * M, h: 448 };

// Tiles are drawn Q× larger and scaled back in the pattern, so marks keep smooth edges at any angle.
const Q = 5;
const dots = (color, s, r) => [s, 0, g => { g.fillStyle = color; g.beginPath(); g.arc(s / 2, s / 2, r, 0, 7); g.fill(); }];
const lines = (color, s, w, angle) => [s, angle, g => { g.fillStyle = color; g.fillRect(0, 0, s, w); }];
// Screentones .t1–.t11 from style.css at 2× their CSS sizes; t0 and t5 are flat ink and red.
const TONES = [
  null,
  dots(INK, 8, 2.3),
  lines(INK, 8, 2.6, -45),
  [8, 45, g => { g.fillStyle = INK; g.fillRect(0, 0, 8, 2); g.fillRect(0, 0, 2, 8); }],
  lines(INK, 7, 2.6, 90),
  null,
  dots(INK, 5.2, 1.6),
  lines(INK, 7, 2.6, 0),
  lines(INK, 9.6, 4.8, 45),
  [10, 0, g => { g.fillStyle = INK; g.fillRect(5, 0, 5, 5); g.fillRect(0, 5, 5, 5); }],
  dots(HANKO, 8, 2.7),
  lines(HANKO, 8, 3.2, -45),
];

function pattern(ctx, [s, angle, draw]) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.round(s * Q);
  const g = c.getContext('2d');
  g.scale(Q, Q); draw(g);
  const p = ctx.createPattern(c, 'repeat');
  p.setTransform(new DOMMatrix().rotateSelf(angle).scaleSelf(1 / Q));
  return p;
}

const toneFill = (ctx, t) => (t === 0 ? INK : t === 5 ? HANKO : pattern(ctx, TONES[t]));

const fonts = () => Promise.race([
  Promise.all(['Dela Gothic One', 'Zen Kaku Gothic New', 'UnifrakturMaguntia'].map(f => document.fonts.load(`40px "${f}"`))),
  new Promise(r => setTimeout(r, 1500)),
]);

export async function drawPoster(canvas, { names, year }) {
  await fonts();
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'), now = new Date(), habits = state.habits;
  const c = constancy(habits.map(h => ({ freq: h.freq, done: setOf(h) })), now);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  topBand(ctx, now);
  headline(ctx, c, year);
  yearGrid(ctx, habits, year);
  statsLine(ctx, c, habits.length, year);
  legend(ctx, habits, names);
  footer(ctx);
}

function topBand(ctx, now) {
  ctx.font = `44px ${DISPLAY}`;
  const w = ctx.measureText('HabyssT').width + 36, h = 72, cy = 96;
  ctx.save();
  ctx.translate(M + w / 2, cy); ctx.rotate((-3 * Math.PI) / 180);
  ctx.strokeStyle = INK; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 6); ctx.stroke();
  ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('HabyssT', 0, 3);
  ctx.restore();
  ctx.fillStyle = INK; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.font = `${fitSize(ctx, mottoOf(now)[0], GOTHIC, 40, W - 2 * M - w - 48)}px ${GOTHIC}`;
  ctx.fillText(mottoOf(now)[0], W - M, cy + 4);
  ctx.textBaseline = 'alphabetic';
}

// Largest size up to `max` at which `text` fits in `width`.
function fitSize(ctx, text, font, max, width) {
  let size = max;
  for (; size > 12; size -= 2) { ctx.font = `${size}px ${font}`; if (ctx.measureText(text).width <= width) break; }
  return size;
}

function headline(ctx, { streak, days }, year) {
  const n = String(streak > 0 ? streak : days);
  const line = streak > 0 ? (streak === 1 ? 'día sin fallar' : 'días sin fallar') : `días cumplidos en ${year}`;
  const size = fitSize(ctx, n, DISPLAY, 300, W - 2 * M - 80);
  const w = ctx.measureText(n).width;
  focusLines(ctx, M + 40 + w / 2, 400);
  ctx.textAlign = 'left';
  // Red plate printed a little off the black one, like a two-color manga cover.
  ctx.fillStyle = HANKO; ctx.fillText(n, M + 52, 512);
  ctx.fillStyle = INK; ctx.fillText(n, M + 40, 500);
  // The line sits in a narration box so the focus lines never run through it.
  ctx.font = `700 52px ${BODY}`;
  const bw = ctx.measureText(line).width + 56, bx = W - M - bw, by = PANEL.y + PANEL.h - 52;
  ctx.fillStyle = PAPER; ctx.fillRect(bx, by - 40, bw, 92);
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.strokeRect(bx, by - 40, bw, 92);
  ctx.fillStyle = INK; ctx.fillText(line, bx + 28, by + 22);
  ctx.lineWidth = 6; ctx.strokeRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
}

// Manga focus lines: thin ink wedges aimed at the number, clipped to the panel.
function focusLines(ctx, cx, cy) {
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  ctx.save();
  ctx.beginPath(); ctx.rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h); ctx.clip();
  ctx.fillStyle = INK;
  for (let a = 0; a < Math.PI * 2; a += 0.03 + rnd() * 0.045) {
    const r0 = 300 + rnd() * 80, r1 = 900, half = 0.002 + rnd() * 0.005;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.62);
    ctx.lineTo(cx + Math.cos(a - half) * r1, cy + Math.sin(a - half) * r1 * 0.62);
    ctx.lineTo(cx + Math.cos(a + half) * r1, cy + Math.sin(a + half) * r1 * 0.62);
    ctx.fill();
  }
  ctx.restore();
}

function yearGrid(ctx, habits, year) {
  const x0 = M + GRID.label, col = (W - M - x0) / 31, rowH = (GRID.bottom - GRID.top) / 12;
  const n = Math.max(habits.length, 1), inner = rowH - 8;
  const lane = Math.min(26, inner / n), gap = Math.min(3, lane * 0.2), h = lane - gap;
  const fills = habits.map(hb => toneFill(ctx, hb.tone));
  const today = ymd(new Date()), voids = pattern(ctx, lines(RULE, 6, 1.5, -45));

  ctx.font = `500 22px ${BODY}`; ctx.fillStyle = MUTED; ctx.textAlign = 'center';
  for (const d of [1, 8, 15, 22, 29]) ctx.fillText(d, x0 + (d - 0.5) * col, GRID.top - 14);

  MONTHS.forEach((name, m) => {
    const y = GRID.top + m * rowH, days = monthRow(year, m);
    ctx.fillStyle = RULE;
    for (let i = 0; i <= 31; i++) ctx.fillRect(Math.round(x0 + i * col), y, 1, rowH);
    ctx.fillRect(x0, y + rowH - 1, W - M - x0, 1);
    const first = days.indexOf(null);
    if (first >= 0) { ctx.fillStyle = voids; ctx.fillRect(x0 + first * col + 1, y, (31 - first) * col - 1, rowH - 1); }
    ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `700 30px ${BODY}`;
    ctx.fillText(cap(name.slice(0, 3)), M, y + rowH / 2);
    ctx.textBaseline = 'alphabetic';
    const top = y + (rowH - n * lane) / 2 + gap / 2;
    habits.forEach((hb, j) => {
      const set = info(hb).cov;
      for (const [s, e] of runs(days.map(d => (d && ymd(d) <= today ? d : null)), set)) {
        const openL = s === 0 && set.has(ymd(addDays(days[s], -1)));
        const openR = (e === 30 || !days[e + 1]) && set.has(ymd(addDays(days[e], 1)));
        bar(ctx, x0 + s * col + (openL ? 0 : 2), top + j * lane, (e - s + 1) * col - (openL ? 0 : 2) - (openR ? 0 : 2), h, fills[j], openL, openR);
      }
    });
  });
}

// A streak bar: round ends, and an open end with no outline where the streak carries into the next month.
function bar(ctx, x, y, w, h, fill, openL, openR) {
  const r = h / 2, lw = h < 10 ? 1 : 2;
  ctx.fillStyle = PAPER;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, [openL ? 0 : r, openR ? 0 : r, openR ? 0 : r, openL ? 0 : r]); ctx.fill();
  ctx.fillStyle = fill; ctx.fill();
  const i = lw / 2;
  ctx.beginPath();
  if (openL) ctx.moveTo(x, y + i); else ctx.moveTo(x + r, y + i);
  if (openR) { ctx.lineTo(x + w, y + i); ctx.moveTo(x + w, y + h - i); } else ctx.arc(x + w - r, y + r, r - i, -Math.PI / 2, Math.PI / 2);
  if (openL) ctx.lineTo(x, y + h - i); else { ctx.lineTo(x + r, y + h - i); ctx.arc(x + r, y + r, r - i, Math.PI / 2, (3 * Math.PI) / 2); }
  ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
}

function statsLine(ctx, { rate }, n, year) {
  const parts = [rate === null ? null : `${rate}% de días cumplidos`, `${n} ${n === 1 ? 'hábito' : 'hábitos'}`, String(year)].filter(Boolean);
  ctx.fillStyle = INK; ctx.fillRect(M, 1524, W - 2 * M, 4);
  ctx.font = `700 36px ${BODY}`; ctx.textAlign = 'left';
  ctx.fillText(parts.join('  ·  '), M, 1582);
}

function swatch(ctx, x, y, w, h, tone) {
  bar(ctx, x, y, w, h, toneFill(ctx, tone), false, false);
}

function legend(ctx, habits, names) {
  const top = 1622, sw = 52, sh = 24;
  if (!names) {
    habits.forEach((h, i) => swatch(ctx, M + i * (sw + 22), top, sw, sh, h.tone));
    return;
  }
  const colW = (W - 2 * M) / 2, half = Math.ceil(habits.length / 2), pitch = 32;
  ctx.font = `500 26px ${BODY}`; ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  habits.forEach((h, i) => {
    const x = M + (i < half ? 0 : colW), y = top + (i % half) * pitch;
    swatch(ctx, x, y, sw, sh, h.tone);
    ctx.fillStyle = INK;
    ctx.fillText(clip(ctx, h.name, colW - sw - 48), x + sw + 16, y + sh / 2 + 1);
  });
  ctx.textBaseline = 'alphabetic';
}

// Cut `text` with "…" so it fits in `width` at the current font.
function clip(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function footer(ctx) {
  ctx.font = `500 28px ${BODY}`; ctx.fillStyle = MUTED; ctx.textAlign = 'center';
  ctx.fillText('axg25.github.io/habysst', W / 2, 1860);
}
