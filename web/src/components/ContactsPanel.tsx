import { useMemo, useState } from 'react'
import { BookUser, Check, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import { Contact } from '../state/vault'
import { isValidAddress, shortAddress } from '../lib/crypto'
import { copyToClipboard } from '../lib/format'

const emptyDraft = { name: '', address: '', note: '' }

export default function ContactsPanel() {
  const { contacts, saveContacts, pushToast, history, activeWallet } = useWallet()
  const [draft, setDraft] = useState(emptyDraft)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [open, setOpen] = useState(false)

  const suggestions = useMemo(() => {
    const known = new Set(contacts.map((contact) => contact.address))
    return history
      .filter(
        (entry) =>
          entry.counterparty &&
          !known.has(entry.counterparty) &&
          entry.counterparty !== activeWallet?.address,
      )
      .slice(0, 4)
  }, [contacts, history, activeWallet?.address])

  const valid = draft.name.trim().length > 0 && isValidAddress(draft.address)

  const submit = async () => {
    if (!valid) return
    const next = editing
      ? contacts.map((contact) =>
          contact.id === editing.id
            ? { ...contact, name: draft.name.trim(), address: draft.address.trim(), note: draft.note.trim() }
            : contact,
        )
      : [
          ...contacts,
          {
            id: `c-${Date.now()}`,
            name: draft.name.trim(),
            address: draft.address.trim(),
            note: draft.note.trim(),
            createdAt: Date.now(),
          },
        ]
    await saveContacts(next)
    pushToast({ tone: 'success', title: editing ? 'Đã cập nhật danh bạ' : 'Đã thêm vào danh bạ' })
    setDraft(emptyDraft)
    setEditing(null)
    setOpen(false)
  }

  const remove = async (contact: Contact) => {
    await saveContacts(contacts.filter((item) => item.id !== contact.id))
    pushToast({ tone: 'info', title: 'Đã xoá khỏi danh bạ' })
  }

  const toggleFavorite = async (contact: Contact) => {
    await saveContacts(
      contacts.map((item) => (item.id === contact.id ? { ...item, favorite: !item.favorite } : item)),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookUser size={17} className="accent-text" />
          <h2 className="text-[15px] font-semibold">Danh bạ địa chỉ</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setDraft(emptyDraft)
            setOpen((value) => !value)
          }}
          className="flex items-center gap-1.5 rounded-2xl accent-gradient px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-glow"
        >
          {open ? <X size={14} /> : <Plus size={14} />}
          {open ? 'Đóng' : 'Thêm'}
        </button>
      </div>

      {open && (
        <div className="space-y-2.5 rounded-[24px] glass-strong p-4">
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Tên gợi nhớ (VD: Minh, Shop Hoa…)"
            className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-[13.5px] outline-none focus:border-[color:var(--accent)]"
          />
          <input
            value={draft.address}
            onChange={(event) => setDraft({ ...draft, address: event.target.value.trim() })}
            placeholder="Địa chỉ ví Solana / Cloud Chain"
            spellCheck={false}
            className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 font-mono text-[12px] outline-none focus:border-[color:var(--accent)]"
          />
          <input
            value={draft.note}
            onChange={(event) => setDraft({ ...draft, note: event.target.value })}
            placeholder="Ghi chú (tuỳ chọn)"
            className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-[13px] outline-none focus:border-[color:var(--accent)]"
          />
          {draft.address && !isValidAddress(draft.address) && (
            <p className="text-[11.5px] text-[#ffb020]">Địa chỉ chưa đúng định dạng Solana</p>
          )}
          <button
            type="button"
            disabled={!valid}
            onClick={submit}
            className="w-full rounded-2xl accent-gradient py-3 text-[13.5px] font-semibold text-white disabled:opacity-45"
          >
            {editing ? 'Lưu thay đổi' : 'Thêm vào danh bạ'}
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="rounded-[24px] glass p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
            Gợi ý từ lịch sử
          </p>
          <div className="space-y-1.5">
            {suggestions.map((entry) => (
              <button
                key={entry.signature}
                type="button"
                onClick={() => {
                  setEditing(null)
                  setDraft({ name: '', address: entry.counterparty!, note: entry.memo || '' })
                  setOpen(true)
                }}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-[color:var(--surface)]"
              >
                <Plus size={14} className="accent-text" />
                <span className="font-mono text-[11.5px]">{shortAddress(entry.counterparty!, 6)}</span>
                <span className="ml-auto truncate text-[11px] text-[color:var(--muted)]">
                  {entry.memo || 'Thêm vào danh bạ'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--border)] px-4 py-8 text-center">
          <p className="text-[13px] font-medium">Danh bạ đang trống</p>
          <p className="mt-1 text-[11.5px] text-[color:var(--muted)]">
            Lưu địa chỉ thường dùng để chuyển tiền nhanh và không nhập sai.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...contacts]
            .sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite))
            .map((contact) => (
              <div key={contact.id} className="flex items-center gap-3 rounded-2xl glass p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl accent-gradient text-[15px] font-bold text-white">
                  {contact.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold">
                    {contact.name}
                    {contact.favorite && <Star size={12} className="text-[#ffb020]" fill="#ffb020" />}
                  </p>
                  <p className="truncate font-mono text-[10.5px] text-[color:var(--muted)]">
                    {shortAddress(contact.address, 8)}
                  </p>
                  {contact.note && (
                    <p className="truncate text-[11px] text-[color:var(--muted)]">{contact.note}</p>
                  )}
                </div>
                <button
                  type="button"
                  title="Yêu thích"
                  onClick={() => toggleFavorite(contact)}
                  className="rounded-xl p-2 text-[color:var(--muted)] transition hover:bg-white/10"
                >
                  {contact.favorite ? <Check size={15} /> : <Star size={15} />}
                </button>
                <button
                  type="button"
                  title="Sửa"
                  onClick={() => {
                    setEditing(contact)
                    setDraft({ name: contact.name, address: contact.address, note: contact.note || '' })
                    setOpen(true)
                  }}
                  className="rounded-xl p-2 text-[color:var(--muted)] transition hover:bg-white/10"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  title="Xoá"
                  onClick={() => remove(contact)}
                  className="rounded-xl p-2 text-[#ff6b81] transition hover:bg-white/10"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
        </div>
      )}

      <p className="px-1 text-[10.5px] leading-relaxed text-[color:var(--muted)]">
        Danh bạ được mã hoá cùng két và tự động sao lưu lên đám mây cá nhân của bạn.
      </p>
    </div>
  )
}
