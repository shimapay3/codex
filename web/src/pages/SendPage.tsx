import { useState } from 'react'
import SendForm from '../components/SendForm'
import SolSendForm from '../components/SolSendForm'
import UsdcAvatar from '../components/UsdcAvatar'
import { SOL_ICON } from '../lib/solana'

export default function SendPage() {
  const [token, setToken] = useState<'usdc' | 'sol'>('usdc')

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] font-semibold tracking-tight">
          Gửi {token === 'usdc' ? 'USDC' : 'SOL'}
        </h1>
        <p className="mt-0.5 text-[12px] text-[color:var(--muted)]">
          {token === 'usdc'
            ? 'Ký bằng Passkey · MEMO nổi bật · xác nhận tức thì'
            : 'Chuyển SOL · ghi chú MEMO · xác nhận tức thì'}
        </p>
      </header>

      {/* Token toggle */}
      <div className="flex gap-2 rounded-2xl glass p-1.5">
        <button
          type="button"
          onClick={() => setToken('usdc')}
          className={[
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition',
            token === 'usdc' ? 'accent-gradient text-white shadow-glow' : 'text-[color:var(--muted)]',
          ].join(' ')}
        >
          <UsdcAvatar size={18} /> USDC
        </button>
        <button
          type="button"
          onClick={() => setToken('sol')}
          className={[
            'flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition',
            token === 'sol' ? 'accent-gradient text-white shadow-glow' : 'text-[color:var(--muted)]',
          ].join(' ')}
        >
          <img src={SOL_ICON} alt="SOL" className="h-[18px] w-[18px] rounded-full" loading="lazy" />
          SOL
        </button>
      </div>

      {token === 'usdc' ? <SendForm /> : <SolSendForm />}
    </div>
  )
}
