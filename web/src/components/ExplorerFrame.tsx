import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import {
  EXPLORER_BASE,
  EXPLORER_CUSTOM_URL,
  explorerAddressUrl,
  explorerTxUrl,
  rpcFetch,
  getSolBalance,
  getUsdcBalance,
  formatAmount,
  formatSolBalance,
  USDC_MINT,
} from '../lib/solana'
import { isValidAddress, shortAddress } from '../lib/crypto'

type Props = { initialQuery?: string }

type AddressResult = {
  type: 'address'
  address: string
  sol: number
  usdc: number
  usdcDecimals: number
}

type TxResult = {
  type: 'tx'
  signature: string
  slot: number
  blockTime: number | null
  fee: number
  status: 'success' | 'failed'
  memo: string
  tokenTransfers: Array<{
    amount: number
    decimals: number
    from: string
    to: string
    mint: string
  }>
  solTransfers: Array<{
    amount: number
    from: string
    to: string
  }>
}

type Result = AddressResult | TxResult | null

function extractMemo(tx: any): string {
  const lists = [
    tx?.transaction?.message?.instructions || [],
    ...(tx?.meta?.innerInstructions || []).map((inner: any) => inner?.instructions || []),
  ]
  for (const list of lists) {
    for (const instruction of list) {
      const program = instruction?.program || instruction?.programId
      if (program === 'spl-memo' || program === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
        if (typeof instruction.parsed === 'string') return instruction.parsed.trim()
      }
    }
  }
  return ''
}

async function lookupAddress(rpcUrl: string, address: string): Promise<AddressResult> {
  const [sol, usdc] = await Promise.all([
    getSolBalance(rpcUrl, address),
    getUsdcBalance(rpcUrl, address),
  ])
  return {
    type: 'address',
    address,
    sol,
    usdc: usdc.amount,
    usdcDecimals: usdc.decimals,
  }
}

async function lookupTx(rpcUrl: string, signature: string): Promise<TxResult> {
  const tx = await rpcFetch<any>(
    rpcUrl,
    'getTransaction',
    [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
    20000,
  )
  if (!tx) throw new Error('Không tìm thấy giao dịch')

  const tokenTransfers: TxResult['tokenTransfers'] = []
  const preBalances = tx?.meta?.preTokenBalances || []
  const postBalances = tx?.meta?.postTokenBalances || []

  for (const post of postBalances) {
    const pre = preBalances.find(
      (b: any) => b.accountIndex === post.accountIndex && b.mint === post.mint,
    )
    const preAmt = pre ? Number(pre.uiTokenAmount?.amount || 0) : 0
    const postAmt = Number(post.uiTokenAmount?.amount || 0)
    const delta = postAmt - preAmt
    if (delta === 0) continue
    const preOwner = pre?.owner
    const postOwner = post.owner
    const from = delta < 0 ? postOwner : preOwner || postOwner
    const to = delta > 0 ? postOwner : preOwner || postOwner
    tokenTransfers.push({
      amount: Math.abs(delta) / 10 ** (post.uiTokenAmount?.decimals || 6),
      decimals: post.uiTokenAmount?.decimals || 6,
      from: from || '',
      to: to || '',
      mint: post.mint,
    })
  }

  const solTransfers: TxResult['solTransfers'] = []
  const instructions = tx?.transaction?.message?.instructions || []
  for (const ix of instructions) {
    if (ix?.program === 'system' && ix?.parsed?.type === 'transfer') {
      solTransfers.push({
        amount: Number(ix.parsed.info.lamports) / 1_000_000_000,
        from: ix.parsed.info.source,
        to: ix.parsed.info.destination,
      })
    }
  }

  return {
    type: 'tx',
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    fee: (tx?.meta?.fee || 0) / 1_000_000_000,
    status: tx?.meta?.err ? 'failed' : 'success',
    memo: extractMemo(tx),
    tokenTransfers,
    solTransfers,
  }
}

function formatTime(blockTime: number | null): string {
  if (!blockTime) return '—'
  return new Date(blockTime * 1000).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ExplorerFrame({ initialQuery = '' }: Props) {
  const { prefs, activeWallet, history } = useWallet()
  const [query, setQuery] = useState(initialQuery)
  const [result, setResult] = useState<Result>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rpcUrl = prefs.rpcUrl

  const target = useMemo(() => {
    const value = query.trim()
    if (value.length > 60) return explorerTxUrl(value, rpcUrl)
    if (isValidAddress(value)) return explorerAddressUrl(value, rpcUrl)
    if (activeWallet?.address) return explorerAddressUrl(activeWallet.address, rpcUrl)
    return `${EXPLORER_BASE}/?cluster=custom&customUrl=${encodeURIComponent(EXPLORER_CUSTOM_URL)}`
  }, [query, rpcUrl, activeWallet?.address])

  const doLookup = useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      if (!trimmed) {
        setResult(null)
        setError(null)
        return
      }
      setLoading(true)
      setError(null)
      try {
        if (trimmed.length > 60) {
          const r = await lookupTx(rpcUrl, trimmed)
          setResult(r)
        } else if (isValidAddress(trimmed)) {
          const r = await lookupAddress(rpcUrl, trimmed)
          setResult(r)
        } else {
          setError('Chữ ký giao dịch hoặc địa chỉ ví không hợp lệ')
          setResult(null)
        }
      } catch (err: any) {
        setError(err?.message || 'Không tải được dữ liệu')
        setResult(null)
      } finally {
        setLoading(false)
      }
    },
    [rpcUrl],
  )

  // Auto-lookup when query changes (debounced)
  useEffect(() => {
    const value = query.trim()
    if (!value) {
      setResult(null)
      setError(null)
      return
    }
    const timer = setTimeout(() => doLookup(value), 500)
    return () => clearTimeout(timer)
  }, [query, doLookup])

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
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setResult(null)
                setError(null)
              }}
              className="shrink-0 rounded-lg p-1 text-[color:var(--muted)] transition hover:bg-white/10"
            >
              <XCircle size={15} />
            </button>
          )}
        </div>

        {history.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
            {history.slice(0, 6).map((entry) => (
              <button
                key={entry.signature}
                type="button"
                onClick={() => setQuery(entry.signature)}
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
          <span className="text-[11.5px] font-semibold">Explorer · Cloud Chain RPC</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Tải lại"
              onClick={() => doLookup(query)}
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

        <div className="min-h-[340px] bg-black/20 p-4">
          {loading ? (
            <div className="flex h-[280px] flex-col items-center justify-center gap-2">
              <Loader2 size={22} className="animate-spin accent-text" />
              <p className="text-[11.5px] text-[color:var(--muted)]">Đang truy vấn RPC…</p>
            </div>
          ) : error ? (
            <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
              <XCircle size={28} className="text-[#ff4d6d]" />
              <p className="text-[12px] font-semibold text-[#ff4d6d]">{error}</p>
              <p className="text-[10.5px] text-[color:var(--muted)]">
                Thử lại hoặc dùng nút "Mở tab" để xem trên explorer đầy đủ
              </p>
            </div>
          ) : !query.trim() ? (
            <div className="flex h-[280px] flex-col items-center justify-center gap-2 text-center">
              <Search size={28} className="text-[color:var(--muted)] opacity-50" />
              <p className="text-[12px] text-[color:var(--muted)]">
                Dán địa chỉ ví hoặc chữ ký giao dịch để tra cứu
              </p>
              {activeWallet?.address && (
                <button
                  type="button"
                  onClick={() => setQuery(activeWallet.address)}
                  className="mt-1 rounded-xl border border-[color:var(--border)] px-3 py-1.5 text-[10.5px] font-semibold text-[color:var(--accent)] transition hover:bg-white/10"
                >
                  Tra cứu ví hiện tại
                </button>
              )}
            </div>
          ) : result?.type === 'address' ? (
            <AddressView result={result} />
          ) : result?.type === 'tx' ? (
            <TxView result={result} />
          ) : null}
        </div>
      </div>

      <p className="px-1 text-[10.5px] leading-relaxed text-[color:var(--muted)]">
        Tra cứu trực tiếp qua RPC Cloud Chain — không qua iframe, tránh lỗi giới hạn yêu cầu. Muốn xem
        đầy đủ, bấm "Mở tab".
      </p>
    </div>
  )
}

function AddressView({ result }: { result: AddressResult }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
          Địa chỉ ví
        </p>
        <p className="mt-1 break-all font-mono text-[12px]">{result.address}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[color:var(--surface)] p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
            Số dư SOL
          </p>
          <p className="mt-1 text-[18px] font-bold tabular-nums">
            {result.sol.toFixed(6)} <span className="text-[12px] text-[color:var(--muted)]">SOL</span>
          </p>
        </div>
        <div className="rounded-2xl bg-[color:var(--surface)] p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
            Số dư USDC
          </p>
          <p className="mt-1 text-[18px] font-bold tabular-nums accent-text">
            {formatAmount(result.usdc, 2)} <span className="text-[12px] text-[color:var(--muted)]">USDC</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function TxView({ result }: { result: TxResult }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {result.status === 'success' ? (
          <CheckCircle2 size={18} className="text-[#22e07a]" />
        ) : (
          <XCircle size={18} className="text-[#ff4d6d]" />
        )}
        <span
          className="text-[13px] font-semibold"
          style={{ color: result.status === 'success' ? '#22e07a' : '#ff4d6d' }}
        >
          {result.status === 'success' ? 'Thành công' : 'Thất bại'}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[10.5px] text-[color:var(--muted)]">
          <Clock size={11} /> {formatTime(result.blockTime)}
        </span>
      </div>

      <div className="rounded-2xl bg-[color:var(--surface)] p-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
          Chữ ký giao dịch
        </p>
        <p className="mt-1 break-all font-mono text-[11px]">{result.signature}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[color:var(--surface)] p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
            Slot
          </p>
          <p className="mt-1 font-mono text-[12px]">{result.slot.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl bg-[color:var(--surface)] p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
            Phí giao dịch
          </p>
          <p className="mt-1 text-[12px] tabular-nums">{result.fee.toFixed(9)} SOL</p>
        </div>
      </div>

      {result.tokenTransfers.length > 0 && (
        <div>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
            Chuyển token
          </p>
          <div className="space-y-2">
            {result.tokenTransfers.map((transfer, i) => {
              const isUsdc = transfer.mint === USDC_MINT
              return (
                <div key={i} className="rounded-2xl bg-[color:var(--surface)] p-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-full"
                      style={{
                        background: isUsdc ? 'rgba(34,224,122,.16)' : 'rgba(99,102,241,.16)',
                      }}
                    >
                      <ArrowUpRight size={14} className={isUsdc ? 'text-[#22e07a]' : 'text-[#6366f1]'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold tabular-nums">
                        {formatAmount(transfer.amount, transfer.decimals)}{' '}
                        <span className="text-[11px] text-[color:var(--muted)]">
                          {isUsdc ? 'USDC' : shortAddress(transfer.mint, 4)}
                        </span>
                      </p>
                      <p className="font-mono text-[10px] text-[color:var(--muted)]">
                        {shortAddress(transfer.from, 4)} → {shortAddress(transfer.to, 4)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {result.solTransfers.length > 0 && (
        <div>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
            Chuyển SOL
          </p>
          <div className="space-y-2">
            {result.solTransfers.map((transfer, i) => (
              <div key={i} className="rounded-2xl bg-[color:var(--surface)] p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(255,176,32,.16)]">
                    <ArrowDownLeft size={14} className="text-[#ffb020]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold tabular-nums">
                      {transfer.amount.toFixed(6)} SOL
                    </p>
                    <p className="font-mono text-[10px] text-[color:var(--muted)]">
                      {shortAddress(transfer.from, 4)} → {shortAddress(transfer.to, 4)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.memo && (
        <div className="rounded-2xl bg-[color:var(--surface)] p-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
            Ghi chú (MEMO)
          </p>
          <p className="mt-1 text-[12px]">{result.memo}</p>
        </div>
      )}

      {result.tokenTransfers.length === 0 && result.solTransfers.length === 0 && (
        <p className="text-center text-[11.5px] text-[color:var(--muted)]">
          Không có chuyển token hoặc SOL trong giao dịch này
        </p>
      )}
    </div>
  )
}
