import { useMemo, useState } from 'react'
import { Check, Search, UserX, X } from 'lucide-react'
import { shortAddress } from '../lib/crypto'

type Contact = {
  id: string
  name: string
  address: string
  note?: string
}

type Props = {
  contacts: Contact[]
  onSelect: (address: string) => void
  onClose: () => void
  selectedAddress?: string
}

/**
 * Searchable contact picker popup — bottom-sheet on mobile, centered on desktop.
 * Designed for large contact lists with instant filtering by name or address.
 */
export default function ContactPicker({ contacts, onSelect, onClose, selectedAddress }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!query.trim()) return contacts
    const q = query.toLowerCase()
    return contacts.filter(
      (c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q),
    )
  }, [contacts, query])

  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 modal-overlay-blur" onClick={onClose} aria-hidden />
      <div
        className="relative z-10 flex max-h-[82vh] w-full max-w-md flex-col rounded-t-[28px] glass-strong shadow-card sm:rounded-[28px]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 0.5rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-[color:var(--border)] sm:hidden" />

        {/* Header + search */}
        <div className="shrink-0 px-5 pt-4 pb-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Chọn danh bạ</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-xl p-1.5 text-[color:var(--muted)] transition hover:bg-[color:var(--surface-strong)]"
            >
              <X size={18} />
            </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[color:var(--muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc địa chỉ…"
              autoFocus
              className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] py-3 pl-10 pr-4 text-[13.5px] outline-none focus:border-[color:var(--accent)]"
            />
          </div>
          <p className="mt-2 text-[11px] text-[color:var(--muted)]">
            {filtered.length} / {contacts.length} danh bạ
          </p>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <UserX size={28} className="text-[color:var(--muted)]" />
              <p className="text-[13px] text-[color:var(--muted)]">
                {query.trim() ? 'Không tìm thấy danh bạ phù hợp' : 'Chưa có danh bạ nào'}
              </p>
            </div>
          ) : (
            filtered.map((contact) => {
              const isSelected = selectedAddress === contact.address
              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => {
                    onSelect(contact.address)
                    onClose()
                  }}
                  className={[
                    'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition active:scale-[0.99]',
                    isSelected ? 'bg-[color:var(--surface-strong)]' : 'hover:bg-[color:var(--surface)]',
                  ].join(' ')}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-strong)] text-[14px] font-semibold">
                    {contact.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold">{contact.name}</p>
                    <p className="truncate font-mono text-[11px] text-[color:var(--muted)]">
                      {shortAddress(contact.address, 6)}
                    </p>
                  </div>
                  {isSelected && <Check size={16} className="shrink-0 accent-text" />}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
