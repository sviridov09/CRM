// Web Push без зависимостей, на Web Crypto (работает в Deno и Node):
//  * шифрование сообщения — RFC 8291 + RFC 8188, кодирование aes128gcm (его понимают все браузеры,
//    включая Safari/iOS; старое aesgcm — нет);
//  * подпись VAPID — RFC 8292 (JWT ES256).
// Проверено расшифровкой эталонной библиотекой http_ece (автор RFC 8188).

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

export type VapidKeys = {
  privateJWK: JsonWebKey; // EC P-256: kty, crv, x, y, d
  subject: string; // контакт для push-сервиса: https://… или mailto:…
};

const te = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

/** HKDF-SHA256: extract + expand одним вызовом. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

/** Тело запроса aes128gcm (RFC 8291 §3.4): заголовок salt|rs|idlen|keyid + шифротекст. */
export async function encryptPayload(
  plaintext: Uint8Array,
  p256dh: string,
  authSecret: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(p256dh); // 65 байт, несжатая точка P-256
  const auth = b64urlDecode(authSecret); // 16 байт

  // Одноразовая пара ключей сервера на каждое сообщение
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));

  // IKM = HKDF(auth, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const keyInfo = concat(te.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(auth, ecdhSecret, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);

  // Одна запись: данные + разделитель 0x02 (последняя запись), без паддинга
  const record = concat(plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

/** VAPID (RFC 8292): Authorization: vapid t=<JWT ES256>, k=<публичный ключ>. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys): Promise<string> {
  const { x, y } = vapid.privateJWK;
  const publicRaw = concat(new Uint8Array([4]), b64urlDecode(x!), b64urlDecode(y!));
  const key = await crypto.subtle.importKey("jwk", vapid.privateJWK, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
  const header = b64urlEncode(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(
    te.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // не больше 24 ч
        sub: vapid.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  // Web Crypto отдаёт подпись ECDSA уже в формате JOSE (r||s, 64 байта)
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(unsigned)),
  );
  return `vapid t=${unsigned}.${b64urlEncode(signature)}, k=${b64urlEncode(publicRaw)}`;
}

/** Отправка одного push. Возвращает HTTP-статус push-сервиса (201 — принято; 404/410 — подписки больше нет). */
export async function sendWebPush(
  subscription: PushSubscriptionKeys,
  payload: unknown,
  vapid: VapidKeys,
  options: { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string } = {},
): Promise<number> {
  const body = await encryptPayload(te.encode(JSON.stringify(payload)), subscription.p256dh, subscription.auth);
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(subscription.endpoint, vapid),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(options.ttl ?? 3600),
    Urgency: options.urgency ?? "normal",
  };
  if (options.topic) headers.Topic = options.topic;
  const res = await fetch(subscription.endpoint, { method: "POST", headers, body });
  return res.status;
}
