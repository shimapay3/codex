import { useState } from 'react';
import { assertPasskey, friendlyAuthError, verifyPin } from '../lib/auth.js';
import Icon from './Icon.jsx';

// Khối xác thực dùng chung cho màn hình khóa và hộp thoại xác thực lại.
// - passkey: một nút bấm, gọi WebAuthn của thiết bị.
// - pin: ô nhập 4–8 chữ số.
export default function AuthForm({ auth, actionLabel, onSuccess, compact = false }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isPasskey = auth?.mode === 'passkey';

  const runPasskey = async () => {
    setBusy(true);
    setError('');
    try {
      const ok = await assertPasskey(auth.credentialId);
      if (ok) onSuccess();
      else setError('Không xác nhận được passkey.');
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const runPin = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const ok = await verifyPin(pin, auth);
    setBusy(false);
    if (ok) {
      setPin('');
      onSuccess();
    } else {
      setError('Mã PIN không đúng.');
    }
  };

  if (isPasskey) {
    return (
      <div className={`auth-form ${compact ? 'auth-form--compact' : ''}`.trim()}>
        <button type="button" className="btn btn--primary btn--block" onClick={runPasskey} disabled={busy}>
          <Icon name="key" size={18} />
          {busy ? 'Đang chờ thiết bị…' : actionLabel || 'Mở khóa bằng passkey'}
        </button>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    );
  }

  if (auth?.mode === 'pin') {
    return (
      <form className={`auth-form ${compact ? 'auth-form--compact' : ''}`.trim()} onSubmit={runPin}>
        <label className="field">
          <span className="field__label">Mã PIN</span>
          <input
            className="field__input field__input--pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={8}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            aria-label="Mã PIN"
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="btn btn--primary btn--block" disabled={busy || pin.length < 4}>
          <Icon name="unlock" size={18} />
          {busy ? 'Đang kiểm tra…' : actionLabel || 'Mở khóa'}
        </button>
      </form>
    );
  }

  return <p className="form-error">Két này chưa có phương thức mở khóa.</p>;
}
