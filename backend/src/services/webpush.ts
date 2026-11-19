/**
 * Web Push thuần WebCrypto cho Cloudflare Workers (không phụ thuộc thư viện Node).
 *  - RFC 8291: mã hóa nội dung aes128gcm
 *  - RFC 8292: xác thực VAPID (JWT ES256)
 * Hoạt động với Apple (iOS 16.4+ PWA trên màn hình chính), FCM (Android/Chrome), Mozilla, Edge.
 */

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string; // base64url, khóa công khai P-256 dạng raw 65 byte
  auth: string; // base64url, 16 byte
}

export interface VapidConfig {
  publicKey: string; // base64url raw 65 byte
  privateKey: string; // base64url 32 byte (d)
  subject: string; // mailto: hoặc https:
}

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

const enc = new TextEncoder();
/** Ép kiểu cho WebCrypto (TS 5.7 phân biệt ArrayBuffer / SharedArrayBuffer) */
const B = (u: Uint8Array) => u as unknown as BufferSource;

export function b64urlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', B(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, B(data)));
}

// Cache khóa ký VAPID theo isolate
let cachedSigningKey: { pub: string; key: CryptoKey } | null = null;

async function getSigningKey(vapid: VapidConfig): Promise<CryptoKey> {
  if (cachedSigningKey?.pub === vapid.publicKey) return cachedSigningKey.key;
  const pub = b64urlToBytes(vapid.publicKey);
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: vapid.privateKey,
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65)),
      ext: true
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  cachedSigningKey = { pub: vapid.publicKey, key };
  return key;
}

// JWT VAPID dùng lại theo từng push service (audience) trong ~10 phút
const jwtCache = new Map<string, { token: string; exp: number }>();

async function vapidJwt(audience: string, vapid: VapidConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const cached = jwtCache.get(audience);
  if (cached && cached.exp - now > 60 * 60) return cached.token;

  const exp = now + 12 * 60 * 60;
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(enc.encode(JSON.stringify({ aud: audience, exp, sub: vapid.subject })));
  const unsigned = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await getSigningKey(vapid),
    B(enc.encode(unsigned))
  );
  const token = `${unsigned}.${bytesToB64url(sig)}`;
  jwtCache.set(audience, { token, exp });
  return token;
}

/** Mã hóa payload theo RFC 8291 (aes128gcm, 1 record). */
async function encryptPayload(sub: PushSubscriptionRecord, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(sub.p256dh);
  const authSecret = b64urlToBytes(sub.auth);

  const asKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits'
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', asKeys.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', B(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as any, asKeys.privateKey, 256)
  );

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || ua_public || as_public, 32)
  const prkKey = await hmac(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const aesKey = await crypto.subtle.importKey('raw', B(cek), { name: 'AES-GCM' }, false, ['encrypt']);
  const padded = concat(plaintext, new Uint8Array([2])); // 0x02 = record cuối
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: B(nonce) }, aesKey, B(padded)));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export type PushResult = { ok: boolean; status: number; gone: boolean };

export async function sendWebPush(
  sub: PushSubscriptionRecord,
  message: PushMessage,
  vapid: VapidConfig,
  options: { ttl?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string } = {}
): Promise<PushResult> {
  try {
    const url = new URL(sub.endpoint);
    const jwt = await vapidJwt(url.origin, vapid);
    const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)));

    const headers: Record<string, string> = {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(options.ttl ?? 24 * 60 * 60),
      Urgency: options.urgency || 'high'
    };
    // Topic: thông báo mới cùng chủ đề sẽ thay thế thông báo cũ chưa giao (tối đa 32 ký tự base64url)
    if (options.topic) headers.Topic = options.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);

    const res = await fetch(sub.endpoint, { method: 'POST', headers, body: B(body) });
    return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
  } catch (err) {
    console.error('Web push failed:', err);
    return { ok: false, status: 0, gone: false };
  }
}
