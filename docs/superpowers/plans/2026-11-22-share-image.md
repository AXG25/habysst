# Imagen para compartir la constancia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Compartir" button in Progreso that draws a 1080×1920 PNG of the user's year of constancy and shares it (system share sheet) or downloads it.

**Architecture:** Pure stats in `logic.js` (unit-tested). A new `share.js` draws the poster on a `<canvas>` from those stats and the habits' streak runs, and owns the share sheet and its actions. Progreso gets a header tool button (the `tool` slot `header()` already has, like Diario's gear).

**Tech Stack:** Vanilla ES modules, Canvas 2D, Web Share API Level 2 (`navigator.canShare({ files })`), `node --test`, Playwright e2e (`test/e2e/datos.cjs`).

**Spec:** `docs/superpowers/specs/2026-11-22-share-image-design.md`

## Global Constraints

- Output: PNG, exactly 1080×1920, white paper (`#ffffff`), ink `#000000`, red `#d42a1f` — even in dark mode.
- Logo: the HabyssT stamp (text "HabyssT" in Dela Gothic One, 2-stroke border, rotated −3°), as in the app.
- Habit names: toggle "Mostrar nombres de los hábitos", **off by default**; with it off, no habit name is drawn anywhere.
- Nothing leaves the device: no network request is made to build or share the image.
- Works on iPhone, Android (share sheet) and desktop (download). File name: `habysst-<year>.png`.
- No new dependencies. UI copy in Spanish; app name always "HabyssT".
- Bump `CACHE` in `sw.js` and add `share.js` nowhere special (the SW caches on fetch).

## Review Focus

1. **No habits:** no share button in Progreso (nothing to show off).
2. **No active streak:** headline falls back to "N días cumplidos en <año>" instead of "0 días".
3. **Fonts not loaded yet** (first open offline, slow network): drawing waits for `document.fonts.load` of the three families; if they never load, it still draws with fallbacks.
4. **User cancels the share sheet:** `AbortError` is silent — no alert, sheet stays open.
5. **Long names / 12 habits:** names are cut with "…" to fit; 12 lanes still fit inside the year block.

---

### Task 1: Constancy stats

**Files:**
- Modify: `logic.js` (append)
- Test: `test/logic.test.js`

**Interfaces:**
- Consumes: `periods`, `covered`, `ymd`, `addDays` (logic.js).
- Produces: `constancy(items: {freq, done: Set<string>}[], now: Date) -> { streak: number, rate: number|null, days: number }`
  - `streak`: longest run of consecutive covered days (from `covered()`) ending today or yesterday, max over habits — in days, so weekly habits count too.
  - `rate`: % (0–100, rounded) of finished periods met that start in `now`'s year, summed over all habits; `null` if none.
  - `days`: distinct days in `now`'s year (≤ today) where any habit was done.

- [ ] **Step 1: Write the failing tests** in `test/logic.test.js`:

```js
test('constancy: streak in days ending today or yesterday, rate and days of the year', () => {
  const now = d(1, 10); // 2026-02-10
  const a = { freq: DAILY, done: set('2026-02-07', '2026-02-08', '2026-02-09') };      // run ends yesterday: 3
  const b = { freq: DAILY, done: set('2026-01-01', '2026-01-02', '2026-02-10') };      // run today: 1
  const c = constancy([a, b], now);
  assert.equal(c.streak, 3);
  assert.equal(c.days, 6); // Jan 1, Jan 2, Feb 7, 8, 9, 10
  assert.equal(constancy([{ freq: DAILY, done: set('2026-02-01') }], d(1, 3)).rate, 50); // Feb 1 met, Feb 2 missed, today pending
  assert.equal(constancy([{ freq: DAILY, done: set('2026-02-01') }], now).streak, 0);
  assert.deepEqual(constancy([], now), { streak: 0, rate: null, days: 0 });
  assert.equal(constancy([{ freq: DAILY, done: set('2025-12-31') }], now).days, 0); // other years don't count
});
```

- [ ] **Step 2:** Run `npm test` — expect FAIL (`constancy` is not exported).
- [ ] **Step 3:** Implement `constancy` in `logic.js` with the signature above.
- [ ] **Step 4:** Run `npm test` — expect all pass.
- [ ] **Step 5:** Commit `logic.js test/logic.test.js` — "Constancy stats for the share image".

### Task 2: Poster drawing

**Files:**
- Create: `share.js`
- Modify: `style.css` (none needed here)
- Test: `test/e2e/datos.cjs`

**Interfaces:**
- Consumes: `constancy` (Task 1); `state`, `setOf`, `info` (core.js); `monthRow`, `runs`, `ymd` (logic.js); `mottoOf` (mottos.js); `MONTHS` (where progreso.js gets it).
- Produces: `drawPoster(canvas: HTMLCanvasElement, { names: boolean, year: number }) -> Promise<void>` — sets canvas to 1080×1920 and draws; `export const W = 1080, H = 1920`.

Layout (px, on 1080×1920; 72 side margin):
- Top band y=96: stamp at left (font 44px Dela Gothic One, padded box, 4px stroke, −3°); motto (UnifrakturMaguntia 40px) right-aligned.
- Headline y≈380: number in Dela Gothic One 300px; line below in Zen Kaku Gothic New 52px: "días sin fallar" (streak > 0) or "días cumplidos en <año>" (fallback, number = `days`).
- Year block y≈720–1500: 12 rows (month abbreviation 30px bold left, 31 columns), one lane per habit, bars from `runs(monthRow(y, m), info(h).cov)`, each filled with the habit's screentone (tone patterns t0–t11 rebuilt as `ctx.createPattern` tiles at 2× the CSS sizes) with a 2px ink outline and round ends; ticks in `#d6d6d6`.
- Stats line y≈1580: "<rate>% de días cumplidos · <n> hábitos · <year>" (omit the rate part when `null`).
- Legend (names on): up to 12 rows of swatch + name, 2 columns, names cut with "…" by `measureText`; (names off): swatches only, no text.
- Footer y=1860: "axg25.github.io/habysst" 28px, muted `#6b6b6b`.
- Before drawing: `await Promise.race([Promise.all(['Dela Gothic One', 'Zen Kaku Gothic New', 'UnifrakturMaguntia'].map(f => document.fonts.load(`40px "${f}"`))), new Promise(r => setTimeout(r, 1500))])`.

- [ ] **Step 1: Write the failing e2e check** (in `datos.cjs`, page with starter data):

```js
const poster = await p5.evaluate(async () => {
  const { drawPoster } = await import('./share.js');
  const c = document.createElement('canvas');
  await drawPoster(c, { names: false, year: new Date().getFullYear() }); const off = c.toDataURL();
  await drawPoster(c, { names: true, year: new Date().getFullYear() });
  return { w: c.width, h: c.height, differs: off !== c.toDataURL(), inked: c.getContext('2d').getImageData(0, 0, 1080, 1920).data.some((v, i) => i % 4 === 0 && v < 128) };
});
check('the share image is 1080×1920 and drawn', poster.w === 1080 && poster.h === 1920 && poster.inked);
check('the names switch changes the image', poster.differs);
```

- [ ] **Step 2:** Run `npm run test:e2e` — expect the two checks FAIL (module missing).
- [ ] **Step 3:** Implement `share.js` `drawPoster` to the layout above.
- [ ] **Step 4:** Run `npm run test:e2e` — expect all pass. Screenshot the canvas (names on/off, 3 and 12 habits, no streak) and look at it.
- [ ] **Step 5:** Commit — "Draw the share poster".

### Task 3: Share button and sheet

**Files:**
- Modify: `share.js` (sheet + `actions`), `progreso.js` (header tool in `viewMes` and `viewAno` when habits exist), `app.js` (register `share.js` actions like the other modules), `ui.js` (a `shareIcon` glyph next to `gear`, or generalize `gear(act, label, svg)`), `style.css` (`.poster` preview), `sw.js` (bump `CACHE`)
- Test: `test/e2e/datos.cjs`

**Interfaces:**
- Consumes: `drawPoster`, `W`, `H` (Task 2); `$sheet` (ui.js); `header(title, sub, nav, brand, tool)`.
- Produces: actions `share-open`, `share-go`; sheet `<form id="sharef">` with `<canvas class="poster">`, checkbox `name="names"` (unchecked), buttons "Compartir" and "Cancelar" (`data-act=close`).

Behavior:
- `share-open`: render sheet, `drawPoster(canvas, { names: false, year: cursor year })`; toggling the checkbox redraws.
- `share-go`: `canvas.toBlob` → `File([blob], 'habysst-<year>.png', { type: 'image/png' })`; if `navigator.canShare?.({ files: [file] })` → `navigator.share({ files: [file], title: 'HabyssT' })`, ignore `AbortError`; else download through a temporary `<a download>` with `URL.createObjectURL` (revoke after click).
- No habits → no button.

- [ ] **Step 1: Write the failing e2e checks** (desktop Chromium has no file sharing → download path):

```js
await p5.click('[data-tab=rachas]'); await p5.click('[data-act=share-open]');
const [dl] = await Promise.all([p5.waitForEvent('download'), p5.click('[data-act=share-go]')]);
check('sharing on a computer downloads the PNG', /^habysst-\d{4}\.png$/.test(dl.suggestedFilename()));
// p4 has no habits
await p4.click('[data-tab=rachas]');
check('no share button without habits', !(await p4.$('[data-act=share-open]')));
```

- [ ] **Step 2:** Run `npm run test:e2e` — expect FAIL.
- [ ] **Step 3:** Implement the button, sheet and actions as above.
- [ ] **Step 4:** Run `npm test`, `npm run test:e2e`, the axe script, and the impeccable detector (`impeccable detect --json --changed`); screenshot the sheet on iPhone SE / iPhone 14, light and dark.
- [ ] **Step 5:** Commit and push — "Share your constancy as an image".
