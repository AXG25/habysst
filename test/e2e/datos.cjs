// End-to-end checks for the things that must never break: losing data and running code from a backup.
// Run: npm run test:e2e  (needs Playwright with Chromium installed)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');

const root = path.resolve(__dirname, '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
});

let failed = 0;
const check = (name, cond) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) failed++; };

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  const alerts = []; p.on('dialog', d => { alerts.push(d.message()); d.accept(); });
  const ls = () => p.evaluate(() => JSON.parse(localStorage.getItem('habysst') ?? 'null'));
  const idb = (fn, arg) => p.evaluate(([fn, arg]) => new Promise(r => {
    const o = indexedDB.open('habysst', 1);
    o.onsuccess = () => { const q = o.result.transaction('kv').objectStore('kv')[fn](arg); q.onsuccess = () => r(q.result ?? null); };
  }), [fn, arg]);
  const today = () => p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });

  await p.goto(url);
  await p.waitForSelector('.driver-popover', { timeout: 8000 }).catch(() => {});
  const first = await ls();
  check('first open starts from the recipe, with removable history', first?.habits?.length === 6 && first.lists.length === 2 && first.demo?.journal.length > 0);
  check('first open shows the tutorial once', !!(await p.$('.driver-popover')));
  await p.evaluate(() => localStorage.setItem('habysst', JSON.stringify({ version: 1,
    habits: [{ id: 'h1', name: 'Leer', tone: 0 }, { id: 'h2', name: 'Correr', tone: 1 }], done: { h1: ['2026-11-19', '2026-11-20'] },
    journal: { '2026-11-20': { mood: 4, text: 'Un buen día' } }, lastBackup: new Date().toISOString() })));
  await p.reload(); await p.waitForTimeout(300);

  await p.click('[data-act=toggle][data-h=h2]'); await p.waitForTimeout(900);
  check('the second copy follows every change', JSON.parse(await idb('get', 'current')).done.h2?.length === 1);
  check('a daily snapshot is created', (await idb('getAllKeys')).some(k => k.startsWith('snap:')));

  await p.evaluate(() => localStorage.setItem('habysst', '{not json'));
  alerts.length = 0; await p.reload(); await p.waitForTimeout(800);
  check('corrupt data is recovered from the second copy', (await ls())?.habits?.length === 2 && alerts.some(a => a.includes('Recuperamos')));
  check('corrupt data is kept aside, never dropped', await p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('habysst:corrupt:'))));

  await p.evaluate(() => localStorage.removeItem('habysst'));
  await p.reload(); await p.waitForTimeout(800);
  check('wiped data is recovered from the second copy', (await ls())?.habits?.length === 2);

  await p.click('[data-tab=habitos]'); await p.waitForTimeout(400);
  await p.click('[data-act=edit][data-h=h1]'); await p.waitForTimeout(400);
  await p.click('[data-act=delete]'); await p.waitForTimeout(1200);
  await p.click('.snapbox summary'); await p.waitForTimeout(200); // the copy list is folded
  const restore = await p.$('.snaps li:has-text("Antes de borrar el hábito") [data-act=restore]');
  check('deleting takes a snapshot first', !!restore);
  await restore.click(); await p.waitForTimeout(900);
  check('restoring a snapshot brings deleted data back', (await ls()).done.h1?.length === 2);

  await p.click('[data-act=new]'); await p.fill('#editor input[name=label]', 'Temporal'); await p.click('#editor .btn'); await p.waitForTimeout(200);
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('habysst')); s.habits = s.habits.filter(h => h.name === 'Temporal'); s.done = {}; s.journal = {}; localStorage.setItem('habysst', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(300);
  await p.click('[data-tab=habitos]'); await p.click('[data-act=edit]'); await p.click('[data-act=delete]'); await p.waitForTimeout(1200);
  check('an emptied app never overwrites a full second copy', JSON.parse(await idb('get', 'current')).habits.length >= 2);

  const p2 = await ctx.newPage(); await p2.goto(url); await p2.waitForTimeout(300);
  await p2.click('[data-act=new]'); await p2.fill('#editor input[name=label]', 'Otra pestaña'); await p2.click('#editor .btn'); await p2.waitForTimeout(400);
  await p.click('[data-tab=hoy]'); await p.waitForTimeout(300);
  await p.click('#fold-checkin [data-k=mood][data-v="3"]'); await p.waitForTimeout(300);
  check('two open tabs do not overwrite each other', (await ls()).habits.some(h => h.name === 'Otra pestaña'));
  await p2.close();

  await p.click('#fold-checkin [data-act=entry]'); await p.waitForTimeout(500);
  await p.type('textarea[name=text]', 'Escrito antes de salir');
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  check('typed text is saved when the app goes to the background', (await ls()).journal[await today()]?.text === 'Escrito antes de salir');

  const evil = path.join(require('node:os').tmpdir(), 'habysst-evil.json');
  fs.writeFileSync(evil, JSON.stringify({ version: 1, done: {}, habits: [{ id: 'x"><img src=x onerror="window.__pwned=1">', name: 'Malo' }] }));
  const p3 = await ctx.newPage(); p3.on('dialog', d => d.accept());
  await p3.goto(url); await p3.click('[data-tab=habitos]'); await p3.setInputFiles('#import', evil); await p3.waitForTimeout(500);
  await p3.click('[data-tab=hoy]'); await p3.waitForTimeout(300);
  check('a crafted backup cannot run code', !(await p3.evaluate(() => window.__pwned)));

  const p4 = await ctx.newPage(); await p4.goto(url); await p4.waitForTimeout(300);
  await p4.evaluate(() => { const s = JSON.parse(localStorage.getItem('habysst')); s.habits = []; s.timer = { start: new Date().toISOString(), target: 25, goal: null, phase: 'work', pomo: 0 }; localStorage.setItem('habysst', JSON.stringify(s)); });
  await p4.reload(); await p4.waitForTimeout(300);
  check('a running session shows one clock, even with no habits', (await p4.$$('.focusbox')).length === 1);

  await p4.click('[data-tab=diario]'); await p4.waitForTimeout(300);
  await p4.click('[data-act=journal-settings]'); await p4.waitForTimeout(300);
  await p4.fill('#review-prompts-week', '¿Qué evité?'); await p4.keyboard.press('Escape'); await p4.waitForTimeout(300);
  check('question settings closed without Guardar are kept', JSON.parse(await p4.evaluate(() => localStorage.getItem('habysst'))).reviewPrompts.week?.[0] === '¿Qué evité?');
  await p4.click('[data-act=journal-settings]'); await p4.waitForTimeout(300);
  await p4.fill('#review-prompts-week', 'Borrado'); await p4.click('#jsettings [data-act=close]'); await p4.waitForTimeout(300);
  check('Cancelar leaves the questions as they were', JSON.parse(await p4.evaluate(() => localStorage.getItem('habysst'))).reviewPrompts.week?.[0] === '¿Qué evité?');

  // Starter data, as on a first open, with the tutorial already seen.
  const p5 = await ctx.newPage(); await p5.goto(url); await p5.waitForTimeout(300);
  await p5.evaluate(async () => {
    const [{ starter }, { save }] = await Promise.all([import('./seed.js'), import('./store.js')]);
    save(starter(new Date())); localStorage.setItem('habysst:ui', JSON.stringify({ tutorialDone: true }));
  });
  await p5.reload(); await p5.waitForTimeout(300);
  const poster = await p5.evaluate(async () => {
    const { drawPoster } = await import('./share.js');
    const c = document.createElement('canvas');
    await drawPoster(c, { names: false, year: new Date().getFullYear() }); const off = c.toDataURL();
    await drawPoster(c, { names: true, year: new Date().getFullYear() });
    return { w: c.width, h: c.height, differs: off !== c.toDataURL(), inked: c.getContext('2d').getImageData(0, 0, 1080, 1920).data.some((v, i) => i % 4 === 0 && v < 128) };
  }).catch(e => (console.log(e.message), {}));
  check('the share image is 1080×1920 and drawn', poster.w === 1080 && poster.h === 1920 && poster.inked);
  check('the names switch changes the image', poster.differs);

  const fallback = await p5.evaluate(async () => {
    const { drawPoster } = await import('./share.js'), load = document.fonts.load;
    document.fonts.load = () => Promise.reject(new Error('x'));
    try {
      const c = document.createElement('canvas');
      await drawPoster(c, { names: true, year: new Date().getFullYear() });
      return c.width === 1080 && c.getContext('2d').getImageData(0, 0, 1080, 1920).data.some((v, i) => i % 4 === 0 && v < 128);
    } catch { return false; } finally { document.fonts.load = load; }
  });
  check('the share image still draws when a font fails to load', fallback);

  await p5.click('[data-tab=rachas]'); await p5.click('[data-act=share-open]');
  await p5.waitForTimeout(300);
  check('the share image hides habit names by default', !(await p5.isChecked('#sharef [name=names]')));
  check('the share image says its numbers to screen readers', /\d+ días? .*\d+% cumplido/.test(await p5.getAttribute('#sharef .poster', 'aria-label')));
  const [dl] = await Promise.all([p5.waitForEvent('download'), p5.click('[data-act=share-go]')]);
  check('sharing on a computer downloads the PNG', /^habysst-\d{4}\.png$/.test(dl.suggestedFilename()));
  // p4 has no habits
  await p4.click('[data-tab=rachas]');
  check('no share button without habits', !(await p4.$('[data-act=share-open]')));

  check('no script errors', errors.length === 0 || (console.log(errors), false));
  await browser.close(); server.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
