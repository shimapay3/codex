import {
  b64UrlToBytes,
  bytesToB64Url,
  pbkdf2Hex,
  randomB64,
  randomBytes,
  timingSafeEqual,
} from './crypto.js';

// Passkey (WebAuthn, authenticator nền tảng) là phương thức chính — ChromeOS Flex
// có sẵn authenticator nền tảng. Nếu thiết bị/trình duyệt không có passkey, ứng
// dụng cho phép đặt mã PIN dự phòng để vẫn dùng được.

export async function passkeySupported() {
  try {
    if (!globalThis.PublicKeyCredential || !navigator.credentials?.create) return false;
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function createPasskey(userName = 'secure-pay-address') {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Secure Pay Address' },
      user: {
        id: randomBytes(16),
        name: userName,
        displayName: 'Secure Pay Address',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!credential) throw new Error('Không tạo được passkey.');
  return bytesToB64Url(new Uint8Array(credential.rawId));
}

export async function assertPasskey(credentialId) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials: credentialId
        ? [{ type: 'public-key', id: b64UrlToBytes(credentialId) }]
        : [],
    },
  });
  return Boolean(assertion);
}

export async function createPinRecord(pin) {
  const pinSalt = randomB64(16);
  const pinHash = await pbkdf2Hex(pin, pinSalt);
  return { pinSalt, pinHash };
}

export async function verifyPin(pin, auth) {
  if (!auth?.pinSalt || !auth?.pinHash) return false;
  const hash = await pbkdf2Hex(String(pin), auth.pinSalt);
  return timingSafeEqual(hash, auth.pinHash);
}

export function pinIssue(pin) {
  return /^\d{4,8}$/.test(String(pin ?? '')) ? null : 'Mã PIN gồm 4–8 chữ số.';
}

export function friendlyAuthError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
      return 'Đã hủy hoặc quá thời gian xác thực.';
    case 'InvalidStateError':
      return 'Passkey này đã có trên thiết bị.';
    case 'NotSupportedError':
      return 'Thiết bị hoặc trình duyệt không hỗ trợ passkey.';
    case 'SecurityError':
      return 'Passkey cần kết nối HTTPS ổn định.';
    case 'AbortError':
      return 'Yêu cầu xác thực đã bị dừng.';
    default:
      return error?.message || 'Không xác thực được.';
  }
}
