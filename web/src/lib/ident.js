import { sha256Hex } from './crypto.js';
import { normalizeAddress } from './address.js';

// "Ident" là mã vắn tắt của địa chỉ, ví dụ: TX***Gm**27h***pgn
//
// Nó đóng vai trò MỎ NEO chống giả mạo:
//  - Chỉ được tạo một lần, gắn cứng vào vị trí các ký tự trong địa chỉ gốc.
//  - Không thể sửa sau khi lưu.
//  - Mỗi lần sao chép, địa chỉ trong localStorage phải khớp lại đúng các ký tự ở
//    các vị trí đã neo; nếu bàn phím ảo / công cụ nhớ đệm ghi đè địa chỉ thì
//    không khớp -> cảnh báo và buộc sửa lại địa chỉ.
//  - Dấu vân tay SHA-256 (một chiều) của ident cũng được lưu và đối chiếu lại.

const SEPARATOR = '***';

export function parseIdentChunks(rawIdent) {
  return String(rawIdent ?? '')
    .split(/\*+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

export function formatIdent(chunks) {
  return chunks.join(SEPARATOR);
}

// Gợi ý ident từ địa chỉ: 4 mảnh (2-2-3-3 ký tự) trải đều theo chiều dài.
export function suggestIdent(value) {
  const address = normalizeAddress(value);
  const n = address.length;
  if (n < 14) return '';

  const spans = [
    { start: 0, length: 2 },
    { start: Math.round(n * 0.32), length: 2 },
    { start: Math.round(n * 0.63), length: 3 },
    { start: n - 3, length: 3 },
  ];

  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    const previous = spans[i - 1];
    if (span.start < 0 || span.start + span.length > n) return '';
    if (previous && span.start < previous.start + previous.length + 1) return '';
  }

  return formatIdent(spans.map((span) => address.slice(span.start, span.start + span.length)));
}

// Tìm lần lượt từng mảnh của ident trong địa chỉ, theo đúng thứ tự và không
// chồng lấn. Trả về vị trí neo, hoặc null nếu không khớp.
export function anchorChunks(address, chunks) {
  const positions = [];
  let cursor = 0;
  for (const chunk of chunks) {
    const start = address.indexOf(chunk, cursor);
    if (start === -1) return null;
    positions.push({ start, chunk });
    cursor = start + chunk.length;
  }
  return positions;
}

export function buildIdent({ address, ident }) {
  const value = normalizeAddress(address);
  const chunks = parseIdentChunks(ident);
  if (!chunks.length) return { ok: false, reason: 'Chưa có ident cho địa chỉ này.' };
  if (chunks.some((chunk) => chunk.length > 8)) {
    return { ok: false, reason: 'Mỗi mảnh ident tối đa 8 ký tự.' };
  }
  const positions = anchorChunks(value, chunks);
  if (!positions) {
    return {
      ok: false,
      reason: 'Các mảnh của ident không xuất hiện trong địa chỉ theo đúng thứ tự.',
    };
  }
  return { ok: true, ident: formatIdent(chunks), positions };
}

// Đối chiếu lại địa chỉ đang lưu với ident đã neo (chạy mỗi lần sao chép).
export async function verifyEntryIdent(entry) {
  const positions = Array.isArray(entry?.identPositions) ? entry.identPositions : [];
  const address = normalizeAddress(entry?.address);
  if (!entry?.ident || !positions.length) {
    return { ok: false, reason: 'Mục này thiếu ident để đối chiếu.' };
  }
  for (const position of positions) {
    const slice = address.slice(position.start, position.start + position.chunk.length);
    if (slice !== position.chunk) {
      return { ok: false, reason: 'Địa chỉ đã lệch khỏi ident đã lưu.' };
    }
  }
  const fingerprint = await sha256Hex(entry.ident);
  if (entry.identHash && entry.identHash !== fingerprint) {
    return { ok: false, reason: 'Dấu vân tay của ident không khớp.' };
  }
  return { ok: true };
}

export async function identFingerprint(ident) {
  return sha256Hex(ident);
}
