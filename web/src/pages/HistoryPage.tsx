import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Filter, RefreshCw, Search } from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import { TxEntry, formatAmount } from '../lib/solana'
import { splitMemo } from '../lib/categories'
import { fullDateTime, relativeTime } from '../lib/format'
import TxList, { TxDetail } from '../components/TxList'

/** Strip all non-digit characters so searching "5.000" or "5,000" or "+5000" all match raw "5000". */
function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

/** Strip separators (spaces, commas, slashes, colons) for flexible date/time matching. */
function normalizeTime(value: string): string {
  return value.replace(/[\s,/:]/g, '').toLowerCase()
}

/** Generate multiple time representations of a blockTime for matching. */
function timeStrings(blockTime: number | null): string[] {
  if (!blockTime) return []
  const date = new Date(blockTime * 1000)
  const full = fullDateTime(blockTime)                        // "15/10/2026, 12:38"
  const rel = relativeTime(blockTime)                          // "5 phút trước"
  const dateOnly = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) // "15/10/2026"
  const dateMonth = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })                   // "15/10"
  const timeOnly = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })                  // "12:38"
  const timeDate = `${timeOnly} ${dateOnly}`                   // "12:38 15/10/2026"
  return [full, rel, dateOnly, dateMonth, timeOnly, timeDate]
}

type FilterId = 'all' | 'in' | 'out' | 'failed'

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'in', label: 'Đã nhận' },
  { id: 'out', label: 'Đã gửi' },
  { id: 'failed', label: 'Thất bại' },
]

export default function HistoryPage() {
  const { history, historyLoading, refresh, activeWallet, contacts, txMeta } = useWallet()
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<TxEntry | null>(null)

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const termDigits = digitsOnly(term)
    const termTime = normalizeTime(term)
    return history.filter((entry) => {
      if (filter === 'failed' && entry.status !== 'failed') return false
      if (filter !== 'failed' && filter !== 'all' && entry.direction !== filter) return false
      if (!term) return true
      // MEMO, signature, counterparty address (địa chỉ gửi/nhận)
      if (
        entry.memo.toLowerCase().includes(term) ||
        entry.signature.toLowerCase().includes(term) ||
        (entry.counterparty || '').toLowerCase().includes(term)
      ) return true
      // Amount / balance — ignore currency formatting and +/- signs
      if (termDigits && digitsOnly(String(entry.amount)).includes(termDigits)) return true
      // Slot
      if (termDigits && digitsOnly(String(entry.slot)).includes(termDigits)) return true
      // Phí SOL — raw fee or default estimate (0.000005) when fee is 0/null
      const feeDigits = entry.fee != null && entry.fee > 0 ? digitsOnly(String(entry.fee)) : '0000005'
      if (termDigits && feeDigits.includes(termDigits)) return true
      // Mốc thời gian — exact, relative, date-only, time-only, or time+date
      if (termTime && timeStrings(entry.blockTime).some((s) => normalizeTime(s).includes(termTime))) return true
      // Contact name and contact annotation (note)
      const contact = entry.counterparty ? contacts.find((c) => c.address === entry.counterparty) : null
      if (contact) {
        if (contact.name.toLowerCase().includes(term)) return true
        if (contact.note && contact.note.toLowerCase().includes(term)) return true
      }
      // TxMeta: counterparty label and note
      const meta = txMeta[entry.signature]
      if (meta) {
        if (meta.counterpartyLabel && meta.counterpartyLabel.toLowerCase().includes(term)) return true
        if (meta.note && meta.note.toLowerCase().includes(term)) return true
      }
      return false
    })
  }, [history, filter, query, contacts, txMeta])

  const totals = useMemo(() => {
    const incoming = history
      .filter((entry) => entry.direction === 'in' && entry.status === 'success')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const outgoing = history
      .filter((entry) => entry.direction === 'out' && entry.status === 'success')
      .reduce((sum, entry) => sum + entry.amount, 0)
    const memos = new Set(history.map((entry) => entry.memo).filter(Boolean))
    return { incoming, outgoing, memos: memos.size }
  }, [history])

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; color: string; emoji: string; count: number }>()
    history.forEach((entry) => {
      const { category } = splitMemo(entry.memo)
      const current = map.get(category.id) || {
        label: category.label,
        color: category.color,
        emoji: category.emoji,
        count: 0,
      }
      current.count += 1
      map.set(category.id, current)
    })
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5)
  }, [history])

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Lịch sử giao dịch</h1>
          <p className="mt-0.5 text-[12px] text-[color:var(--muted)]">
            Ví {activeWallet?.name} · Cloud Chain
          </p>
        </div>
        <button
          type="button"
          aria-label="Làm mới"
          onClick={() => void refresh()}
          className="rounded-2xl glass p-2.5 text-[color:var(--muted)]"
        >
          <RefreshCw size={16} className={historyLoading ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[22px] glass p-3.5">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#22e07a]">
            <ArrowDownLeft size={12} /> Đã nhận
          </p>
          <p className="mt-1.5 text-[19px] font-bold tabular-nums">
            {formatAmount(totals.incoming, 2)}
          </p>
          <p className="text-[10.5px] text-[color:var(--muted)]">USDC · {totals.memos} MEMO khác nhau</p>
        </div>
        <div className="rounded-[22px] glass p-3.5">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--accent)]">
            <ArrowUpRight size={12} /> Đã gửi
          </p>
          <p className="mt-1.5 text-[19px] font-bold tabular-nums">
            {formatAmount(totals.outgoing, 2)}
          </p>
          <p className="text-[10.5px] text-[color:var(--muted)]">USDC tổng cộng</p>
        </div>
      </div>

      {categoryBreakdown.length > 0 && (
        <div className="rounded-[22px] glass p-3.5">
          <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            <Filter size={12} /> Danh mục
          </p>
          <div className="space-y-2">
            {categoryBreakdown.map((item) => {
              const ratio = item.count / Math.max(1, history.length)
              return (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-[11.5px]">
                    <span className="font-medium">
                      {item.emoji} {item.label}
                    </span>
                    <span className="text-[color:var(--muted)]">{item.count} giao dịch</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-strong)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(6, ratio * 100)}%`, background: item.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-2xl glass px-3">
        <Search size={15} className="shrink-0 text-[color:var(--muted)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm theo số tiền, thời gian, slot, phí, danh bạ, địa chỉ…"
          className="w-full bg-transparent py-3 text-[12.5px] outline-none"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={[
              'shrink-0 rounded-2xl px-3.5 py-2 text-[12px] font-semibold transition',
              filter === item.id ? 'accent-gradient text-white shadow-glow' : 'glass text-[color:var(--muted)]',
            ].join(' ')}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="rounded-[26px] glass p-2">
        <TxList
          entries={filtered}
          loading={historyLoading}
          onSelect={setSelected}
          emptyHint="Chưa có giao dịch khớp bộ lọc này."
        />
      </div>

      <p className="px-1 text-[10.5px] text-[color:var(--muted)]">
        Hiển thị {filtered.length} / {history.length} giao dịch.
      </p>

      <TxDetail entry={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
