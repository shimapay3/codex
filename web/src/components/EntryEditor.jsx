import { useEffect, useMemo, useState } from 'react';
import { addressIssue, normalizeAddress } from '../lib/address.js';
import { buildIdent, identFingerprint, suggestIdent } from '../lib/ident.js';
import { LABEL_COLORS, colorOf, newId } from '../lib/palette.js';
import { useVault } from '../lib/useVault.jsx';
import AuthForm from './AuthForm.jsx';
import Icon from './Icon.jsx';
import Modal from './Modal.jsx';

const MAX_LABEL = 40;

function anchoredIssue(address, positions) {
  for (const position of positions) {
    const slice = address.slice(position.start, position.start + position.chunk.length);
    if (slice !== position.chunk) {
      return `Địa chỉ phải giữ nguyên “${position.chunk}” tại vị trí ${position.start + 1} (theo ident đã neo).`;
    }
  }
  return null;
}

export default function EntryEditor({ open, entry, tamperWarning, onClose, onSave }) {
  const { data } = useVault();
  const isNew = !entry;

  const [label, setLabel] = useState('');
  const [color, setColor] = useState(LABEL_COLORS[0].id);
  const [address, setAddress] = useState('');
  const [ident, setIdent] = useState('');
  const [step, setStep] = useState('form');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(entry?.label ?? '');
    setColor(entry?.color ?? LABEL_COLORS[0].id);
    setAddress(entry?.address ?? '');
    setIdent(entry?.ident ?? '');
    setStep('form');
    setError('');
    setBusy(false);
  }, [open, entry]);

  const suggestion = useMemo(() => (isNew ? suggestIdent(address) : ''), [isNew, address]);

  const validate = () => {
    if (!label.trim()) return 'Hãy đặt tên / nhóm cho địa chỉ này.';
    if (label.trim().length > MAX_LABEL) return `Tên tối đa ${MAX_LABEL} ký tự.`;
    const addressProblem = addressIssue(address);
    if (addressProblem) return addressProblem;
    if (isNew) {
      const built = buildIdent({ address, ident });
      if (!built.ok) return built.reason;
    } else {
      const anchored = anchoredIssue(normalizeAddress(address), entry.identPositions ?? []);
      if (anchored) return anchored;
    }
    return null;
  };

  const persist = async () => {
    setBusy(true);
    setError('');
    try {
      if (isNew) {
        const built = buildIdent({ address, ident });
        const record = {
          id: newId(),
          label: label.trim(),
          color,
          address: normalizeAddress(address),
          ident: built.ident,
          identPositions: built.positions,
          identHash: await identFingerprint(built.ident),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await onSave(record, { isNew: true });
      } else {
        await onSave(
          {
            ...entry,
            label: label.trim(),
            color,
            address: normalizeAddress(address),
            updatedAt: Date.now(),
          },
          { isNew: false },
        );
      }
      onClose();
    } catch (err) {
      setError(err?.message || 'Không lưu được.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    if (!isNew && data.auth) {
      setStep('auth');
      return;
    }
    persist();
  };

  const applySuggestion = () => setIdent(suggestion);

  return (
    <Modal
      open={open}
      title={isNew ? 'Thêm địa chỉ ví SOL' : 'Sửa địa chỉ ví SOL'}
      subtitle={
        step === 'auth'
          ? 'Xác thực để lưu thay đổi'
          : isNew
            ? 'Địa chỉ và ident được mã hóa trước khi lưu'
            : 'Địa chỉ thay đổi phải khớp ident đã neo'
      }
      onClose={onClose}
    >
      {step === 'auth' ? (
        <div className="editor__auth">
          <p className="modal__text">
            Két yêu cầu xác thực lại mỗi khi sửa. Nhãn, màu và địa chỉ sẽ được cập nhật sau khi xác
            thực thành công.
          </p>
          <AuthForm
            auth={data.auth}
            actionLabel="Xác thực và lưu"
            onSuccess={persist}
            compact
          />
          {error ? <p className="form-error">{error}</p> : null}
          <button type="button" className="btn btn--ghost btn--block" onClick={() => setStep('form')}>
            Quay lại
          </button>
        </div>
      ) : (
        <form className="editor" onSubmit={submit}>
          {tamperWarning ? (
            <p className="editor__alert" role="alert">
              <Icon name="alert" size={16} />
              Địa chỉ đang lưu không khớp ident. Hãy sửa lại địa chỉ cho đúng rồi mới sao chép.
            </p>
          ) : null}

          <label className="field">
            <span className="field__label">Tên / nhóm (nhãn)</span>
            <input
              className="field__input"
              value={label}
              maxLength={MAX_LABEL}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Ví nhận thanh toán, Sàn DEX, Quỹ nhóm…"
              autoFocus
            />
          </label>

          <div className="field">
            <span className="field__label">Màu nhãn</span>
            <div className="swatches">
              {LABEL_COLORS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`swatch ${color === item.id ? 'is-active' : ''}`}
                  style={{ '--swatch': item.hex, '--swatch-ink': item.ink }}
                  onClick={() => setColor(item.id)}
                  aria-label={item.name}
                  title={item.name}
                >
                  {color === item.id ? <Icon name="check" size={14} /> : null}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field__label">Địa chỉ ví SOL</span>
            <textarea
              className="field__input field__input--address"
              value={address}
              rows={3}
              spellCheck="false"
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => setAddress(event.target.value.trim())}
              placeholder="Dán địa chỉ base58 của ví SOL…"
            />
          </label>

          <div className="field">
            <span className="field__label">
              Ident vắn tắt {isNew ? '' : '(cố định, không sửa được)'}
            </span>
            {isNew ? (
              <div className="ident-input">
                <input
                  className="field__input field__input--mono"
                  value={ident}
                  spellCheck="false"
                  autoCapitalize="off"
                  autoCorrect="off"
                  onChange={(event) => setIdent(event.target.value)}
                  placeholder="TX***Gm**27h***pgn"
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--compact"
                  onClick={applySuggestion}
                  disabled={!suggestion}
                  title={suggestion ? 'Điền ident gợi ý' : 'Nhập địa chỉ hợp lệ trước'}
                >
                  <Icon name="refresh" size={15} />
                  Gợi ý
                </button>
              </div>
            ) : (
              <div className="ident-input ident-input--locked">
                <span className="ident">{entry.ident}</span>
                <span className="ident-badge">
                  <Icon name="lock" size={11} />
                  cố định
                </span>
              </div>
            )}
            <p className="field__hint">
              Ident là mỏ neo chống giả mạo. Mỗi lần sao chép, địa chỉ phải khớp lại ident này.
            </p>
          </div>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="modal__buttons">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Hủy
            </button>
            <button type="submit" className="btn btn--primary" disabled={busy}>
              <Icon name={isNew ? 'plus' : 'check'} size={16} />
              {isNew ? 'Lưu địa chỉ' : 'Xác thực và lưu'}
            </button>
          </div>
          <p className="field__hint field__hint--center">
            Nhãn đang chọn: <b style={{ color: colorOf(color).hex }}>{colorOf(color).name}</b>
          </p>
        </form>
      )}
    </Modal>
  );
}
