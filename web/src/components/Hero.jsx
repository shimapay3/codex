import { formatClock } from '../lib/format.js';

function badgeOf(status, connection) {
  if (connection === 'error') return { level: 'err', text: 'Mất kết nối' };
  if (status === 'offline') return { level: 'err', text: 'Nguồn ngoại tuyến' };
  if (status === 'live') return { level: 'ok', text: 'LIVE' };
  if (status === 'empty') return { level: 'warn', text: 'Mây trống' };
  return { level: 'wait', text: 'Đang kết nối…' };
}

export default function Hero({ sheetName, status, connection, fetchedAt }) {
  const badge = badgeOf(status, connection);

  return (
    <header className="hero">
      <div className="hero__chip" aria-hidden="true">
        <span className="hero__crown">♛</span>
        <span className="hero__chipname">Hoàng&nbsp;Ân</span>
        <span className="hero__crown">♛</span>
      </div>

      <div className="hero__mark" aria-hidden="true">
        <span className="hero__ring" />
        <span className="hero__core">◈</span>
      </div>

      <h1 className="hero__title">
        <span className="hero__title-main">MUST · Gift for Sky</span>
        <span className="hero__title-sub">
          {sheetName || 'Bản xem trực tiếp — đồng bộ realtime từ mây'}
        </span>
      </h1>

      <p className="hero__live">
        <span className={`live-badge is-${badge.level}`} role="status" aria-live="polite">
          <span className="live-badge__dot" />
          {badge.text}
        </span>
        <span className="hero__stamp">cập nhật {formatClock(fetchedAt)}</span>
      </p>
    </header>
  );
}
