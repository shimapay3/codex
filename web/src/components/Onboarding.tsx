import { useState } from 'react'
import {
  ArrowRight,
  CloudDownload,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wallet,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react'
import Logo from './Logo'
import { useWallet } from '../state/WalletProvider'
import { USDC_AVATAR, USDC_MINT, MAX_WALLETS, getSolBalance, DEFAULT_RPC_URL } from '../lib/solana'
import {
  getTelegramDisplayName,
  getTelegramUsername,
  getTelegramUserIdString,
  getTelegramPhotoUrl,
  TELEGRAM_LOGO,
} from '../lib/telegram'
import { copyToClipboard } from '../lib/format'

type Step = 'welcome' | 'method' | 'import' | 'restore' | 'secure'

export default function Onboarding({ inTelegram }: { inTelegram: boolean }) {
  const { createWallet, restoreFromCloud, restoreFromTelegram, setPin, wallets, pushToast, completeOnboarding, telegramUser } =
    useWallet()
  const [step, setStep] = useState<Step>('welcome')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pin, setPinValue] = useState('')
  const [pin2, setPin2] = useState('')
  const [copied, setCopied] = useState(false)
  const [solWarning, setSolWarning] = useState<string | null>(null)

  const tgName = getTelegramDisplayName()
  const tgUsername = getTelegramUsername()
  const tgId = getTelegramUserIdString()
  const tgPhoto = getTelegramPhotoUrl()

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-[calc(env(safe-area-inset-top,0px)+2.5rem)]">
      <div className="flex flex-col items-center text-center">
        <Logo size={70} />
        <h1 className="mt-4 text-[24px] font-semibold tracking-tight">
          Cloud <span className="accent-text">Pay</span> Wallet
        </h1>
        <p className="mt-1 text-[12.5px] text-[color:var(--muted)]">
          Ví thanh toán USDC trên mạng Cloud Chain
        </p>
      </div>

      {/* Telegram user identity card — only in Telegram */}
      {inTelegram && (
        <div className="mt-5 flex items-center gap-3 rounded-[22px] glass-strong p-4">
          <img
            src={tgPhoto || TELEGRAM_LOGO}
            alt="Telegram"
            className="h-12 w-12 rounded-full ring-2 ring-[#229ED9]/40"
            onError={(e) => {
              ;(e.target as HTMLImageElement).src = TELEGRAM_LOGO
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{tgName}</p>
            <p className="truncate text-[11px] text-[color:var(--muted)]">
              {tgUsername || 'Chưa có username'}
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (tgId) {
                await copyToClipboard(tgId)
                setCopied(true)
                setTimeout(() => setCopied(false), 1600)
              }
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[color:var(--border)] px-2.5 py-1.5 text-[10.5px] font-semibold"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {tgId ? `ID: ${tgId}` : 'Không có ID'}
          </button>
        </div>
      )}

      {/* Non-Telegram notice */}
      {!inTelegram && (
        <div className="mt-5 flex items-start gap-3 rounded-[22px] border border-[#f0ad4e]/30 bg-[#f0ad4e]/10 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#f0ad4e]" />
          <div>
            <p className="text-[13px] font-semibold text-[#f0ad4e]">Chế độ hạn chế</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[color:var(--muted)]">
              Bạn đang mở ngoài Telegram. Chỉ có thể nhập ví bằng khoá bí mật.
              Mở trong Telegram để tạo ví mới, nhận airdrop SOL và khôi phục ví.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 flex-1">
        {step === 'welcome' && (
          <div className="space-y-3">
            <div className="rounded-[26px] glass-strong p-5">
              <div className="mb-3 flex items-center gap-3">
                <img
                  src={USDC_AVATAR}
                  alt="USDC"
                  className="h-11 w-11 rounded-full ring-2 ring-white/15"
                />
                <div>
                  <p className="text-[14px] font-semibold">Chỉ USDC — đã xác minh</p>
                  <p className="text-[11px] text-[color:var(--muted)]">≈ 1 USD · ≈ 30.000 ₫</p>
                </div>
              </div>
              <p className="font-mono text-[10px] break-all text-[color:var(--muted)]">{USDC_MINT}</p>
            </div>

            <ul className="space-y-2.5 rounded-[26px] glass p-5">
              {[
                { icon: <Wallet size={16} />, text: 'Nhiều ví, chuyển đổi tức thì' },
                { icon: <ShieldCheck size={16} />, text: inTelegram ? 'Bảo mật bằng Telegram + mã PIN' : 'Nhập ví bằng khoá bí mật' },
                { icon: <Sparkles size={16} />, text: 'MEMO đẹp, danh mục màu, lời chúc' },
                ...(inTelegram ? [{ icon: <CloudDownload size={16} />, text: 'Khôi phục ví bằng Telegram ID' }] : []),
              ].map((item) => (
                <li key={item.text} className="flex items-center gap-3 text-[13px]">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl accent-gradient text-white">
                    {item.icon}
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setStep('method')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl accent-gradient py-4 text-[15px] font-semibold text-white shadow-glow"
            >
              Bắt đầu <ArrowRight size={17} />
            </button>
          </div>
        )}

        {step === 'method' && (
          <div className="space-y-2.5">
            {/* Create new wallet — only in Telegram */}
            {inTelegram && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await createWallet(undefined, 'Ví chính')
                    pushToast({ tone: 'success', title: 'Đã tạo ví mới' })
                    setStep('secure')
                  })
                }
                className="flex w-full items-center gap-3 rounded-2xl accent-gradient px-4 py-4 text-left text-white shadow-glow disabled:opacity-60"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={19} />}
                </span>
                <span>
                  <span className="block text-[14px] font-semibold">Tạo ví mới</span>
                  <span className="block text-[11px] opacity-85">Nhận 10 SOL airdrop phí gas</span>
                </span>
              </button>
            )}

            {/* Import wallet by keypair/passphrase/privatekey — for everyone */}
            <button
              type="button"
              onClick={() => setStep('import')}
              className="flex w-full items-center gap-3 rounded-2xl border border-[color:var(--border)] px-4 py-4 text-left"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--surface-strong)]">
                <ShieldCheck size={19} />
              </span>
              <span>
                <span className="block text-[14px] font-semibold">Nhập khoá bí mật</span>
                <span className="block text-[11px] text-[color:var(--muted)]">
                  JSON nhị phân · base58 · private key · passphrase
                </span>
              </span>
            </button>

            {/* Restore by Telegram ID — only in Telegram */}
            {inTelegram && (
              <button
                type="button"
                disabled={busy || !tgId}
                onClick={() =>
                  run(async () => {
                    if (!tgId) return
                    const count = await restoreFromTelegram(tgId)
                    if (count > 0) {
                      pushToast({ tone: 'success', title: `Đã khôi phục ${count} ví` })
                      setStep('secure')
                    } else {
                      setError('Không tìm thấy bản sao lưu cho Telegram ID này')
                    }
                  })
                }
                className="flex w-full items-center gap-3 rounded-2xl border border-[color:var(--border)] px-4 py-4 text-left disabled:opacity-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--surface-strong)]">
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <CloudDownload size={19} />}
                </span>
                <span>
                  <span className="block text-[14px] font-semibold">Khôi phục ví bằng Telegram</span>
                  <span className="block text-[11px] text-[color:var(--muted)]">
                    Tự động phục hồi tất cả ví từ ID Telegram
                  </span>
                </span>
              </button>
            )}

            {error && (
              <p className="rounded-2xl border border-[#ff6b81]/40 bg-[#ff6b81]/10 px-3.5 py-3 text-[12px] text-[#ff8fa1]">
                {error}
              </p>
            )}

            <p className="text-center text-[10.5px] leading-relaxed text-[color:var(--muted)]">
              {inTelegram ? `Giới hạn ${MAX_WALLETS} ví · Cloud Chain` : 'Chế độ hạn chế — mở trong Telegram để đầy đủ tính năng'}
            </p>
          </div>
        )}

        {(step === 'import' || step === 'restore') && (
          <div className="space-y-3">
            <div className="rounded-[26px] glass p-5">
              <p className="mb-2 text-[13px] font-semibold">
                {step === 'import' ? 'Nhập khoá bí mật' : 'Khôi phục ví từ sao lưu đám mây'}
              </p>
              <textarea
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                rows={5}
                spellCheck={false}
                placeholder="[12,34,…]  ·  4Zk…  ·  twelve word phrase  ·  passphrase"
                className="w-full resize-none rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 font-mono text-[12.5px] outline-none focus:border-[color:var(--accent)]"
              />
              <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--muted)]">
                {step === 'import'
                  ? 'Hỗ trợ mảng JSON nhị phân (secretKey), base58, private key hex, cụm 12/24 từ BIP39 và passphrase tự do.'
                  : 'Bản sao lưu được mã hoá bằng chính khoá bí mật của bạn — máy chủ không đọc được nội dung.'}
              </p>
            </div>

            {error && (
              <p className="rounded-2xl border border-[#ff6b81]/40 bg-[#ff6b81]/10 px-3.5 py-3 text-[12px] text-[#ff8fa1]">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStep('method')}
                className="rounded-2xl border border-[color:var(--border)] py-3.5 text-[13px] font-semibold"
              >
                Quay lại
              </button>
              <button
                type="button"
                disabled={busy || !secret.trim()}
                onClick={() =>
                  run(async () => {
                    if (step === 'import') {
                      await createWallet(secret, 'Ví của tôi')
                      // Check SOL balance after import — warn if insufficient
                      try {
                        const sol = await getSolBalance(DEFAULT_RPC_URL, (await import('../lib/crypto')).importSecret(secret).then(r => r.keypair.publicKey.toBase58()).catch(() => ''))
                        if (sol < 0.05) {
                          setSolWarning(`Ví chỉ có ${sol.toFixed(6)} SOL — không đủ phí gas. Mở trong Telegram để nhận airdrop SOL.`)
                        }
                      } catch { /* ignore balance check failure */ }
                    } else {
                      await restoreFromCloud(secret)
                    }
                    setStep('secure')
                  })
                }
                className="flex items-center justify-center gap-2 rounded-2xl accent-gradient py-3.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {busy && <Loader2 size={15} className="animate-spin" />}
                {step === 'import' ? 'Nhập ví' : 'Khôi phục'}
              </button>
            </div>

            {solWarning && (
              <div className="flex items-start gap-2 rounded-2xl border border-[#f0ad4e]/30 bg-[#f0ad4e]/10 px-3.5 py-3 text-[11.5px] text-[#f0ad4e]">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{solWarning}</span>
              </div>
            )}
          </div>
        )}

        {step === 'secure' && (
          <div className="space-y-3">
            <div className="rounded-[26px] glass-strong p-5">
              <p className="flex items-center gap-2 text-[14px] font-semibold">
                <KeyRound size={17} className="accent-text" /> Mã PIN bảo vệ
              </p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[color:var(--muted)]">
                Tạo mã PIN 4–6 chữ số để khoá và mở ví. Đây là lớp bảo mật chính
                cùng với định danh Telegram của bạn.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  inputMode="numeric"
                  value={pin}
                  onChange={(event) => setPinValue(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="PIN 4–6 số"
                  className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-3 text-center text-[16px] tracking-[0.4em] outline-none focus:border-[color:var(--accent)]"
                />
                <input
                  inputMode="numeric"
                  value={pin2}
                  onChange={(event) => setPin2(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Nhập lại"
                  className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-3 text-center text-[16px] tracking-[0.4em] outline-none focus:border-[color:var(--accent)]"
                />
              </div>
              <button
                type="button"
                disabled={busy || pin.length < 4 || pin !== pin2}
                onClick={() =>
                  run(async () => {
                    await setPin(pin)
                    pushToast({ tone: 'success', title: 'Đã thiết lập mã PIN' })
                    completeOnboarding()
                  })
                }
                className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-2xl accent-gradient py-3.5 text-[14px] font-semibold text-white shadow-glow disabled:opacity-60"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                Lưu PIN & vào ví
              </button>
            </div>

            {error && (
              <p className="rounded-2xl border border-[#ff6b81]/40 bg-[#ff6b81]/10 px-3.5 py-3 text-[12px] text-[#ff8fa1]">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => completeOnboarding()}
              className="w-full rounded-2xl py-3 text-[13px] font-semibold text-[color:var(--muted)] transition hover:text-[color:var(--accent)]"
            >
              Bỏ qua — tôi sẽ tự lưu khoá bí mật
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[12.5px] font-semibold text-[color:var(--muted)]">
        {wallets.length ? 'Đã tạo ví — bảo vệ khoá hoặc bỏ qua để tiếp tục' : 'Hãy tạo hoặc nhập một ví để tiếp tục'}
      </p>
    </div>
  )
}
