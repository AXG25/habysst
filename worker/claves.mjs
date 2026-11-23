// Genera el par de claves VAPID una sola vez: node claves.mjs
const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
const pub = Buffer.from(await crypto.subtle.exportKey('raw', k.publicKey)).toString('base64url');
const { d } = await crypto.subtle.exportKey('jwk', k.privateKey);
console.log(`VAPID_PUBLIC  (wrangler.toml y avisos.js): ${pub}\nVAPID_PRIVATE (secreto, solo en Cloudflare): ${d}`);
