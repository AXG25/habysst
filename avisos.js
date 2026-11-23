// Habit reminders as push notifications, sent by the server in worker/ (see README).
// The phone sends the server its reminders whenever they change; the habit data itself stays here.

// Fill in after deploying the worker (README, "Avisos"). Empty: reminders are saved but nothing is sent.
const API = 'https://habysst-push.habysst.workers.dev';
const VAPID_PUBLIC = 'BLc8IOxkY3fWDCdA5HC2nFQOL94sMqUEzDXhPeFUOyanSV8YAnUBp7KDUmbsNOe7dKWgVIEKrTMYxGnC3ZT5tfs';

const LAST = 'habysst:push'; // what the server last received from this phone

const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Why this phone can't get reminders, or '' when it can.
export function blocker() {
  if (!API || !VAPID_PUBLIC) return 'Los avisos aún no están activados en esta versión de la app.';
  if (ios && !installed) return 'En iPhone los avisos solo llegan con la app instalada: en Safari o Chrome toca Compartir → «Añadir a pantalla de inicio» y abre HabyssT desde ahí.';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'Este navegador no puede recibir avisos.';
  if (Notification.permission === 'denied') return 'Bloqueaste los avisos de HabyssT. Actívalos en los ajustes del teléfono para esta app.';
  return '';
}

const items = habits => habits.flatMap(h => (h.reminders ?? []).map(r => ({ t: r.t, d: r.d, title: h.name, msg: r.msg ?? '', id: h.id })));
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

async function post(sub, list, test = false) {
  const res = await fetch(`${API}/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub, tz: tz(), items: list, test }) });
  if (!res.ok) throw new Error(`push sync ${res.status}`);
}

// Must run inside a tap (iPhone only asks for permission then). Returns an error message or ''.
export async function enable(habits) {
  const why = blocker();
  if (why) return why;
  if ((await Notification.requestPermission()) !== 'granted') return 'Sin permiso no podemos avisarte. Puedes darlo más tarde al guardar un recordatorio.';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC }));
    const list = items(habits);
    await post(sub.toJSON(), list, true);
    remember(sub, list);
    return '';
  } catch (e) {
    console.warn('HabyssT: avisos', e);
    return 'No se pudieron activar los avisos. Revisa tu conexión e inténtalo de nuevo.';
  }
}

const key = (sub, list) => JSON.stringify([sub.endpoint, tz(), list]);
const remember = (sub, list) => { try { localStorage.setItem(LAST, key(sub, list)); } catch {} };

// Called after every render: sends the reminders only when they (or the time zone) changed.
let running = null;
export function sync(habits) {
  if (blocker() || Notification.permission !== 'granted') return;
  const list = items(habits);
  running = (running ?? Promise.resolve()).then(async () => {
    const reg = await navigator.serviceWorker.ready;
    // A browser can drop a subscription; permission is already granted, so it is renewed without asking.
    const sub = (await reg.pushManager.getSubscription()) ?? (list.length ? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC }) : null);
    if (!sub) return;
    let last = null;
    try { last = localStorage.getItem(LAST); } catch {}
    if (last === key(sub, list)) return;
    await post(sub.toJSON(), list);
    remember(sub, list);
  }).catch(e => console.warn('HabyssT: avisos', e)); // offline: retried on the next render
}
