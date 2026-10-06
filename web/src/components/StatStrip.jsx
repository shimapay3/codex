import { formatVnd } from '../lib/format.js';
import { useCountUp } from '../lib/useCountUp.js';

function Stat({ label, children, accent = false, suffix }) {
  return (
    <div className={`stat${accent ? ' stat--accent' : ''}`}>
      <span className="stat__rail" aria-hidden="true" />
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        {children}
        {suffix ? <small>{suffix}</small> : null}
      </span>
    </div>
  );
}

export default function StatStrip({ snapshot }) {
  const cols = snapshot?.cols?.length || 0;
  const rows = snapshot?.rows?.length || 0;
  const grand = useCountUp(snapshot?.totals?.vnd || 0);
  const rate = Number(snapshot?.rate || 300000);

  return (
    <section className="stats" aria-label="Tổng quan bảng">
      <Stat label="Tổng toàn bảng" accent>
        <span className="stat__gold">{formatVnd(grand)}</span>
      </Stat>
      <Stat label="Số danh hiệu">
        {cols}
        <small>cột</small>
      </Stat>
      <Stat label="Số hàng">
        {rows}
        <small>hàng</small>
      </Stat>
      <Stat label="Tỷ giá">
        1 Bản
        <small>= {rate.toLocaleString('vi-VN')} ₫</small>
      </Stat>
    </section>
  );
}
