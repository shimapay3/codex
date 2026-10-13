import { useEffect, useState } from 'react'
import { ChevronDown, Copy, Plus, RefreshCw, Trash2, Wallet, X } from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import { copyToClipboard } from '../lib/format'
import { shortAddress } from '../lib/crypto'
import { MAX_WALLETS } from '../lib/solana'

type Props = { open: boolean; onClose: () => void }

export function WalletSwitcherChip({ onOpen }: { onOpen: () => void }) {
  const { activeWallet, wallets } = useWallet()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 items-center gap-2 rounded-2xl glass px-3 py-2 text-left transition active:scale-[0.98]"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: activeWallet?.tone || 'var(--accent)' }}
      >
        <Wallet size={14} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold leading-tight">
          {activeWallet?.name || 'Chưa có ví'}
        </span>
        <span className="block truncate font-mono text-[10px] text-[color:var(--muted)]">
          {shortAddress(activeWallet?.address || '', 4)}
        </span>
      </span>
      <ChevronDown size={15} className="shrink-0 text-[color:var(--muted)]" />
      {wallets.length > 1 && (
        <span className="ml-0.5 shrink-0 rounded-full bg-[color:var(--surface-strong)] px-1.5 py-0.5 text-[9.5px] font-semibold text-[color:var(--muted)]">
          {wallets.length}
        </span>
      )}
    </button>
  )
}

export default function WalletSwitcher({ open, onClose }: Props) {
  const {
    wallets,
    activeWallet,
    setActiveWallet,
    createWallet,
    renameWallet,
    removeWallet,
    pushToast,
    balance,
    prefs,
  } = useWallet()
  const [mode, setMode] = useState<'list' | 'create' | 'import' | 'rename'>('list')
  const [name, setName] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setMode('list')
      setName('')
      setSecret('')
      setTarget(null)
    }
  }, [open])

  if (!open) return null

  const handleCreate = async () => {
    setBusy(true)
    try {
      const wallet = await createWallet(undefined, name.trim() || `Ví ${wallets.length + 1}`)
      pushToast({ tone: 'success', title: 'Đã tạo ví mới', body: wallet.address })
      onClose()
    } catch (error: any) {
      pushToast({ tone: 'error', title: 'Không tạo được ví', body: error?.message })
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async () => {
    setBusy(true)
    try {
      await createWallet(secret, name.trim() || `Ví ${wallets.length + 1}`)
      pushToast({ tone: 'success', title: 'Đã nhập ví' })
      onClose()
    } catch (error: any) {
      pushToast({ tone: 'error', title: 'Không nhập được ví', body: error?.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 modal-overlay-blur" onClick={onClose} aria-hidden />
      <div
        className="relative z-10 max-h-[86vh] w-full max-w-md overflow-y-auto rounded-t-[28px] glass-strong p-5 shadow-card sm:rounded-[28px]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 1.25rem)' }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/25 sm:hidden" />

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">
            {mode === 'list' ? 'Ví của bạn' : mode === 'create' ? 'Tạo ví mới' : mode === 'import' ? 'Nhập ví' : 'Đổi tên ví'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-xl p-1.5 text-[color:var(--muted)] transition hover:bg-white/10"
          >
            <X size={17} />
          </button>
        </div>

        {mode === 'list' && (
          <>
            <div className="space-y-2">
              {wallets.map((wallet) => {
                const isActive = wallet.id === activeWallet?.id
                return (
                  <div
                    key={wallet.id}
                    className={[
                      'flex items-center gap-3 rounded-2xl border p-3 transition',
                      isActive
                        ? 'border-transparent bg-[color:var(--surface-strong)]'
                        : 'border-[color:var(--border)]',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      onClick={async () => {
                        await setActiveWallet(wallet.id)
                        onClose()
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                        style={{ background: wallet.tone }}
                      >
                        <Wallet size={16} />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13.5px] font-semibold">{wallet.name}</span>
                          {isActive && (
                            <span className="rounded-full accent-gradient px-1.5 py-[1px] text-[9px] font-bold uppercase text-white">
                              đang dùng
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-[color:var(--muted)]">
                          {shortAddress(wallet.address, 6)}
                          {isActive && !prefs.hideBalances && (
                            <span className="ml-1.5 font-sans font-semibold text-[color:var(--text)]">
                              · {balance.usdc.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC
                            </span>
                          )}
                        </span>
                      </span>
                    </button>

                    <button
                      type="button"
                      title="Sao chép địa chỉ"
                      onClick={async () => {
                        await copyToClipboard(wallet.address)
                        pushToast({ tone: 'info', title: 'Đã sao chép địa chỉ' })
                      }}
                      className="rounded-xl p-2 text-[color:var(--muted)] transition hover:bg-white/10"
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      title="Đổi tên"
                      onClick={() => {
                        setTarget(wallet.id)
                        setName(wallet.name)
                        setMode('rename')
                      }}
                      className="rounded-xl p-2 text-[color:var(--muted)] transition hover:bg-white/10"
                    >
                      <RefreshCw size={15} />
                    </button>
                    {wallets.length > 1 && (
                      <button
                        type="button"
                        title="Xoá ví"
                        onClick={async () => {
                          try {
                            await removeWallet(wallet.id)
                            pushToast({ tone: 'info', title: 'Đã xoá ví khỏi thiết bị' })
                          } catch (error: any) {
                            pushToast({ tone: 'error', title: 'Không xoá được', body: error?.message })
                          }
                        }}
                        className="rounded-xl p-2 text-[#ff6b81] transition hover:bg-white/10"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={wallets.length >= MAX_WALLETS}
                onClick={() => setMode('create')}
                className="flex items-center justify-center gap-2 rounded-2xl accent-gradient px-4 py-3 text-[13px] font-semibold text-white shadow-glow disabled:opacity-40"
              >
                <Plus size={16} /> Tạo ví mới
              </button>
              <button
                type="button"
                disabled={wallets.length >= MAX_WALLETS}
                onClick={() => setMode('import')}
                className="flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--border)] px-4 py-3 text-[13px] font-semibold disabled:opacity-40"
              >
                <Wallet size={16} /> Nhập ví
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--muted)]">
              {wallets.length >= MAX_WALLETS
                ? `Đã đạt giới hạn ${MAX_WALLETS} ví cho thiết bị này. Xoá bớt ví để tạo mới.`
                : `Chuyển đổi giữa các ví tức thì — mỗi ví có địa chỉ, lịch sử và số dư riêng. (${wallets.length}/${MAX_WALLETS})`}
            </p>
          </>
        )}

        {mode === 'create' && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-semibold text-[color:var(--muted)]">Tên ví</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={`Ví ${wallets.length + 1}`}
                className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-[14px] outline-none focus:border-[color:var(--accent)]"
              />
            </label>
            <p className="text-[11.5px] leading-relaxed text-[color:var(--muted)]">
              Khoá bí mật mới được sinh ngay trên thiết bị này và mã hoá trong két an toàn.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={handleCreate}
              className="w-full rounded-2xl accent-gradient py-3.5 text-[14px] font-semibold text-white shadow-glow disabled:opacity-60"
            >
              {busy ? 'Đang tạo…' : 'Tạo ví'}
            </button>
          </div>
        )}

        {mode === 'import' && (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-semibold text-[color:var(--muted)]">Tên ví</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={`Ví ${wallets.length + 1}`}
                className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-[14px] outline-none focus:border-[color:var(--accent)]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-semibold text-[color:var(--muted)]">
                Khoá bí mật (JSON nhị phân · base58 · private key · passphrase)
              </span>
              <textarea
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                rows={4}
                placeholder="[12,34,…]  hoặc  4Zk…  hoặc  twelve word recovery phrase"
                className="w-full resize-none rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 font-mono text-[12.5px] outline-none focus:border-[color:var(--accent)]"
              />
            </label>
            <button
              type="button"
              disabled={busy || !secret.trim()}
              onClick={handleImport}
              className="w-full rounded-2xl accent-gradient py-3.5 text-[14px] font-semibold text-white shadow-glow disabled:opacity-50"
            >
              {busy ? 'Đang nhập…' : 'Nhập ví'}
            </button>
          </div>
        )}

        {mode === 'rename' && (
          <div className="space-y-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-[14px] outline-none focus:border-[color:var(--accent)]"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('list')}
                className="rounded-2xl border border-[color:var(--border)] py-3 text-[13px] font-semibold"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (target) await renameWallet(target, name)
                  setMode('list')
                }}
                className="rounded-2xl accent-gradient py-3 text-[13px] font-semibold text-white"
              >
                Lưu
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
