/**
 * Turns the upstream cloud payload into the snapshot shape the web app renders.
 * Money handling mirrors the source page (must.ware.baby) so totals match it.
 */
import { createHash } from 'node:crypto';

const ROUND = 1e12;

export function round6(n) {
  return Math.round(Number(n) * ROUND) / ROUND;
}

/** Parses the loosely typed amounts the sheet stores ("1,5", "12", "1 000"). */
export function parseAmount(input) {
  const raw = (input === null || input === undefined) ? '' : String(input);
  let s = raw.trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    s = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma > -1) {
    s = (s.length - lastComma - 1 <= 2) ? s.replace(',', '.') : s.replace(/,/g, '');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function buildSnapshot(payload, { rate, fetchedAt }) {
  const state = (payload && payload.state) || {};
  const colsIn = Array.isArray(state.cols) ? state.cols : [];
  const rowsIn = Array.isArray(state.rows) ? state.rows : [];

  const rows = rowsIn.map((row, rowIndex) => ({
    index: rowIndex,
    newest: rowIndex === 0,
    cells: colsIn.map((_, colIndex) => {
      const entry = (row.entries && row.entries[colIndex]) || {};
      const ban = parseAmount(entry.v);
      return {
        note: entry.note || '',
        name: entry.n || '',
        raw: entry.v ? String(entry.v) : '',
        ban,
        vnd: round6(ban * rate),
      };
    }),
  }));

  const cols = colsIn.map((col, colIndex) => {
    const ban = round6(rows.reduce((sum, row) => sum + row.cells[colIndex].ban, 0));
    return {
      index: colIndex,
      letter: String.fromCharCode(65 + colIndex),
      name: col.name || '',
      ban,
      vnd: round6(ban * rate),
    };
  });

  const grandBan = round6(cols.reduce((sum, col) => sum + col.ban, 0));

  return {
    status: cols.length ? 'live' : 'empty',
    sheetName: state.sheetName || '',
    updated: payload?.updated || null,
    savedAt: state.savedAt || null,
    fetchedAt,
    rate,
    cols,
    rows,
    totals: { ban: grandBan, vnd: round6(grandBan * rate) },
    stats: payload?.stats || null,
    error: null,
  };
}

/** Content fingerprint — clients flash only the cells that actually changed. */
export function revisionOf(snapshot) {
  const shape = [
    snapshot.sheetName,
    snapshot.cols.map((c) => c.name),
    snapshot.rows.map((r) => r.cells.map((c) => [c.note, c.name, c.raw])),
  ];
  return createHash('sha1').update(JSON.stringify(shape)).digest('hex').slice(0, 16);
}
