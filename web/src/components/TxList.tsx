import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, ExternalLink, Loader2, Send, Sparkles, Webhook, X } from 'lucide-react'
import { TxEntry, formatAmount } from '../lib/solana'
import { splitMemo } from '../lib/categories'
import { copyToClipboard, formatUsd, formatVnd, fullDateTime, relativeTime } from '../lib/format'
import { useWallet } from '../state/WalletProvider'
import { sendWebhook, isWebhookSent, markWebhookSent, buildTxMessage } from '../lib/webhook'
import UsdcAvatar from './UsdcAvatar'

function AmountLine({ entry }: { entry: TxEntry }) {
  const sign = entry.direction === 'in' ? '+' : entry.direction === 'out' ? '−' : ''
  const color =
    entry.status === 'failed'
      ? '#ff4d6d'
      : entry.direction === 'in'
        ? '#22e07a'
        : entry.direction === 'out'
          ? 'var(--text)'
          : 'var(--muted)'
  return (
    <span className="shrink-0 text-right">
      <span className="block text-[15px] font-semibold tabular-nums" style={{ color }}>
        {sign}
        {formatAmount(entry.amount, entry.amount < 1 ? 4 : 2)} USDC
      </span>
      <span className="block text-[10.5px] text-[color:var(--muted)]">
        {entry.status === 'failed' ? 'Thất bại' : relativeTime(entry.blockTime)}
      </span>
    </span>
  )
}

export function TxRow({ entry, onSelect }: { entry: TxEntry; onSelect: (entry: TxEntry) => void }) {
  const { txMeta, contacts } = useWallet()
  const meta = txMeta[entry.signature]
  const parsed = splitMemo(entry.memo)
  const category = parsed.category
  const color = meta?.category ? undefined : category.color
  const label = parsed.title || meta?.wish || category.label
  const contact = entry.counterparty ? contacts.find((c) => c.address === entry.counterparty) : null
  const [webhookSent, setWebhookSent] = useState(() => isWebhookSent(entry.signature))

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === entry.signature) setWebhookSent(true)
    }
    window.addEventListener('webhook-sent', handler)
    return () => window.removeEventListener('webhook-sent', handler)
  }, [entry.signature])

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-[color:var(--surface)] active:scale-[0.993]"
    >
      <span
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[17px]"
        style={{
          background: `color-mix(in srgb, ${color || category.color} 22%, transparent)`,
          border: `1px solid color-mix(in srgb, ${color || category.color} 42%, transparent)`,
        }}
      >
        {entry.direction === 'in' ? (
          <ArrowDownLeft size={16} className="text-[#22e07a]" />
        ) : entry.direction === 'out' ? (
          <ArrowUpRight size={16} className="text-[color:var(--accent)]" />
        ) : (
          <Sparkles size={16} className="text-[color:var(--muted)]" />
        )}
        <span className="absolute -bottom-1 -right-1 rounded-full bg-[color:var(--bg)] px-[3px] text-[9px] leading-3">
          {category.emoji}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold">
            {entry.status === 'failed' ? 'Giao dịch thất bại' : label}
          </span>
          {contact && (
            <span className="shrink-0 rounded-full bg-[color:var(--accent)]/12 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--accent)]">
              {contact.name}
            </span>
          )}
          {webhookSent && (
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-[#229ED9]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#229ED9]">
              <Webhook size={9} /> Đã gửi
            </span>
          )}
        </span>
        {entry.memo && (
          <span className="mt-0.5 block truncate text-[11.5px] text-[color:var(--muted)]">{entry.memo}</span>
        )}
      </span>

      <AmountLine entry={entry} />
    </button>
  )
}

export function TxDetail({ entry, onClose }: { entry: TxEntry | null; onClose: () => void }) {
  const { price, prefs, contacts, activeWallet, pushToast } = useWallet()
  const [copied, setCopied] = useState(false)
  const [webhookSent, setWebhookSent] = useState(false)
  const [sendingWebhook, setSendingWebhook] = useState(false)

  useEffect(() => {
    if (entry) setWebhookSent(isWebhookSent(entry.signature))
  }, [entry])

  if (!entry) return null

  const parsed = splitMemo(entry.memo)
  const totalUsd = formatUsd(entry.amount)
  const totalVnd = formatVnd(entry.amount * price.vnd)
  const contact = entry.counterparty ? contacts.find((c) => c.address === entry.counterparty) : null

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 modal-overlay-blur" onClick={onClose} aria-hidden />
      <div
        className="relative z-10 max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[28px] glass-strong p-5 shadow-card sm:rounded-[28px]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 1.25rem)' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/25 sm:hidden" />
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
              Chi tiết giao dịch
            </p>
            <h3 className="mt-1 text-[17px] font-semibold">
              {entry.direction === 'in' ? 'Nhận USDC' : entry.direction === 'out' ? 'Gửi USDC' : 'Giao dịch'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-xl p-1.5 text-[color:var(--muted)] transition hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="mb-4 flex items-center gap-3 rounded-3xl p-4"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${parsed.category.color} 26%, transparent), transparent)`,
            border: `1px solid color-mix(in srgb, ${parsed.category.color} 40%, transparent)`,
          }}
        >
          <UsdcAvatar size={46} />
          <div className="min-w-0 flex-1">
            <p className="text-[22px] font-bold tabular-nums leading-tight">
              {entry.direction === 'in' ? '+' : entry.direction === 'out' ? '−' : ''}
              {formatAmount(entry.amount, entry.amount < 1 ? 4 : 2)} USDC
            </p>
            <p className="text-[12px] text-[color:var(--muted)]">
              ≈ {totalUsd} · {totalVnd}
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
            style={{
              background: `color-mix(in srgb, ${parsed.category.color} 26%, transparent)`,
              color: 'var(--text)',
            }}
          >
            {parsed.category.emoji} {parsed.category.label}
          </span>
        </div>

        {entry.memo && (
          <div className="mb-4 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3.5">
            <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
              MEMO
            </p>
            <p className="text-[13.5px] font-medium leading-snug">{entry.memo}</p>
          </div>
        )}

        <dl className="space-y-2.5 text-[12.5px]">
          {[
            { label: 'Trạng thái', value: entry.status === 'failed' ? 'Thất bại' : 'Thành công' },
            { label: 'Thời gian', value: fullDateTime(entry.blockTime) },
            { label: 'Slot', value: String(entry.slot) },
            {
              label: entry.direction === 'in' ? 'Từ' : 'Đến',
              value: contact ? contact.name : (entry.counterparty || 'Không xác định'),
            },
            ...(contact && entry.counterparty ? [{ label: 'Địa chỉ', value: entry.counterparty }] : []),
            { label: 'Chữ ký', value: entry.signature },
          ].map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-4 border-b border-[color:var(--border)] pb-2.5 last:border-0">
              <dt className="shrink-0 text-[color:var(--muted)]">{row.label}</dt>
              <dd className="min-w-0 break-all text-right font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={async () => {
              await copyToClipboard(entry.signature)
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            }}
            className="rounded-2xl border border-[color:var(--border)] px-4 py-3 text-[13px] font-semibold"
          >
            {copied ? 'Đã sao chép' : 'Sao chép chữ ký'}
          </button>
          <a
            href={`/explorer?tx=${entry.signature}`}
            className="flex items-center justify-center gap-1.5 rounded-2xl accent-gradient px-4 py-3 text-[13px] font-semibold text-white"
          >
            <ExternalLink size={15} /> Kiểm tra
          </a>
        </div>

        {webhookSent && (
          <div className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl border border-[#229ED9]/30 bg-[#229ED9]/10 px-4 py-2.5 text-[12px] font-semibold text-[#229ED9]">
            <Check size={14} /> Webhook đã gửi thành công
          </div>
        )}

        {prefs.webhookEnabled && entry.status === 'success' && !webhookSent && (
          <button
            type="button"
            disabled={sendingWebhook || !prefs.webhookBotToken || !prefs.webhookTopicUrl}
            onClick={async () => {
              if (!entry || !activeWallet) return
              setSendingWebhook(true)
              try {
                const contact = entry.counterparty ? contacts.find((c) => c.address === entry.counterparty) : null
                const message = buildTxMessage(entry, activeWallet.name, activeWallet.address, contact?.name)
                const result = await sendWebhook(prefs.webhookBotToken, prefs.webhookTopicUrl, message)
                if (result.ok) {
                  markWebhookSent(entry.signature)
                  setWebhookSent(true)
                  pushToast({ tone: 'success', title: 'Webhook đã gửi', body: 'Dữ liệu giao dịch đã đẩy lên topic' })
                } else {
                  pushToast({ tone: 'error', title: 'Gửi webhook thất bại', body: result.error })
                }
              } finally {
                setSendingWebhook(false)
              }
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#229ED9]/40 py-3 text-[13px] font-semibold text-[#229ED9] disabled:opacity-50"
          >
            {sendingWebhook ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Gửi Webhook
          </button>
        )}

        {prefs.fiat === 'usd' && (
          <p className="mt-3 text-center text-[11px] text-[color:var(--muted)]">
            Giá tham chiếu USDC ≈ 1 USD
          </p>
        )}
      </div>
    </div>
  )
}

export default function TxList({
  entries,
  loading,
  emptyHint,
  onSelect,
  limit,
}: {
  entries: TxEntry[]
  loading?: boolean
  emptyHint?: string
  onSelect: (entry: TxEntry) => void
  limit?: number
}) {
  const list = limit ? entries.slice(0, limit) : entries

  if (loading && entries.length === 0) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((index) => (
          <div key={index} className="skeleton h-[62px] rounded-2xl" />
        ))}
      </div>
    )
  }

  if (!list.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--border)] px-4 py-8 text-center">
        <p className="text-[13px] font-medium">Chưa có giao dịch USDC</p>
        <p className="mt-1 text-[11.5px] text-[color:var(--muted)]">
          {emptyHint || 'Các giao dịch sẽ xuất hiện ở đây kèm MEMO và danh mục.'}
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-[color:var(--border)]">
      {list.map((entry) => (
        <TxRow key={entry.signature} entry={entry} onSelect={onSelect} />
      ))}
    </div>
  )
}
