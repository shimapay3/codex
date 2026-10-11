import { decryptJson, encryptJson, randomB64 } from './crypto.js';

// Toàn bộ dữ liệu của ứng dụng nằm trong MỘT bản ghi localStorage đã mã hóa
// (`spa.store.v1`). Khóa mã hóa được dẫn xuất (PBKDF2) từ một "device secret"
// ngẫu nhiên sinh ra trong lần chạy đầu — bản thân nó là thứ duy nhất không thể
// mã hóa được, vì phải đọc được trước khi mở khóa.
//
// Hệ quả bảo mật (đúng với một app thuần trình duyệt, không backend):
//  - Kẻ đọc được localStorage có thể giải mã két. Đây là giới hạn cố hữu của app
//    không có máy chủ; lớp khóa passkey/PIN là cổng truy cập của ứng dụng.
//  - AES-GCM là mã hóa CÓ XÁC THỰC: mọi sửa đổi trên bản mã (ví dụ bàn phím ảo /
//    công cụ nhớ đệm ghi đè địa chỉ) đều khiến giải mã thất bại -> phát hiện được.
//  - Ngoài ra mỗi entry còn có "ident" làm mỏ neo: khi sao chép, địa chỉ phải khớp
//    lại với ident đã lưu, nếu không sẽ cảnh báo và buộc sửa lại địa chỉ.

const DEVICE_KEY = 'spa.device.v1';
const SALT_KEY = 'spa.salt.v1';
const STORE_KEY = 'spa.store.v1';

export const AUTO_LOCK_OPTIONS = [
  { value: 5000, label: '5 giây' },
  { value: 10000, label: '10 giây' },
  { value: 15000, label: '15 giây' },
  { value: 5 * 60 * 1000, label: '5 phút' },
  { value: 10 * 60 * 1000, label: '10 phút' },
  { value: 15 * 60 * 1000, label: '15 phút' },
];

export const DEFAULT_AUTO_LOCK_MS = 10 * 60 * 1000;

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* chế độ riêng tư có thể chặn ghi — bỏ qua, app vẫn chạy trong phiên */
  }
}

export function getDeviceSecret() {
  let secret = safeGet(DEVICE_KEY);
  if (!secret) {
    secret = randomB64(32);
    safeSet(DEVICE_KEY, secret);
  }
  return secret;
}

export function getSalt() {
  let salt = safeGet(SALT_KEY);
  if (!salt) {
    salt = randomB64(16);
    safeSet(SALT_KEY, salt);
  }
  return salt;
}

export function emptyStore() {
  return {
    v: 1,
    theme: 'dark',
    autoLockMs: DEFAULT_AUTO_LOCK_MS,
    auth: null,
    entries: [],
  };
}

export async function readStore() {
  const raw = safeGet(STORE_KEY);
  if (!raw) return null;
  const data = await decryptJson(getDeviceSecret(), getSalt(), raw);
  return { ...emptyStore(), ...data, entries: Array.isArray(data?.entries) ? data.entries : [] };
}

export async function writeStore(data) {
  const blob = await encryptJson(getDeviceSecret(), getSalt(), data);
  safeSet(STORE_KEY, blob);
}

// Chỉ dùng khi két không thể giải mã (mất device secret) hoặc người dùng chọn
// xóa toàn bộ. Vô hiệu hóa vĩnh viễn dữ liệu đã mã hóa.
export function clearStore() {
  try {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(DEVICE_KEY);
    localStorage.removeItem(SALT_KEY);
  } catch {
    /* ignore */
  }
}
