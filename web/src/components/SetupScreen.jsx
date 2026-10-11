import { useEffect, useState } from 'react';
import { createPasskey, createPinRecord, friendlyAuthError, passkeySupported, pinIssue } from '../lib/auth.js';
import { AUTO_LOCK_OPTIONS, DEFAULT_AUTO_LOCK_MS } from '../lib/storage.js';
import { toast } from '../lib/toast.js';
import Icon from './Icon.jsx';
import { useVault } from '../lib/useVault.jsx';

export default function SetupScreen() {
  const { completeSetup, data } = useVault();
  const [passkeyReady, setPasskeyReady] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [autoLockMs, setAutoLockMs] = useState(data.autoLockMs || DEFAULT_AUTO_LOCK_MS);

  useEffect(() => {
    let alive = true;
    passkeySupported().then((ok) => alive && setPasskeyReady(ok));
    return () => {
      alive = false;
    };
  }, []);

  const finish = (auth) => {
    completeSetup({ auth, autoLockMs, theme: data.theme || 'dark' });
    toast('Két đã được tạo và mã hóa.', 'success');
  };

  const setupPasskey = async () => {
    setBusy(true);
    setError('');
    try {
      const credentialId = await createPasskey();
      finish({ mode: 'passkey', credentialId, createdAt: Date.now() });
    } catch (err) {
      const message = friendlyAuthError(err);
      setError(message);
      setPinMode(true);
    } finally {
      setBusy(false);
    }
  };

  const setupPin = async (event) => {
    event.preventDefault();
    const issue = pinIssue(pin);
    if (issue) return setError(issue);
    if (pin !== confirmPin) return setError('Hai lần nhập mã PIN chưa khớp.');
    setBusy(true);
    setError('');
    try {
      const record = await createPinRecord(pin);
      finish({ mode: 'pin', ...record, createdAt: Date.now() });
    } catch (err) {
      setError(err?.message || 'Không tạo được mã PIN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="screen screen--center">
      <div className="card card--setup">
        <div className="brand brand--lg">
          <span className="brand__mark">
            <Icon name="shield" size={26} />
          </span>
          <div>
            <h1 className="brand__name">Secure Pay Address</h1>
            <p className="brand__tag">Beta · két địa chỉ ví SOL mã hóa</p>
          </div>
        </div>

        <p className="setup__lead">
          Chọn cách mở khóa. Passkey (ChromeOS Flex và mọi thiết bị có authenticator nền tảng) được ưu
          tiên; mã PIN là phương án dự phòng khi thiết bị không hỗ trợ passkey.
        </p>

        <div className="setup__options">
          <button
            type="button"
            className="option-card option-card--primary"
            onClick={setupPasskey}
            disabled={busy || passkeyReady === false}
          >
            <Icon name="key" size={22} />
            <span className="option-card__title">Tạo passkey</span>
            <span className="option-card__hint">
              {passkeyReady === null
                ? 'Đang kiểm tra thiết bị…'
                : passkeyReady
                  ? 'Dùng vân tay · khuôn mặt · mã thiết bị'
                  : 'Thiết bị này không có authenticator nền tảng'}
            </span>
          </button>

          <button
            type="button"
            className="option-card"
            onClick={() => setPinMode(true)}
            disabled={busy}
          >
            <Icon name="hash" size={22} />
            <span className="option-card__title">Dùng mã PIN</span>
            <span className="option-card__hint">4–8 chữ số, lưu dưới dạng băm một chiều</span>
          </button>
        </div>

        {pinMode ? (
          <form className="setup__pin" onSubmit={setupPin}>
            <div className="setup__pin-grid">
              <label className="field">
                <span className="field__label">Mã PIN</span>
                <input
                  className="field__input field__input--pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                />
              </label>
              <label className="field">
                <span className="field__label">Nhập lại</span>
                <input
                  className="field__input field__input--pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                />
              </label>
            </div>
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              <Icon name="shield" size={18} />
              {busy ? 'Đang tạo…' : 'Bảo vệ két bằng mã PIN'}
            </button>
          </form>
        ) : null}

        {error ? <p className="form-error">{error}</p> : null}

        <label className="field field--inline">
          <span className="field__label">Tự khóa sau</span>
          <select
            className="field__input"
            value={autoLockMs}
            onChange={(event) => setAutoLockMs(Number(event.target.value))}
          >
            {AUTO_LOCK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
