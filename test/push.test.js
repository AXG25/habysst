import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { encrypt, vapid, due, minuteOfWeek, parseSync } from '../worker/index.js';

test('payload encryption matches the RFC 8291 example', async () => {
  const body = await encrypt(
    'When I grow up, I want to be a watermelon',
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    'BTBZMqHH6r4Tts7J_aSIgg',
    { pub: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8', priv: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw' },
    Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url'),
  );
  assert.equal(Buffer.from(body).toString('base64url'),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('VAPID token is signed by the server key for the push service origin', async () => {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const env = { VAPID_SUBJECT: 'https://x.test/', VAPID_PUBLIC: Buffer.from(await crypto.subtle.exportKey('raw', k.publicKey)).toString('base64url'), VAPID_PRIVATE: (await crypto.subtle.exportKey('jwk', k.privateKey)).d };
  const header = await vapid('https://fcm.googleapis.com/fcm/send/abc', env, 0);
  const [, jwt, key] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(key, env.VAPID_PUBLIC);
  const [h, c, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url')), { aud: 'https://fcm.googleapis.com', exp: 43200, sub: 'https://x.test/' });
  const pub = createPublicKey({ key: await crypto.subtle.exportKey('jwk', k.publicKey), format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
});

test('minute of week follows the phone time zone', () => {
  const t = Date.UTC(2026, 10, 23, 2, 30); // Mon 23 Nov 02:30 UTC
  assert.equal(minuteOfWeek(t, 'UTC'), 2 * 60 + 30);
  assert.equal(minuteOfWeek(t, 'America/Bogota'), 6 * 1440 + 21 * 60 + 30); // Sun 21:30
});

test('due: fires once in its minute, by weekday, catching up a few late minutes', () => {
  const tz = 'America/Bogota'; // UTC-5, no daylight saving
  const at = (day, h, m) => Date.UTC(2026, 10, day, h + 5, m); // local time in Bogotá, Nov 2026 (23 = Monday)
  const items = [{ t: '21:00', d: [0, 2], title: 'Leer' }, { t: '07:15', d: [0, 1, 2, 3, 4, 5, 6], title: 'Agua' }, { t: '21:00', d: [0], title: 'Leer' }];
  assert.deepEqual(due(items, tz, at(23, 20, 59), at(23, 21, 0)), ['Leer']); // deduped
  assert.deepEqual(due(items, tz, at(23, 21, 0), at(23, 21, 1)), []); // already handled
  assert.deepEqual(due(items, tz, at(24, 20, 59), at(24, 21, 0)), []); // Tuesday: not scheduled
  assert.deepEqual(due(items, tz, at(23, 20, 55), at(23, 21, 3)), ['Leer']); // late cron still sends
  assert.deepEqual(due(items, tz, at(23, 20, 0), at(23, 21, 30)), []); // too late: dropped
  assert.deepEqual(due(items, tz, at(29, 7, 14), at(29, 7, 15)), ['Agua']); // Sunday
  assert.deepEqual(due(items, tz, at(22, 23, 59), at(23, 0, 1)), []); // across midnight, nothing due
  assert.deepEqual(due([{ t: '00:00', d: [0], title: 'X' }], tz, at(22, 23, 59), at(23, 0, 0)), ['X']); // Sunday→Monday
});

test('parseSync accepts a real subscription and rejects other URLs and bad items', () => {
  const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16, 1).toString('base64url') } };
  const ok = { sub, tz: 'Europe/Madrid', items: [{ t: '09:30', d: [3, 1, 1, 9], title: ' Leer ' }] };
  assert.deepEqual(parseSync(ok).items, [{ t: '09:30', d: [1, 3], title: 'Leer' }]);
  assert.equal(parseSync({ ...ok, sub: { ...sub, endpoint: 'https://evil.example/push.apple.com' } }), null);
  assert.equal(parseSync({ ...ok, sub: { ...sub, endpoint: 'http://web.push.apple.com/abc' } }), null);
  assert.equal(parseSync({ ...ok, tz: 'Mars/Base' }), null);
  assert.equal(parseSync({ ...ok, items: [{ t: '25:00', d: [1], title: 'x' }] }), null);
  assert.equal(parseSync({ ...ok, items: [{ t: '09:00', d: [], title: 'x' }] }), null);
  assert.deepEqual(parseSync({ ...ok, items: [] }).items, []); // no reminders left: the server forgets the phone
});
