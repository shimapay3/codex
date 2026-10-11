// Hàng đợi thông báo rất nhỏ, không cần context.

const listeners = new Set();
let seq = 0;

export function toast(message, kind = 'info', ttl = 4000) {
  const item = { id: (seq += 1), message, kind, ttl };
  listeners.forEach((listener) => listener(item));
  return item.id;
}

export function subscribeToasts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
