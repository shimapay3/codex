import { useState } from 'react'
import ReceivePanel from '../components/ReceivePanel'
import { ENABLED_COINS, getCoin, type CoinId } from '../lib/coins'

export default function ReceivePage() {
  const [coinId, setCoinId] = useState<CoinId>('usdc')
  const coin = getCoin(coinId)
  const receiveableCoins = ENABLED_COINS.filter((c) => c.id === 'usdc' || c.id === 'xsa')

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] font-semibold tracking-tight">Nhận {coin.symbol}</h1>
        <p className="mt-0.5 text-[12px] text-[color:var(--muted)]">
          Quét QR hoặc chia sẻ địa chỉ ví của bạn
        </p>
      </header>

      {receiveableCoins.length > 1 && (
        <div className="flex gap-2 rounded-2xl glass p-1.5">
          {receiveableCoins.map((c) => (
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

      <ReceivePanel coin={coin} />
    </div>
  )
}
