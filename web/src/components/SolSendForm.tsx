import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send as SendIcon,
} from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import { isValidAddress, shortAddress } from '../lib/crypto'
import { formatSolBalance, SOL_ICON } from '../lib/solana'
import { copyToClipboard } from '../lib/format'
import SendConfirm from './SendConfirm'

const QUICK = [0.01, 0.05, 0.1, 0.5, 1]

export default function SolSendForm() {
  const { sendSol, balance, contacts, wallets, activeWallet, pushToast, verifyPin, pinEnabled } = useWallet()

  const [to, setTo] = useState('')
  const [amountText, setAmountText] = useState('')
  const [note, setNote] = useState('')
  const [stage, setStage] = useState<'form' | 'review' | 'sending' | 'done'>('form')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [maxPending, setMaxPending] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const amount = Number.parseFloat(amountText.replace(/,/g, '.')) || 0
  const validTo = isValidAddress(to) && to.trim() !== activeWallet?.address
  // Reserve a small amount for gas
  const maxSend = Math.max(0, balance.sol - 0.001)
  const insufficient = amount > maxSend

  const recipientLabel = useMemo(() => {
    const match = contacts.find((contact) => contact.address === to.trim())
    return match?.name || (validTo ? shortAddress(to.trim(), 5) : '')
  }, [contacts, to, validTo])

  const reset = () => {
    setTo('')
    setAmountText('')
    setNote('')
    setStage('form')
    setSignature(null)
    setError(null)
  }

  const doSend = async () => {
    setBusy(true)
    setError(null)
    try {
      setStage('sending')
      const sig = await sendSol({ to: to.trim(), amount, memo: note.trim() || undefined })
      setSignature(sig)
      setStage('done')
    } catch (err: any) {
      setError(err?.message || 'Giao dịch thất bại')
      setStage('form')
    } finally {
      setBusy(false)
    }
  }

  if (stage === 'done' && signature) {
    return (
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-[28px] glass-strong p-6 text-center shadow-card">
          <div
            aria-hidden
            className="absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full opacity-40 blur-3xl"
            style={{ background: 'radial-gradient(circle, var(--accent-2), transparent 70%)' }}
          />
          <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#22e07a]/15">
            <CheckCircle2 size={34} className="text-[#22e07a]" />
          </div>
          <h2 className="relative text-[19px] font-semibold">Chuyển SOL thành công</h2>
          <p className="relative mt-1 text-[13px] text-[color:var(--muted)]">
            {amount.toLocaleString('vi-VN', { maximumFractionDigits: 20 })} SOL → {recipientLabel}
          </p>
          {note.trim() && (
            <div className="relative mt-4 rounded-2xl border border-[color:var(--border)] p-3.5 text-left">
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                Ghi chú
              </p>
              <p className="text-[13.5px] font-medium leading-snug">{note}</p>
            </div>
          )}
          <p className="relative mt-3 break-all font-mono text-[10.5px] text-[color:var(--muted)]">
            {signature}
          </p>
          <div className="relative mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                await copyToClipboard(signature)
                pushToast({ tone: 'info', title: 'Đã sao chép chữ ký' })
              }}
              className="rounded-2xl border border-[color:var(--border)] py-3 text-[13px] font-semibold"
            >
              Sao chép chữ ký
            </button>
            <a
              href={`/explorer?tx=${signature}`}
              className="flex items-center justify-center gap-1.5 rounded-2xl accent-gradient py-3 text-[13px] font-semibold text-white"
            >
              <ExternalLink size={15} /> Kiểm tra
            </a>
          </div>
          <button
            type="button"
            onClick={reset}
            className="relative mt-2 w-full rounded-2xl py-3 text-[13px] font-semibold text-[color:var(--muted)]"
          >
            Giao dịch khác
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Amount card */}
      <div className="relative overflow-hidden rounded-[28px] glass-strong p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[12px] font-semibold text-[color:var(--muted)]">
            <img src={SOL_ICON} alt="SOL" className="h-6 w-6 rounded-full" loading="lazy" />
            Số tiền gửi
          </span>
          <span className="text-[11px] text-[color:var(--muted)]">
            Số dư {balance.loading ? '…' : formatSolBalance(balance.sol)}
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <input
            inputMode="decimal"
            value={amountText}
            onChange={(event) => setAmountText(event.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="0.00"
            className="w-full bg-transparent text-[38px] font-bold leading-none outline-none tabular-nums placeholder:text-[color:var(--muted)]"
          />
          <span className="shrink-0 text-[15px] font-semibold text-[color:var(--muted)]">SOL</span>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {QUICK.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmountText(String(value))}
              className="shrink-0 rounded-xl border border-[color:var(--border)] px-3 py-1.5 text-[12px] font-semibold transition hover:bg-[color:var(--surface)]"
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMaxPending(true)}
            className="shrink-0 rounded-xl accent-gradient px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            Tối đa
          </button>
        </div>
      </div>

      {/* Recipient */}
      <div className="rounded-[24px] glass p-4">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-[color:var(--muted)]">
            Người nhận
          </span>
          <input
            value={to}
            onChange={(event) => setTo(event.target.value.trim())}
            placeholder="Địa chỉ ví Cloud Chain / Solana"
            spellCheck={false}
            className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 font-mono text-[12.5px] outline-none focus:border-[color:var(--accent)]"
          />
        </label>
        {to && !isValidAddress(to) && (
          <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-[#ffb020]">
            <AlertTriangle size={13} /> Địa chỉ chưa đúng định dạng Solana
          </p>
        )}

        {wallets.length > 1 && (
          <div className="mt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Chuyển nhanh giữa ví của tôi
            </p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {wallets
                .filter((wallet) => wallet.id !== activeWallet?.id)
                .map((wallet) => (
                  <button
                    key={wallet.id}
                    type="button"
                    onClick={() => setTo(wallet.address)}
                    className={[
                      'flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-[12px] transition',
                      to === wallet.address
                        ? 'border-transparent accent-gradient text-white'
                        : 'border-[color:var(--border)]',
                    ].join(' ')}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: wallet.tone }} />
                    {wallet.name}
                  </button>
                ))}
            </div>
          </div>
        )}

        {contacts.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
              Danh bạ
            </p>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {contacts.slice(0, 12).map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => setTo(contact.address)}
                  className={[
                    'flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-[12px] transition',
                    to === contact.address
                      ? 'border-transparent accent-gradient text-white'
                      : 'border-[color:var(--border)]',
                  ].join(' ')}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--surface-strong)] text-[10px] font-semibold">
                    {contact.name.slice(0, 1).toUpperCase()}
                  </span>
                  {contact.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Note */}
      <div className="rounded-[24px] glass p-4">
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Ghi chú (tuỳ chọn, ghi lên MEMO)"
          maxLength={90}
          className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-[13px] outline-none focus:border-[color:var(--accent)]"
        />
      </div>

      {insufficient && (
        <p className="flex items-center gap-1.5 rounded-2xl border border-[#ff6b81]/40 bg-[#ff6b81]/10 px-3.5 py-2.5 text-[12px] text-[#ff8fa1]">
          <AlertTriangle size={14} /> Số dư SOL không đủ (cần giữ lại phí gas ≈ 0.001 SOL)
        </p>
      )}

      {stage === 'form' && (
        <button
          type="button"
          disabled={!validTo || amount <= 0 || insufficient}
          onClick={() => setStage('review')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl accent-gradient py-4 text-[15px] font-semibold text-white shadow-glow disabled:opacity-45"
        >
          <SendIcon size={17} /> Xem lại & gửi
        </button>
      )}

      {stage === 'review' && (
        <div className="space-y-3 rounded-[24px] glass-strong p-4">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[color:var(--muted)]">Người nhận</span>
            <span className="font-mono font-semibold">{recipientLabel}</span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[color:var(--muted)]">Số tiền</span>
            <span className="font-semibold tabular-nums">
              {amount.toLocaleString('vi-VN', { maximumFractionDigits: 6 })} SOL
            </span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[color:var(--muted)]">Phí mạng</span>
            <span className="font-semibold">≈ 0.000005 SOL</span>
          </div>
          {note.trim() && (
            <div className="border-t border-[color:var(--border)] pt-3">
              <span className="text-[11px] text-[color:var(--muted)]">Ghi chú</span>
              <p className="mt-1 text-[13px] font-medium">{note}</p>
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl accent-gradient py-4 text-[15px] font-semibold text-white shadow-glow disabled:opacity-60"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <SendIcon size={17} />}
            {busy ? 'Đang ký & gửi…' : 'Xác nhận & Gửi'}
          </button>
          <button
            type="button"
            onClick={() => setStage('form')}
            className="w-full py-2 text-[12.5px] font-semibold text-[color:var(--muted)]"
          >
            Quay lại chỉnh sửa
          </button>
        </div>
      )}

      {stage === 'sending' && (
        <div className="flex items-center justify-center gap-2 rounded-2xl glass px-4 py-4 text-[13px] font-semibold">
          <Loader2 size={17} className="animate-spin" /> Đang chờ mạng Cloud Chain xác nhận…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-[#ff6b81]/40 bg-[#ff6b81]/10 px-3.5 py-3 text-[12px] text-[#ff8fa1]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {confirming && (
        <SendConfirm
          onConfirm={() => {
            setConfirming(false)
            doSend()
          }}
          onCancel={() => setConfirming(false)}
          pinEnabled={pinEnabled}
          verifyPin={verifyPin}
        />
      )}

      {maxPending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5"
          onClick={() => setMaxPending(false)}
        >
          <div
            className="w-full max-w-sm rounded-[28px] glass-strong p-5 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] font-semibold">Xác nhận gửi tối đa?</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[color:var(--muted)]">
              Bạn sẽ gửi tối đa {maxSend.toLocaleString('vi-VN', { maximumFractionDigits: 6 })} SOL (giữ lại ≈ 0,001 SOL cho phí).
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMaxPending(false)}
                className="rounded-2xl border border-[color:var(--border)] py-3.5 text-[13px] font-semibold"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={() => {
                  setAmountText(String(Math.floor(maxSend * 1e9) / 1e9))
                  setMaxPending(false)
                }}
                className="rounded-2xl accent-gradient py-3.5 text-[13px] font-semibold text-white"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
