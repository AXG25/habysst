// HabyssT push server (Cloudflare Worker + D1).
// The app sends each phone's reminders here; a cron every minute sends the ones that are due.
// Stored per phone: its push address, time zone, and each reminder's time, weekdays and habit name.

const MAX_ITEMS = 100;
// shortcut: the free plan caps work per run, so at most BATCH phones get a push each minute and the rest
// follow the next minute (a reminder is still sent up to WINDOW minutes late). Raise BATCH on the paid plan.
const BATCH = 25;
const WINDOW = 15;
const WEEK = 7 * 1440;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// Only real browser push services: the worker must never be usable to POST to arbitrary URLs.
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', '.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'];

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};
const subtle = crypto.subtle;

// ---- Schedule

// Local minute of the week (0 = Monday 00:00) of instant `ms` in time zone `tz`.
const WDAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const fmts = new Map();
export function minuteOfWeek(ms, tz) {
  if (!fmts.has(tz)) fmts.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  const p = Object.fromEntries(fmts.get(tz).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return WDAY[p.weekday] * 1440 + +p.hour * 60 + +p.minute;
}

// Names of the habits with a reminder in the minutes after `from` up to and including `to` (at most WINDOW back).
export function due(items, tz, from, to) {
  const span = Math.min(Math.floor(to / 6e4) - Math.floor(from / 6e4), WINDOW);
  if (span <= 0) return [];
  const now = minuteOfWeek(to, tz);
  const names = new Set();
  for (const it of items) {
    const [h, m] = it.t.split(':').map(Number);
    if (it.d.some(d => (now - (d * 1440 + h * 60 + m) + WEEK) % WEEK < span)) names.add(it.title);
  }
  return [...names];
}

// ---- Web Push (RFC 8291 payload encryption, RFC 8292 VAPID)

const hkdf = async (salt, ikm, info, bytes) =>
  new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bytes * 8));

const ecJwk = (pub, d) => ({ kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ...(d ? { d } : {}) });

// `sender` and `salt` are only passed by tests (RFC 8291 test vector); real messages use fresh ones.
export async function encrypt(payload, p256dh, auth, sender, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const ua = unb64u(p256dh);
  const as = sender
    ? { privateKey: await subtle.importKey('jwk', ecJwk(unb64u(sender.pub), sender.priv), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']), pub: unb64u(sender.pub) }
    : await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']).then(async k => ({ privateKey: k.privateKey, pub: new Uint8Array(await subtle.exportKey('raw', k.publicKey)) }));
  const uaKey = await subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(unb64u(auth), secret, concat(enc.encode('WebPush: info\0'), ua, as.pub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const body = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  return concat(salt, new Uint8Array([0, 0, 16, 0, 65]), as.pub, body); // record size 4096, key id = sender public key
}

export async function vapid(endpoint, env, now = Date.now()) {
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })));
  const key = await subtle.importKey('jwk', ecJwk(unb64u(env.VAPID_PUBLIC), env.VAPID_PRIVATE), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}

async function push(row, message, env) {
  return fetch(row.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapid(row.endpoint, env), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(WINDOW * 60), Urgency: 'high' },
    body: await encrypt(JSON.stringify(message), row.p256dh, row.auth),
  });
}

// ---- Validation of what a phone sends (trust boundary)

const okHost = h => PUSH_HOSTS.some(p => (p.startsWith('.') ? h.endsWith(p) : h === p));
const keyLen = (s, n) => { try { return typeof s === 'string' && unb64u(s).length === n; } catch { return false; } };
const okZone = tz => { try { return typeof tz === 'string' && tz.length < 64 && !!new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { return false; } };

export function parseSync(body) {
  const s = body?.sub;
  let url;
  try { url = new URL(s?.endpoint); } catch { return null; }
  if (url.protocol !== 'https:' || !okHost(url.hostname) || s.endpoint.length > 1024) return null;
  if (!keyLen(s.keys?.p256dh, 65) || !keyLen(s.keys?.auth, 16) || !okZone(body.tz)) return null;
  if (!Array.isArray(body.items) || body.items.length > MAX_ITEMS) return null;
  const items = [];
  for (const it of body.items) {
    const d = Array.isArray(it?.d) ? [...new Set(it.d)].filter(x => Number.isInteger(x) && x >= 0 && x < 7).sort() : [];
    const title = typeof it?.title === 'string' ? it.title.trim().slice(0, 60) : '';
    if (!TIME.test(it?.t) || !d.length || !title) return null;
    items.push({ t: it.t, d, title });
  }
  return { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, tz: body.tz, items, test: body.test === true };
}

// ---- Worker

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const reply = (status, text = '') => new Response(text, { status, headers: CORS });

export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return reply(204);
    if (req.method !== 'POST' || new URL(req.url).pathname !== '/sync') return reply(404);
    const raw = await req.text();
    if (raw.length > 32768) return reply(413);
    let s;
    try { s = parseSync(JSON.parse(raw)); } catch { s = null; }
    if (!s) return reply(400, 'Datos no válidos');
    if (!s.items.length) {
      await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(s.endpoint).run();
      return reply(204);
    }
    await env.DB.prepare(`INSERT INTO subs (endpoint, p256dh, auth, tz, items, sent) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz, items = excluded.items, sent = excluded.sent`)
      .bind(s.endpoint, s.p256dh, s.auth, s.tz, JSON.stringify(s.items), Date.now()).run();
    if (s.test) ctx.waitUntil(push(s, { test: true }, env).catch(() => {}));
    return reply(204);
  },

  async scheduled(_event, env) {
    const now = Date.now();
    const { results } = await env.DB.prepare('SELECT * FROM subs ORDER BY sent').all();
    const batch = [];
    for (const row of results) {
      const habits = due(JSON.parse(row.items), row.tz, row.sent, now);
      if (habits.length) batch.push([row, habits]);
      if (batch.length >= BATCH) break;
    }
    await Promise.all(batch.map(async ([row, habits]) => {
      try {
        const res = await push(row, { habits }, env);
        // 404/410: the phone unsubscribed or uninstalled the app. 429/5xx: retry next minute. Other 4xx: our fault, don't loop.
        if (res.status === 404 || res.status === 410) await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?').bind(row.endpoint).run();
        else if (res.ok || res.status < 429) await env.DB.prepare('UPDATE subs SET sent = ? WHERE endpoint = ?').bind(now, row.endpoint).run();
      } catch (e) {
        console.warn('push failed', e);
      }
    }));
  },
};
