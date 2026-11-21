// Guided tour with Driver.js (vendored in vendor/driver, MIT). Runs once on first open; Ajustes can replay it.
import { state, setTab } from './core.js';
import { setUi } from './ui.js';
import { render } from './app.js';

const goTab = t => { setTab(t); render(); };
// Driver.js 1.3 takes selectors, resolved when the step starts (after the tab has switched).
const wrap = id => `.fold-wrap:has(#${id})`;

const STEPS = [
  { tab: 'hoy', popover: { title: 'Bienvenido a HabyssT', description: 'Ya tienes un punto de partida: los hábitos que más cambian una vida, dos metas, métricas y listas. En un minuto te enseño dónde está todo.' } },
  { tab: 'hoy', element: wrap('fold-habits'), popover: { title: 'Tus hábitos de hoy', description: 'Toca uno para marcarlo. Los pendientes quedan arriba y los hechos bajan. La tira de abajo es tu racha de las últimas dos semanas.', side: 'bottom' } },
  { tab: 'hoy', element: '.fold-wrap:has(#fold-habits) .sec-act', popover: { title: 'Añadir y editar', description: 'Con + creas un hábito nuevo. Con Editar cambias el nombre, la frecuencia (diario, días concretos o veces por semana) o la trama.', side: 'bottom', align: 'end' } },
  { tab: 'hoy', element: wrap('fold-checkin'), popover: { title: 'Cómo estás', description: 'Dos toques al día: ánimo y energía. Aquí también registras cómo dormiste y abres tu diario.', side: 'top' } },
  { tab: 'hoy', element: wrap('fold-metrics'), popover: { title: 'Métricas', description: 'Números que quieras seguir, como tu peso o tu tiempo de pantalla. Toca una para registrar el valor de hoy y ver su historial.', side: 'top' } },
  { tab: 'hoy', element: '.focusbox', popover: { title: 'Enfoque', description: 'Sesiones de Pomodoro con un modo zen a pantalla completa. Puedes dedicarlas a una meta.', side: 'top' } },
  { tab: 'rachas', element: '.cal', popover: { title: 'Tus rachas', description: 'Cada hábito es una línea de tinta: mientras no la rompes, sigue creciendo. Toca un día para corregirlo.', side: 'bottom' } },
  { tab: 'rachas', element: '#view .seg', popover: { title: 'Año y análisis', description: 'Mira el año entero o el análisis: qué te funciona según tus propios datos, por ejemplo cómo cambia tu energía cuando duermes más.', side: 'bottom' } },
  { tab: 'diario', element: '.review-seg', popover: { title: 'Revisiones', description: 'Cada semana, mes, trimestre y año: qué funcionó, qué no y cuál es tu prioridad. Esa prioridad aparecerá arriba en Hoy.', side: 'bottom' } },
  { tab: 'metas', element: '.goals', popover: { title: 'Metas', description: 'Cada meta tiene un plan concreto: "si pasa esto, entonces hago aquello". La marca roja de la barra te dice dónde deberías ir hoy.', side: 'bottom' } },
  { tab: 'metas', element: '#view .seg', popover: { title: 'Listas', description: 'Aquí están tus listas: la compra, las cosas que quieres hacer antes de morir o lo que necesites.', side: 'bottom' } },
  { tab: 'habitos', element: '.backup', popover: { title: 'Tus datos', description: 'Todo se guarda solo en este teléfono. Exporta un respaldo de vez en cuando: es lo que te permite pasarlo a otro teléfono.', side: 'top' } },
  { tab: 'habitos', element: '.filler', when: () => !!state.demo, popover: { title: 'Historial inicial', description: 'Para que veas cómo funcionan las rachas y las gráficas, la app empieza con un historial de los últimos meses. Cuando quieras quedarte solo con tus propios registros, bórralo aquí.', side: 'top' } },
  { tab: 'hoy', popover: { title: 'Listo', description: 'Empieza por lo más fácil: marca los hábitos que ya hiciste hoy.' } },
];

export async function startTutorial() {
  setUi({ tutorialDone: true }); // set first, so an interrupted tour does not come back on every open
  if (!document.querySelector('link[href="vendor/driver/driver.css"]'))
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'vendor/driver/driver.css' }));
  let driver;
  try { ({ driver } = await import('./vendor/driver/driver.js')); } catch { return; } // offline before first load: skip quietly
  const steps = STEPS.filter(s => !s.when || s.when());
  const tour = driver({
    showProgress: true, progressText: '{{current}} de {{total}}',
    nextBtnText: 'Siguiente', prevBtnText: 'Atrás', doneBtnText: 'Empezar',
    popoverClass: 'habysst-tour', stagePadding: 6, stageRadius: 4,
    steps: steps.map((s, i) => ({
      element: s.element,
      popover: {
        ...s.popover,
        // Switch tabs before the next step looks for its element.
        onNextClick: () => { const n = steps[i + 1]; if (n) { goTab(n.tab); tour.moveNext(); } else tour.destroy(); },
        onPrevClick: () => { const p = steps[i - 1]; if (p) { goTab(p.tab); tour.movePrevious(); } },
      },
    })),
    onDestroyed: () => goTab('hoy'),
  });
  goTab(steps[0].tab);
  tour.drive();
}
