import { useState } from 'react';
import { formatLockDuration } from '../lib/format.js';
import { useVault } from '../lib/useVault.jsx';
import AuthForm from './AuthForm.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';

export default function LockScreen() {
  const { data, unlock, resetVault } = useVault();
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <section className="screen screen--center">
      <div className="card card--lock">
        <div className="brand brand--lg">
          <span className="brand__mark brand__mark--lock">
            <Icon name="lock" size={26} />
          </span>
          <div>
            <h1 className="brand__name">Secure Pay Address</h1>
            <p className="brand__tag">Beta · két đang khóa</p>
          </div>
        </div>

        <p className="lock__hint">
          {data.auth?.mode === 'passkey'
            ? 'Xác nhận passkey của thiết bị để mở két.'
            : 'Nhập mã PIN để mở két.'}
        </p>

        <AuthForm auth={data.auth} onSuccess={unlock} />

        <div className="lock__meta">
          <Icon name="clock" size={14} />
          <span>Tự khóa sau {formatLockDuration(data.autoLockMs)} không thao tác</span>
        </div>

        <button type="button" className="link-btn" onClick={() => setResetOpen(true)}>
          Quên phương thức mở khóa?
        </button>
      </div>

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
              }}
            >
              <Icon name="trash" size={16} />
              Xóa và bắt đầu lại
            </button>
          </div>
        }
      >
        <p className="modal__text">
          Mọi địa chỉ ví đã lưu sẽ bị xóa vĩnh viễn khỏi thiết bị này. Chỉ làm việc này khi bạn có
          bản sao địa chỉ ở nơi khác.
        </p>
      </Modal>
    </section>
  );
}
