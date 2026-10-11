import { useState } from 'react';
import LockScreen from './components/LockScreen.jsx';
import SetupScreen from './components/SetupScreen.jsx';
import SpaceBackdrop from './components/SpaceBackdrop.jsx';
import ToastHost from './components/ToastHost.jsx';
import Workspace from './components/Workspace.jsx';
import Icon from './components/Icon.jsx';
import Modal from './components/Modal.jsx';
import { useIdleLock } from './lib/useIdleLock.js';
import { VaultProvider, useVault } from './lib/useVault.jsx';

function Splash() {
  return (
    <section className="screen screen--center">
      <div className="splash">
        <span className="brand__mark brand__mark--pulse">
          <Icon name="shield" size={30} />
        </span>
        <p className="splash__text">Đang mở két đã mã hóa…</p>
      </div>
    </section>
  );
}

function ErrorScreen() {
  const { error, resetVault } = useVault();
  const [open, setOpen] = useState(false);

  return (
    <section className="screen screen--center">
      <div className="card card--setup">
        <div className="brand brand--lg">
          <span className="brand__mark brand__mark--danger">
            <Icon name="alert" size={26} />
          </span>
          <div>
            <h1 className="brand__name">Không mở được két</h1>
            <p className="brand__tag">Dữ liệu đã mã hóa không đọc được</p>
          </div>
        </div>
        <p className="setup__lead">
          Két trong localStorage không giải mã được. Nguyên nhân thường gặp: khóa thiết bị đã bị xóa
          hoặc bản ghi đã bị chỉnh sửa. Đây là hành vi bảo vệ của AES-GCM, không phải lỗi hiển thị.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="button" className="btn btn--danger btn--block" onClick={() => setOpen(true)}>
          <Icon name="refresh" size={16} />
          Xóa két và bắt đầu lại
        </button>
      </div>

      <Modal
        open={open}
        title="Xóa két?"
        subtitle="Không thể khôi phục"
        size="sm"
        onClose={() => setOpen(false)}
        footer={
          <div className="modal__buttons">
            <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>
              Giữ lại
            </button>
            <button type="button" className="btn btn--danger" onClick={resetVault}>
              Xóa vĩnh viễn
            </button>
          </div>
        }
      >
        <p className="modal__text">Mọi địa chỉ ví đã lưu sẽ bị xóa khỏi thiết bị này.</p>
      </Modal>
    </section>
  );
}

function Shell() {
  const { status, data, lock } = useVault();
  useIdleLock({ enabled: status === 'ready', ms: data.autoLockMs, onLock: lock });

  switch (status) {
    case 'loading':
      return <Splash />;
    case 'error':
      return <ErrorScreen />;
    case 'setup':
      return <SetupScreen />;
    case 'locked':
      return <LockScreen />;
    default:
      return <Workspace />;
  }
}

export default function App() {
  return (
    <VaultProvider>
      <SpaceBackdrop />
      <div className="app-shell">
        <Shell />
      </div>
      <ToastHost />
    </VaultProvider>
  );
}
