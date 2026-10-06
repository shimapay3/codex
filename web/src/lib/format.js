const vndFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const banFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 12 });

export const formatVnd = (value) => `${vndFormat.format(Math.round(Number(value) || 0))} ₫`;

export const formatBan = (value) => banFormat.format(Number(value) || 0);

/** Vietnamese reading of an amount, e.g. 3.600.000 → "3 Triệu 600 Ngàn Đồng". */
export function readVndWords(value) {
  let n = Math.round(Number(value) || 0);
  if (n <= 0) return '0 Đồng';

  const units = [
    [1e9, 'Tỷ'],
    [1e6, 'Triệu'],
    [1e3, 'Ngàn'],
  ];
  const parts = [];
  for (const [size, label] of units) {
    const q = Math.floor(n / size);
    if (q > 0) {
      parts.push(`${q.toLocaleString('vi-VN')} ${label}`);
      n -= q * size;
    }
  }
  if (n > 0) parts.push(`${n.toLocaleString('vi-VN')} Đồng`);
  return parts.join(' ');
}

export const formatClock = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('vi-VN');
};
