import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowUpRight,
  ChevronRight,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import { TxEntry, formatAmount, formatSolBalance, SOL_ICON } from '../lib/solana'
import { formatUsd, formatVnd } from '../lib/format'
import { shortAddress } from '../lib/crypto'
import UsdcAvatar from '../components/UsdcAvatar'
import BalanceChart from '../components/BalanceChart'
import TxList, { TxDetail } from '../components/TxList'
import { USDC_MINT } from '../lib/solana'
import {
  getTelegramDisplayName,
  getTelegramUsername,
  getTelegramUserIdString,
  getTelegramPhotoUrl,
  TELEGRAM_LOGO,
} from '../lib/telegram'
import { copyToClipboard } from '../lib/format'

export default function HomePage() {
  const {
    balance,
    price,
    history,
    historyLoading,
    prefs,
    setPrefs,
    refresh,
    activeWallet,
    realtimeConnected,
    airdrop,
  } = useWallet()
  const [selected, setSelected] = useState<TxEntry | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [tgCopied, setTgCopied] = useState(false)
  const navigate = useNavigate()

  const hidden = prefs.hideBalances
  const tgName = getTelegramDisplayName()
  const tgUsername = getTelegramUsername()
  const tgId = getTelegramUserIdString()
  const tgPhoto = getTelegramPhotoUrl()

  const handleRefresh = async () => {
    setRefreshing(true)
    await refresh()
    setTimeout(() => setRefreshing(false), 700)
  }

  return (
    <div className="space-y-4">
      {/* Balance hero */}
      <div className="relative overflow-hidden rounded-[30px] glass-strong p-5 shadow-card">
        <div
          aria-hidden
          className="absolute -right-20 -top-24 h-56 w-56 rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
        />
        <div
          aria-hidden
          className="absolute -bottom-24 -left-16 h-48 w-48 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--accent-2), transparent 70%)' }}
        />

        <div className="relative flex items-center justify-between">
          <span className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
            <UsdcAvatar size={22} /> Tổng số dư USDC
          </span>
          {/* Telegram identity chip */}
          <button
            type="button"
            onClick={async () => {
              if (tgId) {
                await copyToClipboard(tgId)
                setTgCopied(true)
                setTimeout(() => setTgCopied(false), 1600)
              }
            }}
            className="flex items-center gap-1.5 rounded-full bg-[color:var(--surface)] px-2.5 py-1 text-[10.5px] font-semibold"
          >
            <img
              src={tgPhoto || TELEGRAM_LOGO}
              alt="TG"
              className="h-4 w-4 rounded-full"
              onError={(e) => { ;(e.target as HTMLImageElement).src = TELEGRAM_LOGO }}
            />
            <span className="max-w-[80px] truncate">{tgName}</span>
            {tgId && (
              <span className="text-[color:var(--muted)]">
                {tgCopied ? '✓' : `#${tgId.slice(-4)}`}
              </span>
            )}
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={hidden ? 'Hiện số dư' : 'Ẩn số dư'}
              onClick={() => setPrefs({ hideBalances: !hidden })}
              className="rounded-xl p-1.5 text-[color:var(--muted)] transition hover:bg-white/10"
            >
              {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
            <button
              type="button"
              aria-label="Làm mới"
              onClick={handleRefresh}
              className="rounded-xl p-1.5 text-[color:var(--muted)] transition hover:bg-white/10"
            >
              <RefreshCw size={15} className={refreshing || balance.loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="relative mt-3">
          <p className="text-[40px] font-bold leading-none tabular-nums">
            {hidden ? '••••••' : formatAmount(balance.usdc, 2)}
            <span className="ml-2 text-[16px] font-semibold text-[color:var(--muted)]">USDC</span>
          </p>
          <p className="mt-2 text-[12.5px] text-[color:var(--muted)]">
            {hidden ? '≈ ••••' : `≈ ${formatUsd(balance.usdc * price.usd)} · ≈ ${formatVnd(balance.usdc * price.vnd)}`}
          </p>
        </div>

        <div className="relative mt-4 flex items-center gap-2 text-[10.5px]">
          <span className="flex items-center gap-1.5 rounded-full bg-[color:var(--surface)] px-2.5 py-1 font-semibold">
            {realtimeConnected ? (
              <>
                <Wifi size={11} className="text-[#22e07a]" /> Realtime đang bật
              </>
            ) : (
              <>
                <WifiOff size={11} className="text-[#ffb020]" /> Đang kết nối lại…
              </>
            )}
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-[color:var(--surface)] px-2.5 py-1 font-semibold">
            <img src={SOL_ICON} alt="SOL" className="h-3.5 w-3.5 rounded-full" loading="lazy" />
            {airdrop.status === 'pending' || airdrop.status === 'sending' ? (
              <span className="flex items-center gap-1 text-[#ffb020]">
                <Loader2 size={11} className="animate-spin" /> Đang chờ airdrop…
              </span>
            ) : hidden ? (
              '••••'
            ) : balance.sol < 0.001 ? (
              <span className="text-[#ffb020]">Thiếu SOL phí gas</span>
            ) : (
              <span className="tabular-nums">{balance.sol.toFixed(4)} SOL</span>
            )}
          </span>
        </div>

        <div className="relative mt-4 grid grid-cols-3 gap-2">
          <Link
            to="/send"
            className="flex flex-col items-center gap-1.5 rounded-2xl accent-gradient py-3 text-[12px] font-semibold text-white shadow-glow"
          >
            <ArrowUpRight size={17} /> Gửi
          </Link>
          <Link
            to="/receive"
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-[color:var(--border)] py-3 text-[12px] font-semibold"
          >
            <ArrowDownToLine size={17} /> Nhận
          </Link>
          <Link
            to="/explorer"
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-[color:var(--border)] py-3 text-[12px] font-semibold"
          >
            <ExternalLink size={17} /> Kiểm tra
          </Link>
        </div>
      </div>

      {/* Live chart */}
      <div className="rounded-[26px] glass p-4">
        <BalanceChart />
      </div>

      {/* Assets */}
      <div className="rounded-[26px] glass p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">Tài sản</h2>
          <span className="text-[10.5px] text-[color:var(--muted)]">2 tài sản</span>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => navigate('/receive')}
            className="flex w-full items-center gap-3 rounded-2xl bg-[color:var(--surface)] p-3 text-left transition hover:bg-[color:var(--surface-strong)] active:scale-[0.99]"
          >
            <UsdcAvatar size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">USD Coin</p>
              <p className="font-mono text-[10px] break-all text-[color:var(--muted)]">
                {shortAddress(USDC_MINT, 8)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[14px] font-semibold tabular-nums">
                {hidden ? '••••' : formatAmount(balance.usdc, 2)}
              </p>
              <p className="text-[10.5px] text-[color:var(--muted)]">
                {hidden ? '≈ ••••' : formatVnd(balance.usdc * price.vnd)}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => navigate('/send')}
            className="flex w-full items-center gap-3 rounded-2xl bg-[color:var(--surface)] p-3 text-left transition hover:bg-[color:var(--surface-strong)] active:scale-[0.99]"
          >
            <img
              src={SOL_ICON}
              alt="Solana"
              className="h-10 w-10 rounded-full ring-2 ring-white/15"
              loading="lazy"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">Solana</p>
              <p className="text-[10.5px] text-[color:var(--muted)]">
                {airdrop.status === 'pending' || airdrop.status === 'sending' ? (
                  <span className="flex items-center gap-1 text-[#ffb020]">
                    <Loader2 size={10} className="animate-spin" /> Đang chờ airdrop SOL
                  </span>
                ) : (
                  'Phí gas · không có giá trị USD'
                )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[14px] font-semibold tabular-nums">
                {hidden ? '••••' : formatSolBalance(balance.sol)}
              </p>
              <p className="text-[10.5px] text-[color:var(--muted)]">—</p>
            </div>
          </button>
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-[26px] glass p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">Hoạt động gần đây</h2>
          <Link
            to="/history"
            className="flex items-center gap-0.5 text-[11.5px] font-semibold text-[color:var(--accent)]"
          >
            Xem tất cả <ChevronRight size={13} />
          </Link>
        </div>
        <TxList
          entries={history}
          loading={historyLoading}
          limit={5}
          onSelect={setSelected}
          emptyHint={`Ví ${activeWallet?.name || ''} chưa có giao dịch USDC nào.`}
        />
      </div>

      <TxDetail entry={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
