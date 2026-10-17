import { useState } from 'react'
import UnifiedSendForm from '../components/UnifiedSendForm'
import { ENABLED_COINS, getCoin, type CoinId } from '../lib/coins'

export default function SendPage() {
  const [coinId, setCoinId] = useState<CoinId>('usdc')
  const coin = getCoin(coinId)

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] font-semibold tracking-tight">
          Gửi {coin.symbol}
        </h1>
        <p className="mt-0.5 text-[12px] text-[color:var(--muted)]">
          {coin.id === 'usdc' || coin.id === 'xsa'
            ? 'Ký bằng Passkey · MEMO nổi bật · xác nhận tức thì'
            : `Chuyển ${coin.symbol} · ghi chú MEMO · xác nhận tức thì`}
        </p>
      </header>

      {/* Token toggle — data-driven from coin registry */}
      {ENABLED_COINS.length > 1 && (
        <div className="flex gap-2 rounded-2xl glass p-1.5">
          {ENABLED_COINS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCoinId(c.id)}
              className={[
                'flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition',
                coinId === c.id ? 'accent-gradient text-white shadow-glow' : 'text-[color:var(--muted)]',
              ].join(' ')}
            >
              {c.iconSm} {c.symbol}
            </button>
          ))}
        </div>
      )}

      <UnifiedSendForm coin={coin} />
    </div>
  )
}
