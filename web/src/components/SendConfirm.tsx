import { useEffect, useState } from 'react'
import { Fingerprint, Loader2, Lock } from 'lucide-react'
import { confirmWithPasskey, platformAuthenticatorAvailable } from '../lib/passkey'

/**
 * Confirmation gate shown before sending SOL or USDC.
 *
 * Priority: Passkey (biometric) → PIN → none.
 * If the device has a platform authenticator we auto-trigger a Passkey
 * assertion.  When that fails or is cancelled we fall back to PIN entry
 * (only when a PIN is set).  If neither is available the send proceeds
 * immediately.
 */
export default function SendConfirm({
  onConfirm,
  onCancel,
  pinEnabled,
  verifyPin,
}: {
  onConfirm: () => void
  onCancel: () => void
  pinEnabled: boolean
  verifyPin: (pin: string) => Promise<void>
}) {
  const [mode, setMode] = useState<'checking' | 'passkey' | 'pin'>('checking')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const available = await platformAuthenticatorAvailable()
      if (cancelled) return
      if (available) {
        setMode('passkey')
        setBusy(true)
        const ok = await confirmWithPasskey()
        if (cancelled) return
        setBusy(false)
        if (ok) {
          onConfirm()
        } else if (pinEnabled) {
          setMode('pin')
          setError('Xác thực Passkey bị huỷ — nhập mã PIN')
        } else {
          setError('Xác thực Passkey thất bại hoặc bị huỷ')
        }
      } else if (pinEnabled) {
        setMode('pin')
      } else {
        onConfirm()
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePinSubmit = async () => {
    if (pin.length < 6) return
    setBusy(true)
    setError(null)
    try {
      await verifyPin(pin)
      onConfirm()
    } catch (err: any) {
      setError(err?.message || 'Mã PIN không đúng')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'checking') return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-[28px] glass-strong p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === 'passkey' && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full accent-gradient">
              {busy ? (
                <Loader2 size={26} className="animate-spin text-white" />
              ) : (
                <Fingerprint size={26} className="text-white" />
              )}
            </div>
            <p className="text-[15px] font-semibold">Xác nhận bằng Passkey</p>
            <p className="mt-1 text-[12.5px] text-[color:var(--muted)]">
              {busy ? 'Đang chờ xác thực sinh trắc học…' : 'Xác thực để tiếp tục giao dịch'}
            </p>
            {error && (
              <p className="mt-3 text-[12px] text-[#ff8fa1]">{error}</p>
            )}
            {error && pinEnabled && !busy && (
              <button
                type="button"
                onClick={() => { setMode('pin'); setError(null) }}
                className="mt-3 w-full rounded-2xl border border-[color:var(--border)] py-3 text-[13px] font-semibold"
              >
                Dùng mã PIN
              </button>
            )}
            {!busy && (
              <button
                type="button"
                onClick={onCancel}
                className="mt-3 w-full py-2 text-[12.5px] font-semibold text-[color:var(--muted)]"
              >
                Huỷ
              </button>
            )}
          </div>
        )}

        {mode === 'pin' && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Lock size={18} className="accent-text" />
              <p className="text-[15px] font-semibold">Xác nhận bằng PIN</p>
            </div>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
              placeholder="Nhập mã PIN 6 số"
              autoFocus
              className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-center text-[18px] tracking-[0.35em] outline-none focus:border-[color:var(--accent)]"
            />
            {error && (
              <p className="mt-2 text-[12px] text-[#ff8fa1]">{error}</p>
            )}
            <button
              type="button"
              disabled={busy || pin.length < 6}
              onClick={handlePinSubmit}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl accent-gradient py-3.5 text-[14px] font-semibold text-white disabled:opacity-45"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
              {busy ? 'Đang xác nhận…' : 'Xác nhận'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="mt-2 w-full py-2 text-[12.5px] font-semibold text-[color:var(--muted)]"
            >
              Huỷ
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
