// Bảng màu cho nhãn danh bạ — mỗi nhãn một màu nổi bật, chữ trên nền màu đó.
export const LABEL_COLORS = [
  { id: 'aurora', name: 'Cực quang', hex: '#5eead4', ink: '#04231f' },
  { id: 'violet', name: 'Tinh vân', hex: '#a78bfa', ink: '#1b1035' },
  { id: 'sky', name: 'Chân trời', hex: '#38bdf8', ink: '#04202e' },
  { id: 'gold', name: 'Hoàng kim', hex: '#fbbf24', ink: '#2b1a00' },
  { id: 'rose', name: 'Hồng đào', hex: '#fb7185', ink: '#3a0713' },
  { id: 'lime', name: 'Lục bảo', hex: '#a3e635', ink: '#1b2705' },
  { id: 'ember', name: 'Than hồng', hex: '#fb923c', ink: '#331400' },
  { id: 'ice', name: 'Băng', hex: '#e2e8f0', ink: '#0b1220' },
];

export function colorOf(id) {
  return LABEL_COLORS.find((color) => color.id === id) ?? LABEL_COLORS[0];
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
