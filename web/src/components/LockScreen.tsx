import { useEffect, useMemo, useState } from 'react'
import {
  Delete,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  ShieldCheck,
  Wallet,
  AlertTriangle,
} from 'lucide-react'
import Logo from './Logo'
import SecretUpload from './SecretUpload'
import { useWallet } from '../state/WalletProvider'
import { shortAddress } from '../lib/crypto'
import { loadStore } from '../state/vault'
import { TELEGRAM_LOGO } from '../lib/telegram'

type Mode = 'pin' | 'secret'

export default function LockScreen() {
  const { unlockWithPin, unlockWithSecret, pinEnabled, session, autoLockSeconds, telegramUser } = useWallet()

  const [mode, setMode] = useState<Mode>(pinEnabled ? 'pin' : 'secret')
  const [pin, setPin] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [avatarKey, setAvatarKey] = useState(() => Date.now())

  useEffect(() => {
    const refresh = () => setAvatarKey(Date.now())
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 30000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
    }
  }, [])

  const index = useMemo(() => loadStore()?.index || [], [])

  const tgName = telegramUser
    ? [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') ||
      (telegramUser.username ? `@${telegramUser.username}` : `User ${telegramUser.id}`)
    : 'Khách'
  const tgUsername = telegramUser?.username ? `@${telegramUser.username}` : null
  const tgId = telegramUser ? String(telegramUser.id) : null
  const tgPhoto = telegramUser?.photo_url
    ? `${telegramUser.photo_url}${telegramUser.photo_url.includes('?') ? '&' : '?'}_=${avatarKey}`
    : null

  useEffect(() => {
    setError(null)
  }, [mode])

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
          X<span className="accent-text">Pay</span> Wallet
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[color:var(--muted)]">
          <Lock size={12} /> Két đã khoá · Cloud Chain
        </p>
      </div>

      {/* Telegram identity */}
      <div className="mt-5 flex items-center gap-3 rounded-[22px] glass p-3.5 w-full">
        <img
          src={tgPhoto || TELEGRAM_LOGO}
          alt="Telegram"
          className="h-10 w-10 rounded-full ring-2 ring-[#229ED9]/40"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = TELEGRAM_LOGO
          }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{tgName}</p>
          <p className="truncate text-[10.5px] text-[color:var(--muted)]">
            {tgUsername || 'Chưa có username'} {tgId ? `· ID: ${tgId}` : ''}
          </p>
        </div>
      </div>

      {index.length > 0 && (
        <div className="mt-4 w-full rounded-3xl glass p-4">
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
        {mode === 'pin' && (
          <div className="flex flex-col items-center">
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
                onClick={() => setMode('secret')}
                className="rounded-2xl py-3.5 text-[12px] font-semibold text-[color:var(--muted)]"
              >
                Khoá
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
            <div className="flex items-center gap-3 rounded-2xl glass p-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--surface-strong)]">
                <ShieldCheck size={19} />
              </span>
              <div>
                <p className="text-[14px] font-semibold">Mở bằng khoá bí mật</p>
                <p className="text-[11px] text-[color:var(--muted)]">Dự phòng khi quên mã PIN</p>
              </div>
            </div>
            <div className="relative">
              <textarea
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                rows={5}
                spellCheck={false}
                placeholder="[12,34,…]  ·  4Zk…  ·  twelve word phrase  ·  passphrase"
                className="w-full resize-none rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 pr-11 font-mono text-[12.5px] outline-none focus:border-[color:var(--accent)]"
                style={{ WebkitTextSecurity: showSecret ? 'none' : 'disc' } as React.CSSProperties}
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? 'Ẩn khoá' : 'Hiện khoá'}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-[color:var(--muted)] transition hover:bg-white/10"
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-[color:var(--muted)]">
              Chấp nhận mảng JSON nhị phân, base58, private key hex, cụm 12/24 từ
              hoặc passphrase tự do.
            </p>
            <SecretUpload onLoad={setSecret} />
            <div className="flex items-start gap-2.5 rounded-2xl border border-[#f0ad4e]/30 bg-[#f0ad4e]/10 px-3.5 py-3 text-[11px] leading-relaxed text-[#f0ad4e]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                <b>⚠ Nhớ backup khoá bí mật!</b> Keypair & private key lưu 100% cục bộ trên thiết bị. Nếu mất khoá và không có file backup, ví không thể khôi phục.
              </span>
            </div>
            {error && (
              <p className="rounded-2xl border border-[#ff6b81]/40 bg-[#ff6b81]/10 px-3.5 py-3 text-[12px] text-[#ff8fa1]">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {pinEnabled && (
                <button
                  type="button"
                  onClick={() => setMode('pin')}
                  className="rounded-2xl border border-[color:var(--border)] py-3.5 text-[13px] font-semibold"
                >
                  Dùng PIN
                </button>
              )}
              <button
                type="button"
                disabled={busy || !secret.trim()}
                onClick={submitSecret}
                className={`flex items-center justify-center gap-2 rounded-2xl accent-gradient py-3.5 text-[13px] font-semibold text-white disabled:opacity-50 ${pinEnabled ? '' : 'col-span-2'}`}
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
        Cloud Chain · rpc.localusd.cloud
      </p>
    </div>
  )
}
