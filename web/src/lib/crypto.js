// Tiện ích mật mã dùng WebCrypto (chỉ chạy phía trình duyệt).
//
// - AES-GCM 256: mã hóa có xác thực (authenticated) -> mọi thay đổi trên bản mã
//   trong localStorage đều làm giải mã thất bại, tức là phát hiện được sửa đổi.
// - PBKDF2-SHA256: dẫn xuất khóa từ "device secret", và băm mã PIN một chiều.
// - SHA-256: băm một chiều cho các "ident" (mã vắn tắt) của địa chỉ ví.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function assertCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      'Trình duyệt không cung cấp WebCrypto (cần HTTPS hoặc localhost). Không thể mã hóa két.',
    );
  }
}

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function bytesToB64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomB64(length = 32) {
  return bytesToB64(randomBytes(length));
}

export function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  assertCrypto();
  return toHex(await crypto.subtle.digest('SHA-256', textEncoder.encode(text)));
}

// ---- Dẫn xuất khóa AES-GCM để mã hóa két ------------------------------------

const PBKDF2_ITERATIONS = 150000;
const keyCache = new Map();

async function deriveVaultKey(secret, saltB64) {
  assertCrypto();
  const cacheKey = `${secret}:${saltB64}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const baseKey = await crypto.subtle.importKey('raw', b64ToBytes(secret), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  keyCache.set(cacheKey, key);
  return key;
}

export async function encryptJson(secret, saltB64, value) {
  const key = await deriveVaultKey(secret, saltB64);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    textEncoder.encode(JSON.stringify(value)),
  );
  const packed = new Uint8Array(iv.length + ct.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ct), iv.length);
  return bytesToB64(packed);
}

export async function decryptJson(secret, saltB64, blobB64) {
  const key = await deriveVaultKey(secret, saltB64);
  const packed = b64ToBytes(blobB64);
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(textDecoder.decode(plain));
}

// ---- Băm mã PIN (một chiều, có salt) -----------------------------------------

export async function pbkdf2Hex(password, saltB64, iterations = 120000) {
  assertCrypto();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64ToBytes(saltB64), iterations, hash: 'SHA-256' },
    baseKey,
    256,
  );
  return toHex(bits);
}

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- base64url cho WebAuthn ---------------------------------------------------

export function bytesToB64Url(bytes) {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return b64ToBytes(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
}
