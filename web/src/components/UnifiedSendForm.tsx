import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BookUser,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plus,
  QrCode,
  Send as SendIcon,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import { CATEGORIES, WISHES, buildMemo, categoryById } from '../lib/categories'
import { isValidAddress, shortAddress } from '../lib/crypto'
import { USDC_MINT, formatAmount, formatSolBalance, parseAmountInput, SOL_ICON } from '../lib/solana'
import { copyToClipboard, formatUsd, formatVnd } from '../lib/format'
import { CoinConfig } from '../lib/coins'
import SendConfirm from './SendConfirm'
import QrScanner from './QrScanner'

type Props = { coin: CoinConfig }

export default function UnifiedSendForm({ coin }: Props) {
  const {
    send,
    sendSol,
    balance,
    price,
    contacts,
    wallets,
    activeWallet,
    pushToast,
    prefs,
    airdrop,
    verifyPin,
    pinEnabled,
    saveContacts,
  } = useWallet()

  const [to, setTo] = useState('')
  const [amountText, setAmountText] = useState('')
  const [categoryId, setCategoryId] = useState('pay')
  const [wish, setWish] = useState('')
  const [note, setNote] = useState('')
  const [stage, setStage] = useState<'form' | 'review' | 'sending' | 'done'>('form')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [maxPending, setMaxPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [contactName, setContactName] = useState('')
  const [contactNote, setContactNote] = useState('')

  const isUsdc = coin.id === 'usdc'
  const isSol = coin.id === 'sol'

  // Balance and amount parsing per coin
  const coinBalance = isUsdc ? balance.usdc : isSol ? balance.sol : 0
  const maxAmount = isUsdc
    ? Math.floor(balance.usdc * 1e6) / 1e6
    : isSol
      ? Math.max(0, balance.sol - 0.001)
      : 0
  const amount = isUsdc
    ? parseAmountInput(amountText, balance.decimals || 6)
    : Number.parseFloat(amountText.replace(/,/g, '.')) || 0

  const memo = useMemo(() => {
    if (!coin.hasMemo) return note.trim() || undefined
    return buildMemo(categoryId, wish, note)
  }, [coin, categoryId, wish, note])

  const validTo = isValidAddress(to) && to.trim() !== activeWallet?.address
  const category = categoryById(categoryId)
  const insufficient = amount > maxAmount
  const noFeeBudget = isUsdc && balance.sol < 0.0005

  const recipientLabel = useMemo(() => {
    const match = contacts.find((contact) => contact.address === to.trim())
    return match?.name || (validTo ? shortAddress(to.trim(), 5) : '')
  }, [contacts, to, validTo])

  const recipientInContacts = useMemo(
    () => contacts.some((c) => c.address === to.trim()),
    [contacts, to],
  )

  const formatCoinAmount = (value: number) => {
    if (isUsdc) return formatAmount(value, value < 1 ? 4 : 2)
    if (isSol) return value.toLocaleString('en-US', { maximumFractionDigits: 6 })
    return value.toLocaleString('en-US', { maximumFractionDigits: coin.decimals })
  }

  const reset = () => {
    setTo('')
    setAmountText('')
    setWish('')
    setNote('')
    setStage('form')
    setSignature(null)
    setError(null)
    setShowAddContact(false)
    setContactName('')
    setContactNote('')
  }

  const doSend = async () => {
    setBusy(true)
    setError(null)
    try {
      setStage('sending')
      let sig: string
      if (isUsdc) {
        sig = await send({ to: to.trim(), amount, memo: memo || '', category: categoryId, wish })
      } else if (isSol) {
        sig = await sendSol({ to: to.trim(), amount, memo: note.trim() || undefined })
      } else {
        throw new Error(`Đồng ${coin.symbol} chưa hỗ trợ gửi`)
      }
      setSignature(sig)
      setStage('done')
    } catch (err: any) {
      setError(err?.message || 'Giao dịch thất bại')
      setStage('form')
    } finally {
      setBusy(false)
    }
  }

  const handleAddContact = async () => {
    if (!contactName.trim() || !isValidAddress(to.trim())) return
    const next = [
      ...contacts,
      {
        id: `c-${Date.now()}`,
        name: contactName.trim(),
        address: to.trim(),
        note: contactNote.trim(),
        createdAt: Date.now(),
      },
    ]
    await saveContacts(next)
    pushToast({ tone: 'success', title: 'Đã thêm vào danh bạ', body: contactName.trim() })
    setShowAddContact(false)
    setContactName('')
    setContactNote('')
  }

  // --- Done stage ---
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
          <h2 className="relative text-[19px] font-semibold">
            Chuyển {coin.symbol} thành công
          </h2>
          <p className="relative mt-1 text-[13px] text-[color:var(--muted)]">
            {formatCoinAmount(amount)} {coin.symbol} → {recipientLabel}
          </p>
          {coin.hasMemo && memo && (
            <div
              className="relative mt-4 rounded-2xl p-3.5 text-left"
              style={{
                background: `color-mix(in srgb, ${category.color} 20%, transparent)`,
                border: `1px solid color-mix(in srgb, ${category.color} 40%, transparent)`,
              }}
            >
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
                {isUsdc ? 'MEMO đã ghi' : 'Ghi chú'}
              </p>
              <p className="text-[13.5px] font-medium leading-snug">{memo}</p>
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

          {/* Add to contacts if recipient not in contacts */}
          {!recipientInContacts && !showAddContact && (
            <button
              type="button"
              onClick={() => setShowAddContact(true)}
              className="relative mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[color:var(--accent)]/40 py-3 text-[13px] font-semibold text-[color:var(--accent)]"
            >
              <UserPlus size={15} /> Thêm vào danh bạ
            </button>
          )}

          {showAddContact && (
            <div className="relative mt-3 space-y-2.5 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-left">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--muted)]">
                <UserPlus size={14} /> Thêm địa chỉ vào danh bạ
              </p>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Tên gợi nhớ (VD: Minh, Shop Hoa…)"
                className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] px-4 py-3 text-[13px] outline-none focus:border-[color:var(--accent)]"
              />
              <input
                value={contactNote}
                onChange={(e) => setContactNote(e.target.value)}
                placeholder="Ghi chú (tuỳ chọn)"
                className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg)] px-4 py-3 text-[12.5px] outline-none focus:border-[color:var(--accent)]"
              />
              <p className="truncate font-mono text-[10.5px] text-[color:var(--muted)]">{shortAddress(to.trim(), 8)}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddContact(false)}
                  className="rounded-2xl border border-[color:var(--border)] py-3 text-[12.5px] font-semibold"
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  disabled={!contactName.trim()}
                  onClick={handleAddContact}
                  className="rounded-2xl accent-gradient py-3 text-[12.5px] font-semibold text-white disabled:opacity-45"
                >
                  Lưu
                </button>
              </div>
            </div>
          )}

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

  // --- Form stage ---
  return (
    <div className="space-y-4">
      {/* Amount card */}
      <div className="relative overflow-hidden rounded-[28px] glass-strong p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[12px] font-semibold text-[color:var(--muted)]">
            {coin.iconSm} Số tiền gửi
          </span>
          <span className="text-[11px] text-[color:var(--muted)]">
            Số dư {balance.loading ? '…' : isUsdc ? formatAmount(balance.usdc, 2) : isSol ? formatSolBalance(balance.sol) : '0'} {coin.symbol}
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
          <span className="shrink-0 text-[15px] font-semibold text-[color:var(--muted)]">{coin.symbol}</span>
        </div>

        {coin.hasUsdValue && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[color:var(--muted)]">
            <span>≈ {formatUsd(amount * price.usd)}</span>
            <span>≈ {formatVnd(amount * price.vnd)}</span>
            {price.fallback && <span className="text-[#ffb020]">(giá dự phòng)</span>}
          </div>
        )}

        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {coin.quickAmounts.map((value) => (
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
          <span className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-[color:var(--muted)]">
            <span className="flex items-center gap-1.5">
              <BookUser size={14} /> Người nhận
            </span>
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="flex items-center gap-1 rounded-xl border border-[color:var(--border)] px-2.5 py-1.5 text-[11px] font-semibold transition hover:bg-[color:var(--surface)]"
            >
              <QrCode size={13} /> Quét QR
            </button>
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

      {/* Memo builder (for coins with memo support) */}
      {coin.hasMemo && isUsdc && (
        <div className="rounded-[24px] glass p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--muted)]">
            <Sparkles size={14} className="accent-text" /> Danh mục & lời chúc
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategoryId(item.id)}
                className={[
                  'rounded-2xl border px-3 py-2 text-[12px] font-medium transition',
                  categoryId === item.id ? 'border-transparent text-white' : 'border-[color:var(--border)]',
                ].join(' ')}
                style={categoryId === item.id ? { background: item.color } : undefined}
              >
                {item.emoji} {item.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {WISHES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setWish(wish === item ? '' : item)}
                className={[
                  'rounded-2xl border px-3 py-1.5 text-[11.5px] transition',
                  wish === item
                    ? 'border-[color:var(--accent)] bg-[color:var(--surface-strong)] font-semibold'
                    : 'border-[color:var(--border)] text-[color:var(--muted)]',
                ].join(' ')}
              >
                {item}
              </button>
            ))}
          </div>

          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ghi chú thêm vào MEMO (tuỳ chọn)"
            maxLength={90}
            className="mt-3 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-[13px] outline-none focus:border-[color:var(--accent)]"
          />
        </div>
      )}

      {/* Simple note for non-USDC coins with memo */}
      {coin.hasMemo && !isUsdc && (
        <div className="rounded-[24px] glass p-4">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ghi chú (tuỳ chọn, ghi lên MEMO)"
            maxLength={90}
            className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-[13px] outline-none focus:border-[color:var(--accent)]"
          />
        </div>
      )}

      {/* Memo preview (USDC only) */}
      {coin.hasMemo && isUsdc && memo && (
        <div
          className="rounded-[24px] p-4"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${category.color} 26%, transparent), transparent 80%)`,
            border: `1px solid color-mix(in srgb, ${category.color} 45%, transparent)`,
          }}
        >
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]">
            MEMO sẽ ghi lên mạng Cloud Chain
          </p>
          <p className="text-[15px] font-semibold leading-snug">{memo}</p>
        </div>
      )}

      {insufficient && (
        <p className="flex items-center gap-1.5 rounded-2xl border border-[#ff6b81]/40 bg-[#ff6b81]/10 px-3.5 py-2.5 text-[12px] text-[#ff8fa1]">
          <AlertTriangle size={14} /> Số dư {coin.symbol} không đủ{isSol ? ' (cần giữ lại phí gas ≈ 0.001 SOL)' : ''}
        </p>
      )}
      {noFeeBudget && (
        <p className="flex items-center gap-1.5 rounded-2xl border border-[#ffb020]/40 bg-[#ffb020]/10 px-3.5 py-2.5 text-[12px] text-[#ffc95c]">
          {airdrop.status === 'pending' || airdrop.status === 'sending' ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Đang chờ airdrop SOL từ payserver…
            </>
          ) : (
            <>
              <AlertTriangle size={14} /> Cần một ít SOL trong ví để trả phí mạng
            </>
          )}
        </p>
      )}

      {stage === 'form' && (
        <button
          type="button"
          disabled={!validTo || amount <= 0 || insufficient || noFeeBudget}
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
              {formatCoinAmount(amount)} {coin.symbol}
            </span>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-[color:var(--muted)]">Phí mạng</span>
            <span className="font-semibold">≈ 0.000005 SOL</span>
          </div>
          {memo && (
            <div className="border-t border-[color:var(--border)] pt-3">
              <span className="text-[11px] text-[color:var(--muted)]">{isUsdc ? 'MEMO' : 'Ghi chú'}</span>
              <p className="mt-1 text-[13px] font-medium">{memo}</p>
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

      <p className="px-1 text-[10.5px] leading-relaxed text-[color:var(--muted)]">
        {coin.name} · {prefs.rpcUrl.replace(/^https?:\/\//, '')}
      </p>
      {isUsdc && <p className="px-1 font-mono text-[9.5px] break-all text-[color:var(--muted)]">{USDC_MINT}</p>}

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
              {isUsdc
                ? `Bạn sẽ gửi toàn bộ số dư ${formatAmount(maxAmount, 2)} ${coin.symbol}. Sau giao dịch, ví sẽ không còn ${coin.symbol}.`
                : `Bạn sẽ gửi tối đa ${maxAmount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${coin.symbol} (giữ lại ≈ 0.001 SOL cho phí).`}
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
                  setAmountText(String(isUsdc ? maxAmount : Math.floor(maxAmount * 1e9) / 1e9))
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

      {showQr && (
        <QrScanner
          onScan={(address) => {
            setTo(address)
            setShowQr(false)
            pushToast({ tone: 'success', title: 'Đã quét QR', body: shortAddress(address, 6) })
          }}
          onClose={() => setShowQr(false)}
        />
      )}
    </div>
  )
}
