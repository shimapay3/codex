import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBan, formatVnd, readVndWords } from '../lib/format.js';

const cellFingerprint = (cell) => `${cell.note}|${cell.name}|${cell.raw}`;

export default function LedgerTable({ snapshot, connection }) {
  const [query, setQuery] = useState('');
  const [flashed, setFlashed] = useState(() => new Set());
  const [entering, setEntering] = useState(true);
  const seenRef = useRef(null);

  const cols = snapshot?.cols || [];
  const rows = snapshot?.rows || [];
  const totals = snapshot?.totals || { ban: 0, vnd: 0 };

  // Entrance animation only on the very first paint, so live updates stay calm.
  useEffect(() => {
    const timer = setTimeout(() => setEntering(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Highlight the cells that changed on the latest push from the feed.
  useEffect(() => {
    const current = new Map();
    for (const row of rows) {
      row.cells.forEach((cell, colIndex) => {
        current.set(`${row.index}:${colIndex}`, cellFingerprint(cell));
      });
    }

    const previous = seenRef.current;
    seenRef.current = current;
    if (!previous) return undefined;

    const changed = new Set();
    for (const [key, value] of current) {
      if (previous.get(key) !== value) changed.add(key);
    }
    if (!changed.size) return undefined;

    setFlashed(changed);
    const timer = setTimeout(() => setFlashed(new Set()), 2400);
    return () => clearTimeout(timer);
  }, [rows]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const columnNames = cols.map((col) => col.name.toLowerCase()).join(' ');
    return rows.filter((row) => {
      const haystack = [
        columnNames,
        ...row.cells.flatMap((cell) => [cell.note, cell.name, cell.raw]),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, rows, cols]);

  const visible = matches || rows;
  const hasData = cols.length > 0;
  const showWait = !hasData;

  return (
    <section className="ledger" aria-label="Bảng quà trực tiếp">
      <div className="ledger__bar">
        <label className="search">
          <span className="search__glyph" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm tên quà, ghi chú, số Bản-USD, danh hiệu…"
            aria-label="Tìm trong bảng"
          />
          {query ? (
            <button type="button" className="search__clear" onClick={() => setQuery('')}>
              ✕
            </button>
          ) : null}
        </label>
        <span className="ledger__count">
          {matches ? `${visible.length} / ${rows.length} hàng` : `${rows.length} hàng`}
        </span>
      </div>

      <div className="sheet">
        <div className="sheet__scroll" role="region" tabIndex={0} aria-label="Bảng cuộn ngang">
          <table className="sheet__table">
            <caption className="sr-only">
              Bảng quà tặng trời xanh — dữ liệu cập nhật trực tiếp từ nguồn
            </caption>
            <thead>
              <tr>
                <th className="gutter" scope="col">
                  #
                </th>
                {cols.map((col) => (
                  <th key={col.index} className="colhead" style={{ '--ci': col.index }} scope="col">
                    <span className="colhead__rail" aria-hidden="true" />
                    <span className="colhead__kicker">Cột {col.letter}</span>
                    <span className="colhead__name">{col.name}</span>
                    <span className="colhead__total">
                      <span className="money__ban">
                        {formatBan(col.ban)}
                        <small>BẢN-USD</small>
                      </span>
                      <span className="money__vnd">= {formatVnd(col.vnd)}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.index}
                  className={`row${entering ? ' row--entering' : ''}`}
                  style={{ '--ri': Math.min(row.index, 12) }}
                >
                  <td className="gutter">
                    <span className="gutter__no">{row.index + 1}</span>
                    {row.index === 0 ? <span className="gutter__badge">✦ Mới nhất</span> : null}
                  </td>
                  {row.cells.map((cell, colIndex) => {
                    const key = `${row.index}:${colIndex}`;
                    const hasValue = Boolean(cell.raw || cell.name || cell.note);
                    return (
                      <td
                        key={key}
                        className={`cell${hasValue ? ' cell--filled' : ''}${
                          flashed.has(key) ? ' cell--flash' : ''
                        }`}
                        style={{ '--ci': colIndex }}
                      >
                        <div className="cell__inner">
                          {cell.note ? <div className="cell__note">{cell.note}</div> : null}
                          {cell.name ? <div className="cell__name">{cell.name}</div> : null}
                          {cell.raw ? (
                            <div className="cell__money">
                              <span className="money__ban">
                                {formatBan(cell.ban)}
                                <small>BẢN-USD</small>
                              </span>
                              <span className="money__vnd">= {formatVnd(cell.vnd)}</span>
                            </div>
                          ) : (
                            <span className="cell__void" aria-hidden="true" />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>

            {hasData ? (
              <tfoot>
                <tr>
                  <td className="gutter" />
                  <td className="grand" colSpan={cols.length}>
                    <span className="grand__label">Tổng Kim Ngân Toàn Bảng · Thanh Vân Viên Mãn</span>
                    <span className="grand__value">
                      <span className="money__ban grand__ban">
                        {formatBan(totals.ban)}
                        <small>BẢN-USD</small>
                      </span>
                      <span className="money__vnd grand__vnd">= {formatVnd(totals.vnd)}</span>
                    </span>
                    <span className="grand__words">({readVndWords(totals.vnd)})</span>
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {showWait ? (
          <div className="waiting">
            <span className="waiting__orb" aria-hidden="true" />
            <p className="waiting__title">
              {connection === 'error'
                ? 'Chưa mở được kênh dữ liệu trực tiếp'
                : snapshot?.status === 'offline'
                  ? 'Nguồn dữ liệu đang ngoại tuyến'
                  : 'Mây đang trống — chờ trang gốc nhập liệu…'}
            </p>
            <p className="waiting__hint">
              {snapshot?.error
                ? snapshot.error
                : 'Trang này tự động hiển thị nội dung ngay khi nguồn gốc cập nhật.'}
            </p>
          </div>
        ) : null}

        {hasData && matches && visible.length === 0 ? (
          <div className="waiting waiting--inline">
            <p className="waiting__title">Không có mục nào khớp “{query}”</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
