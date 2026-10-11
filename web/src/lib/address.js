// Địa chỉ ví SOL là chuỗi base58 (32–44 ký tự, phân biệt hoa/thường).

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function normalizeAddress(value) {
  return String(value ?? '').trim();
}

export function isValidSolAddress(value) {
  return BASE58_RE.test(normalizeAddress(value));
}

export function addressIssue(value) {
  const address = normalizeAddress(value);
  if (!address) return 'Chưa nhập địa chỉ ví SOL.';
  if (address.length < 32 || address.length > 44) {
    return `Địa chỉ SOL dài 32–44 ký tự (hiện ${address.length}).`;
  }
  if (!BASE58_RE.test(address)) {
    return 'Địa chỉ chỉ gồm ký tự base58 (không có 0, O, I, l).';
  }
  return null;
}

export function shortAddress(value, head = 4, tail = 4) {
  const address = normalizeAddress(value);
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
