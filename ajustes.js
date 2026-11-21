import { removeFiller } from './seed.js';
import { startTutorial } from './tutorial.js';
import { ymd } from './logic.js';
import { save, fromJSON, toJSON, snapshot, listSnapshots, readSnapshot } from './store.js';
import { $sheet, esc, header, plural, setUi, stamp, ui } from './ui.js';
import { freqLabel, setState, state } from './core.js';
import { themeReveal } from './motion.js';
import { render } from './app.js';

export function viewHabitos() {
  const last = state.lastBackup ? new Date(state.lastBackup).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : 'nunca';
  const theme = ui.theme ?? 'system';
  return header('Ajustes', 'Hábitos, métricas, tema y respaldo') + `
  <h2 class="sub">Hábitos</h2>
  <ul class="manage">${state.habits.map(h => `<li class="panel">
    <i class="sw t${h.tone}"></i><span>${esc(h.name)}<small>${freqLabel(h.freq)}</small></span>
    <button class="link" data-act="edit" data-h="${h.id}">Editar</button></li>`).join('')}</ul>
  <button class="btn wide" data-act="new">Crear hábito</button>
  <h2 class="sub">Métricas</h2>
  ${state.metrics.length ? `<ul class="manage">${state.metrics.map(m => `<li class="panel"><span>${esc(m.name)}<small>${m.unit ? esc(m.unit) : 'Sin unidad'}</small></span>
    <button class="link" data-act="metric-edit" data-m="${m.id}">Editar</button></li>`).join('')}</ul>` : ''}
  <button class="btn ghost wide" data-act="metric-new">Crear métrica</button>
  <h2 class="sub">Tema</h2>
  <div class="seg" role="group" aria-label="Tema">${[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<button data-act="theme" data-v="${v}" aria-pressed="${theme === v}">${l}</button>`).join('')}</div>
  <section class="panel backup">
    <h2>Tus datos</h2>
    <p>Todo se guarda solo en este teléfono, sin cuenta ni servidor. Si pierdes o cambias el teléfono, solo te salva un respaldo exportado: guárdalo en Drive, en tu correo o en Archivos, e impórtalo en el nuevo.</p>
    <p class="muted">Último respaldo exportado: ${last}</p>
    <div class="row"><button class="btn" data-act="export">Exportar respaldo</button>
    <label class="btn ghost">Importar respaldo<input type="file" accept="application/json,.json" id="import" hidden></label></div>
    <div id="datastatus" class="datastatus" aria-live="polite"><p class="muted">Comprobando la protección…</p></div>
  </section>
  ${state.demo ? `<section class="panel filler">
    <h2>Historial inicial</h2>
    <p>La app empezó con un historial de los meses anteriores para que vieras cómo funcionan las rachas, los calendarios y las gráficas. Bórralo cuando quieras quedarte solo con tus propios registros. Tus hábitos, metas, métricas y listas se mantienen, y también lo que hayas registrado tú.</p>
    <button class="btn ghost" data-act="filler-clear">Borrar historial inicial</button>
  </section>` : ''}
  <h2 class="sub">Ayuda</h2>
  <button class="btn ghost wide" data-act="tour">Ver el tutorial</button>
  <footer class="signature">
    <span class="seal" aria-hidden="true">AXG<br>25</span>
    <p><span class="brand">HabyssT</span>Diseñada y creada por <strong>AXG25</strong>.</p>
    <p class="muted small">2026. Tus datos viven solo en este teléfono.</p>
  </footer>`;
}



export async function exportBackup() {
  const prev = state.lastBackup;
  state.lastBackup = new Date().toISOString();
  const name = `HabyssT-${ymd(new Date())}.json`;
  const text = JSON.stringify(toJSON(state), null, 1);
  try {
    const back = fromJSON(JSON.parse(text)); // the file must read back with everything in it
    if (back.habits.length !== state.habits.length || Object.keys(back.journal).length !== Object.keys(state.journal).length) throw new Error('el archivo no coincide con tus datos');
  } catch (e) {
    state.lastBackup = prev;
    return alert(`No se pudo crear un respaldo fiable (${e.message}). Tus datos siguen intactos; inténtalo de nuevo.`);
  }
  const file = new File([text], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Respaldo de HabyssT' });
    else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  } catch (e) {
    state.lastBackup = prev;
    if (e.name !== 'AbortError') alert(`No se pudo exportar: ${e.message}`);
    return;
  }
  save(state);
  render();
}


export async function importBackup(file) {
  try {
    const next = fromJSON(JSON.parse(await file.text()));
    const days = next.habits.reduce((n, h) => n + next.done[h.id].size, 0);
    if (!confirm(`Este respaldo tiene ${plural(next.habits.length, 'hábito', 'hábitos')} y ${days} registros. Reemplazará los datos de este teléfono (se guarda antes una copia automática). ¿Importar?`)) return;
    await snapshot(state, 'Antes de importar un respaldo');
    setState(next);
    save(state);
    render();
  } catch (e) {
    alert(e instanceof SyntaxError ? 'El archivo está dañado o no es JSON.' : e.message);
  }
}



document.addEventListener('change', e => {
  if (e.target.id === 'import' && e.target.files[0]) importBackup(e.target.files[0]);
});


// Theme: 'system' follows the phone; the choice is per device, like the collapsed panels.
export function setTheme(v) {
  setUi({ theme: v });
  if (v === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = v;
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', paper));
}

// ---- Data protection
export const when = iso => new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export async function fillDataStatus() {
  const box = document.getElementById('datastatus');
  if (!box) return;
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const kb = Math.round((localStorage.getItem('habysst')?.length ?? 0) / 1024);
  const snaps = await listSnapshots();
  if (!document.body.contains(box)) return;
  box.innerHTML = `
    <p class="${persisted ? '' : 'warn'}">${persisted
      ? '<strong>Protegidos.</strong> El navegador no borrará tus datos para liberar espacio.'
      : '<strong>Sin protección del navegador.</strong> Instala HabyssT en tu pantalla de inicio para que el navegador no pueda borrar tus datos, y exporta respaldos con frecuencia.'}</p>
    <p class="muted small">Tus datos ocupan ${kb < 1 ? 'menos de 1' : kb} KB de unos 5.000 KB disponibles.</p>
    <h3>Copias automáticas en este teléfono</h3>
    <p class="muted small">Se guarda una al día y otra antes de importar, borrar o restaurar. Te protegen de errores, no de perder el teléfono.</p>
    ${snaps.length ? `<ul class="log snaps">${snaps.map(x => `<li><span>${when(x.at)}<small>${esc(x.reason)}. ${plural(x.summary.habits, 'hábito', 'hábitos')}, ${x.summary.checks} registros, ${plural(x.summary.entries, 'día', 'días')} de diario.</small></span>
      <button class="link" data-act="restore" data-k="${x.key}" data-at="${x.at}">Restaurar</button></li>`).join('')}</ul>` : '<p class="muted small">Todavía no hay copias. La primera se crea hoy en cuanto registres algo.</p>'}`;
}


export async function restoreSnapshot(key, at) {
  if (!confirm(`¿Volver a tus datos del ${when(at)}? Lo que tienes ahora se guarda antes como otra copia.`)) return;
  try {
    const next = await readSnapshot(key);
    await snapshot(state, 'Antes de restaurar una copia');
    setState(next);
    save(state);
    render();
    stamp('Restaurado');
  } catch (e) {
    alert(`No se pudo restaurar esa copia (${e.message}). Tus datos actuales no se han tocado.`);
  }
}


// Another open tab saved: take its data instead of overwriting it with ours.
addEventListener('storage', e => {
  if (e.key !== 'habysst' || !e.newValue) return;
  try { setState(fromJSON(JSON.parse(e.newValue))); } catch { return; } // the other tab wrote something unreadable: keep ours
  // An open editor points at the old data; closing it saves typed journal text into the new data instead.
  if ($sheet.open) { $sheet.close(); alert('Tus datos se actualizaron desde otra pestaña. Vuelve a abrir lo que estabas editando.'); }
  render();
});
// Leaving the app (switching apps, locking the phone) writes any text still waiting to be saved.

export const actions = {
  'tour': () => startTutorial(),
  'filler-clear': async () => {
    if (!confirm('¿Borrar el historial inicial? Tus hábitos, metas, métricas, listas y lo que hayas registrado tú se mantienen.')) return;
    await snapshot(state, 'Antes de borrar el historial inicial');
    removeFiller(state);
    save(state);
    render();
    stamp('Borrado');
  },
  'restore': (el, e) => { 
    return restoreSnapshot(el.dataset.k, el.dataset.at);
  },
  'theme': (el, e) => { 
    return themeReveal(el.dataset.v, e.clientX, e.clientY);
  },
  'export': (el, e) => { 
    return exportBackup();
  },
};
