import { colorOf } from '../lib/palette.js';
import { formatTime } from '../lib/format.js';
import Icon from './Icon.jsx';

export default function EntryCard({ entry, copiedAt, tampered, busy, onCopy, onEdit, onDelete }) {
  const color = colorOf(entry.color);

  return (
    <article
      className={`entry-card ${tampered ? 'is-tampered' : ''}`}
      style={{ '--chip': color.hex, '--chip-ink': color.ink }}
    >
      <header className="entry-card__head">
        <span className="label-chip" title={entry.label}>
          <span className="label-chip__dot" />
          <span className="label-chip__text">{entry.label}</span>
        </span>
        <div className="entry-card__tools">
          <button
            type="button"
            className="icon-btn"
            onClick={() => onEdit(entry)}
            aria-label={`Sửa ${entry.label}`}
            title="Sửa (cần xác thực)"
          >
            <Icon name="pencil" size={16} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            onClick={() => onDelete(entry)}
            aria-label={`Xóa ${entry.label}`}
            title="Xóa"
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </header>

      <div className="entry-card__body">
        <p className="address" title={entry.address}>
          {entry.address}
        </p>
        <button
          type="button"
          className={`copy-btn ${copiedAt ? 'is-copied' : ''}`}
          onClick={() => onCopy(entry)}
          disabled={busy}
          aria-label={`Sao chép địa chỉ ${entry.label}`}
        >
          <Icon name={copiedAt ? 'check' : 'copy'} size={22} />
          <span>{copiedAt ? 'Đã chép' : 'Sao chép'}</span>
        </button>
      </div>

      <div className="entry-card__ident">
        <Icon name="hash" size={13} />
        <span className="ident">{entry.ident}</span>
        <span className="ident-badge" title="Ident không thể sửa">
          <Icon name="lock" size={11} />
          cố định
        </span>
      </div>

      {tampered ? (
        <p className="entry-card__warn" role="alert">
          <Icon name="alert" size={15} />
          Địa chỉ không khớp ident đã neo — cần sửa lại địa chỉ trước khi sao chép.
        </p>
      ) : null}

      {copiedAt ? (
        <div className="copy-tooltip" role="status">
          <Icon name="clock" size={14} />
          <span>
            Đã sao chép địa chỉ <b>{entry.label}</b> lúc {formatTime(copiedAt)}
          </span>
        </div>
      ) : null}
    </article>
  );
}
