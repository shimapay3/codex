export function formatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString('vi-VN', { hour12: false });
  } catch {
    return '';
  }
}

export function formatDateTime(ts) {
  try {
    return new Date(ts).toLocaleString('vi-VN', { hour12: false });
  } catch {
    return '';
  }
}

export function formatLockDuration(ms) {
  if (ms % 60000 === 0) return `${ms / 60000} phút`;
  return `${ms / 1000} giây`;
}
