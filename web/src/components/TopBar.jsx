import { formatLockDuration } from '../lib/format.js';
import { useVault } from '../lib/useVault.jsx';
import Icon from './Icon.jsx';

export default function TopBar({ onOpenSettings }) {
  const { data, setTheme, lock } = useVault();
  const isDark = data.theme !== 'light';

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark">
          <Icon name="shield" size={20} />
        </span>
        <div>
          <p className="brand__name brand__name--sm">Secure Pay Address</p>
          <p className="brand__tag brand__tag--sm">
            Beta · khóa sau {formatLockDuration(data.autoLockMs)}
          </p>
        </div>
      </div>

      <div className="topbar__actions">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label={isDark ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
          title={isDark ? 'Nền sáng' : 'Nền tối'}
        >
          <Icon name={isDark ? 'sun' : 'moon'} size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSettings}
          aria-label="Cài đặt"
          title="Cài đặt"
        >
          <Icon name="settings" size={18} />
        </button>
        <button type="button" className="btn btn--ghost btn--compact" onClick={lock} title="Khóa ngay">
          <Icon name="lock" size={16} />
          Khóa
        </button>
      </div>
    </header>
  );
}
