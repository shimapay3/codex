import { useEffect, useMemo, useState } from 'react'
import {
  Delete,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Wallet,
} from 'lucide-react'
import Logo from './Logo'
import { useWallet } from '../state/WalletProvider'
import { shortAddress } from '../lib/crypto'
import { loadStore } from '../state/vault'

type Mode = 'choose' | 'pin' | 'secret'

export default function LockScreen() {
  const {
    unlockWithPasskey,
    unlockWithPin,
    unlockWithSecret,
    passkeyRecord,
    pinEnabled,
    session,
    autoLockSeconds,
  } = useWallet()

  const [mode, setMode] = useState<Mode>('choose')
  const [pin, setPin] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsPin, setNeedsPin] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const index = useMemo(() => loadStore()?.index || [], [])

  useEffect(() => {
    setError(null)
  }, [mode])

  const doPasskey = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await unlockWithPasskey()
      if (result === 'pin-required') {
        setNeedsPin(true)
        setMode('pin')
        setNotice('Passkey đã xác thực · nhập mã PIN để mở két')
      }
    } catch (err: any) {
      if (!/huỷ|cancel/i.test(err?.message || '')) {
        setError(err?.message || 'Không mở được bằng Passkey')
      }
    } finally {
      setBusy(false)
    }
  }

  const submitPin = async (value: string) => {
    setBusy(true)
    setError(null)
    try {
      await unlockWithPin(value)
    } catch (err: any) {
      setError(err?.message || 'Mã PIN không đúng')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  const press = (digit: string) => {
    if (busy) return
    const next = (pin + digit).slice(0, 6)
    setPin(next)
    if (next.length === 6) void submitPin(next)
  }

  const submitSecret = async () => {
    if (!secret.trim()) return
    setBusy(true)
    setError(null)
    try {
      await unlockWithSecret(secret)
    } catch (err: any) {
      setError(err?.message || 'Khoá bí mật không đúng')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-5 pb-8 pt-[calc(env(safe-area-inset-top,0px)+3rem)]">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <span className="absolute inset-0 animate-ring-pulse rounded-[26px] bg-[color:var(--accent)]/30" />
          <Logo size={76} />
        </div>
        <h1 className="mt-4 text-[22px] font-semibold tracking-tight">
          Cloud <span className="accent-text">Pay</span> Wallet
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[color:var(--muted)]">
          <Lock size={12} /> Két đã khoá · Cloud Chain
        </p>
      </div>

      {index.length > 0 && (
        <div className="mt-6 w-full rounded-3xl glass p-4">
          <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
            <Wallet size={13} /> {index.length} ví trên thiết bị
          </p>
          <div className="space-y-1.5">
            {index.slice(0, 4).map((wallet) => (
              <div key={wallet.id} className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: wallet.tone }} />
                <span className="truncate text-[12.5px] font-medium">{wallet.name}</span>
                <span className="ml-auto font-mono text-[10.5px] text-[color:var(--muted)]">
                  {shortAddress(wallet.address, 4)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 w-full flex-1">
        {mode === 'choose' && (
          <div className="space-y-2.5">
            {notice && (
              <p className="rounded-2xl border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-3.5 py-2.5 text-[11.5px]">
                {notice}
              </p>
            )}
            {passkeyRecord && (
              <button
                type="button"
                disabled={busy}
                onClick={doPasskey}
                className="flex w-full items-center gap-3 rounded-2xl accent-gradient px-4 py-4 text-left text-white shadow-glow disabled:opacity-60"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Fingerprint size={20} />}
                </span>
                <span>
                  <span className="block text-[14px] font-semibold">Mở bằng FaceID / Passkey</span>
                  <span className="block text-[11px] opacity-85">
                    {passkeyRecord.prf ? 'Khoá phần cứng (PRF)' : 'Cần mã PIN sau khi xác thực'}
                  </span>
                </span>
              </button>
            )}

            {pinEnabled && (
              <button
                type="button"
                onClick={() => {
                  setMode('pin')
                  setPin('')
                  setNeedsPin(false)
                  setNotice(null)
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-[color:var(--border)] px-4 py-4 text-left"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--surface-strong)]">
                  <KeyRound size={19} />
                </span>
                <span>
                  <span className="block text-[14px] font-semibold">Mở bằng mã PIN</span>
                  <span className="block text-[11px] text-[color:var(--muted)]">6 chữ số bảo mật</span>
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setMode('secret')}
              className="flex w-full items-center gap-3 rounded-2xl border border-[color:var(--border)] px-4 py-4 text-left"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--surface-strong)]">
                <ShieldCheck size={19} />
              </span>
              <span>
                <span className="block text-[14px] font-semibold">Mở bằng khoá bí mật</span>
                <span className="block text-[11px] text-[color:var(--muted)]">
                  JSON nhị phân · base58 · private key · passphrase
                </span>
              </span>
            </button>

            {error && (
              <p className="rounded-2xl border border-[#ff6b81]/40 bg-[#ff6b81]/10 px-3.5 py-3 text-[12px] text-[#ff8fa1]">
                {error}
              </p>
            )}
          </div>
        )}

        {mode === 'pin' && (
          <div className="flex flex-col items-center">
            {notice && (
              <p className="mb-3 w-full rounded-2xl border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-3.5 py-2.5 text-center text-[11.5px]">
                {notice}
              </p>
            )}
            <div className="mb-5 flex gap-2.5">
              {Array.from({ length: 6 }).map((_, position) => (
                <span
                  key={position}
                  className={[
                    'h-3 w-3 rounded-full transition',
                    position < pin.length ? 'accent-gradient scale-110' : 'bg-[color:var(--surface-strong)]',
                  ].join(' ')}
                />
              ))}
            </div>

            <div className="grid w-full max-w-[280px] grid-cols-3 gap-2.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => press(digit)}
                  className="rounded-2xl glass py-3.5 text-[19px] font-semibold transition active:scale-95"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMode('choose')}
                className="rounded-2xl py-3.5 text-[12px] font-semibold text-[color:var(--muted)]"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => press('0')}
                className="rounded-2xl glass py-3.5 text-[19px] font-semibold transition active:scale-95"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPin((current) => current.slice(0, -1))}
                aria-label="Xoá"
                className="flex items-center justify-center rounded-2xl py-3.5 text-[color:var(--muted)] transition active:scale-95"
              >
                <Delete size={20} />
              </button>
            </div>

            {busy && (
              <p className="mt-4 flex items-center gap-2 text-[12px] text-[color:var(--muted)]">
                <Loader2 size={14} className="animate-spin" /> Đang mở két…
              </p>
            )}
            {error && <p className="mt-4 text-center text-[12px] text-[#ff8fa1]">{error}</p>}
          </div>
        )}

        {mode === 'secret' && (
          <div className="space-y-3">
            <textarea
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="[12,34,…]  ·  4Zk…  ·  twelve word phrase  ·  passphrase"
              className="w-full resize-none rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 font-mono text-[12.5px] outline-none focus:border-[color:var(--accent)]"
            />
            <p className="text-[11px] leading-relaxed text-[color:var(--muted)]">
              Chấp nhận mảng JSON nhị phân, base58 (khoá bí mật hoặc seed), private key hex, cụm 12/24 từ
              hoặc passphrase tự do.
            </p>
            {error && (
              <p className="rounded-2xl border border-[#ff6b81]/40 bg-[#ff6b81]/10 px-3.5 py-3 text-[12px] text-[#ff8fa1]">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('choose')}
                className="rounded-2xl border border-[color:var(--border)] py-3.5 text-[13px] font-semibold"
              >
                Quay lại
              </button>
              <button
                type="button"
                disabled={busy || !secret.trim()}
                onClick={submitSecret}
                className="flex items-center justify-center gap-2 rounded-2xl accent-gradient py-3.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                Mở khoá
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 text-center text-[10.5px] leading-relaxed text-[color:var(--muted)]">
        {session === 'locked' && autoLockSeconds
          ? `Tự khoá sau ${autoLockSeconds}s nữa`
          : 'Khoá bí mật không bao giờ rời khỏi thiết bị này'}
      </p>
      <p className="mt-1 text-center text-[10px] text-[color:var(--muted)]">
        Cloud Chain · rpc.dolaxanh.com
      </p>
    </div>
  )
}
