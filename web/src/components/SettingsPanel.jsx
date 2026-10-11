import { useState } from 'react';
import { AUTO_LOCK_OPTIONS } from '../lib/storage.js';
import { useVault } from '../lib/useVault.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';

export default function SettingsPanel({ open, onClose }) {
  const { data, setAutoLock, setTheme, resetVault } = useVault();
  const [resetOpen, setResetOpen] = useState(false);
  const isDark = data.theme !== 'light';

  return (
    <>
      <Modal open={open} title="Cài đặt" subtitle="Bảo mật và hiển thị" onClose={onClose}>
        <div className="settings">
          <div className="settings__row">
            <div className="settings__label">
              <Icon name={isDark ? 'moon' : 'sun'} size={18} />
              <div>
                <p className="settings__title">Chủ đề</p>
                <p className="settings__hint">Tối là mặc định, sáng cho môi trường nhiều ánh sáng.</p>
              </div>
            </div>
            <div className="segmented" role="group" aria-label="Chủ đề">
              <button
                type="button"
                className={`segmented__item ${isDark ? 'is-active' : ''}`}
                onClick={() => setTheme('dark')}
              >
                Tối
              </button>
              <button
                type="button"
                className={`segmented__item ${!isDark ? 'is-active' : ''}`}
                onClick={() => setTheme('light')}
              >
                Sáng
              </button>
            </div>
          </div>

          <div className="settings__row settings__row--stack">
            <div className="settings__label">
              <Icon name="clock" size={18} />
              <div>
                <p className="settings__title">Tự khóa ứng dụng</p>
                <p className="settings__hint">
                  Khóa khi không thao tác — mở lại phải xác thực lại.
                </p>
              </div>
            </div>
            <div className="chips">
              {AUTO_LOCK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`chip ${data.autoLockMs === option.value ? 'is-active' : ''}`}
                  onClick={() => setAutoLock(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="settings__row">
            <div className="settings__label">
              <Icon name="key" size={18} />
              <div>
                <p className="settings__title">Phương thức mở khóa</p>
                <p className="settings__hint">
                  {data.auth?.mode === 'passkey' ? 'Passkey thiết bị' : 'Mã PIN'}
                </p>
              </div>
            </div>
          </div>

          <div className="settings__danger">
            <button type="button" className="btn btn--danger btn--block" onClick={() => setResetOpen(true)}>
              <Icon name="trash" size={16} />
              Xóa toàn bộ két
            </button>
            <p className="settings__hint">
              Xóa mọi địa chỉ, nhãn và ident khỏi thiết bị này. Không thể hoàn tác.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={resetOpen}
        title="Xóa toàn bộ két?"
        subtitle="Không thể khôi phục"
        size="sm"
        onClose={() => setResetOpen(false)}
        footer={
          <div className="modal__buttons">
            <button type="button" className="btn btn--ghost" onClick={() => setResetOpen(false)}>
              Giữ lại
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                resetVault();
                setResetOpen(false);
                onClose();
              }}
            >
              Xóa tất cả
            </button>
          </div>
        }
      >
        <p className="modal__text">
          Hãy chắc chắn bạn đã lưu các địa chỉ ví ở nơi khác trước khi xóa.
        </p>
      </Modal>
    </>
  );
}
