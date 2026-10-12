import { useMemo, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw, Search } from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import { EXPLORER_BASE, EXPLORER_CUSTOM_URL, explorerAddressUrl, explorerTxUrl } from '../lib/solana'
import { isValidAddress } from '../lib/crypto'
import { shortAddress } from '../lib/crypto'

type Props = { initialQuery?: string }

/**
 * Built-in transaction checker. The Solana explorer is embedded with the Cloud
 * Chain endpoint pre-filled; the address bar value is never shown to the user,
 * only the explorer surface itself.
 */
export default function ExplorerFrame({ initialQuery = '' }: Props) {
  const { prefs, activeWallet, history } = useWallet()
  const [query, setQuery] = useState(initialQuery)
  const [nonce, setNonce] = useState(0)
  const [loading, setLoading] = useState(true)

  const rpcUrl = prefs.rpcUrl

  const target = useMemo(() => {
    const value = query.trim()
    if (value.length > 60) return explorerTxUrl(value, rpcUrl)
    if (isValidAddress(value)) return explorerAddressUrl(value, rpcUrl)
    if (activeWallet?.address) return explorerAddressUrl(activeWallet.address, rpcUrl)
    return `${EXPLORER_BASE}/?cluster=custom&customUrl=${encodeURIComponent(EXPLORER_CUSTOM_URL)}`
  }, [query, rpcUrl, activeWallet?.address])

  return (
    <div className="space-y-3">
      <div className="rounded-[24px] glass p-4">
        <p className="mb-2 text-[12px] font-semibold text-[color:var(--muted)]">
          Kiểm tra giao dịch trên Cloud Chain
        </p>
        <div className="flex items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3">
          <Search size={15} className="shrink-0 text-[color:var(--muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Dán chữ ký giao dịch hoặc địa chỉ ví"
            spellCheck={false}
            className="w-full bg-transparent py-3 font-mono text-[12px] outline-none"
          />
        </div>

        {history.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
            {history.slice(0, 6).map((entry) => (
              <button
                key={entry.signature}
                type="button"
                onClick={() => {
                  setQuery(entry.signature)
                  setLoading(true)
                  setNonce((value) => value + 1)
                }}
                className={[
                  'shrink-0 rounded-xl border px-3 py-1.5 font-mono text-[10.5px] transition',
                  query === entry.signature
                    ? 'border-transparent accent-gradient text-white'
                    : 'border-[color:var(--border)] text-[color:var(--muted)]',
                ].join(' ')}
              >
                {shortAddress(entry.signature, 5)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[24px] glass-strong shadow-card">
        <div className="flex items-center gap-2 border-b border-[color:var(--border)] px-3.5 py-2.5">
          <span className="flex h-2 w-2 rounded-full bg-[#22e07a]" />
          <span className="text-[11.5px] font-semibold">Explorer · Solana Custom RPC</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Tải lại"
              onClick={() => {
                setLoading(true)
                setNonce((value) => value + 1)
              }}
              className="rounded-xl p-1.5 text-[color:var(--muted)] transition hover:bg-white/10"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <a
              href={target}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-xl border border-[color:var(--border)] px-2.5 py-1.5 text-[10.5px] font-semibold"
            >
              <ExternalLink size={12} /> Mở tab
            </a>
          </div>
        </div>

        <div className="relative h-[58vh] min-h-[340px] bg-black/20">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[color:var(--bg)]/70">
              <Loader2 size={22} className="animate-spin accent-text" />
              <p className="text-[11.5px] text-[color:var(--muted)]">Đang tải explorer…</p>
            </div>
          )}
          <iframe
            key={`${target}-${nonce}`}
            src={target}
            title="Solana Explorer"
            onLoad={() => setLoading(false)}
            className="h-full w-full border-0"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
      </div>

      <p className="px-1 text-[10.5px] leading-relaxed text-[color:var(--muted)]">
        Explorer dùng trực tiếp RPC Cloud Chain đã cấu hình. Nếu nhà cung cấp chặn nhúng, hãy dùng nút
        “Mở tab”.
      </p>
    </div>
  )
}
