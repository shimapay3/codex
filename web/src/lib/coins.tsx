import { BadgeCheck } from 'lucide-react'
import UsdcAvatar from '../components/UsdcAvatar'
import { SOL_ICON, XSA_MINT } from './solana'

/**
 * Coin registry — a single source of truth for every supported token.
 * Adding a new coin only requires adding an entry here; the Send page,
 * Home assets list, and send form all read from this list.
 *
 * `hasUsdValue` — whether the coin shows USD/VND conversion.
 * SOL and STAR are gas/utility tokens with no fixed USD value.
 */
export type CoinId = 'usdc' | 'xsa' | 'sol' | 'star'

export type CoinConfig = {
  id: CoinId
  name: string
  symbol: string
  /** React node for the icon/avatar shown in toggles and lists. */
  icon: React.ReactNode
  /** Small icon for compact rows. */
  iconSm: React.ReactNode
  /** Whether this coin has a USD value (for price conversion display). */
  hasUsdValue: boolean
  /** Short description shown under the symbol in the assets list. */
  tagline: string
  /** Quick-amount buttons in the send form. */
  quickAmounts: number[]
  /** Number of decimals for display. */
  decimals: number
  /** Whether the memo/category builder is shown. */
  hasMemo: boolean
  /** Whether this coin is currently enabled (future coins can be hidden). */
  enabled: boolean
}

export const COINS: CoinConfig[] = [
  {
    id: 'usdc',
    name: 'USD Coin',
    symbol: 'USDC',
    icon: <UsdcAvatar size={40} />,
    iconSm: <UsdcAvatar size={18} />,
    hasUsdValue: true,
    tagline: 'Stablecoin · 1 USDC ≈ 1 USD',
    quickAmounts: [1, 5, 10, 25, 50],
    decimals: 6,
    hasMemo: true,
    enabled: true,
  },
  {
    id: 'xsa',
    name: 'XSA Token',
    symbol: 'XSA',
    icon: (
      <span className="relative inline-flex shrink-0" style={{ width: 40, height: 40 }}>
        <span className="flex h-full w-full items-center justify-center rounded-full bg-[#6C5CE7]/20 text-[16px] font-bold text-[#a29bfe]">X</span>
        <BadgeCheck
          size={17}
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[color:var(--bg)] text-[#1d9bf0]"
          strokeWidth={2.6}
          aria-label="Token đã xác minh"
        />
      </span>
    ),
    iconSm: (
      <span className="relative inline-flex shrink-0" style={{ width: 18, height: 18 }}>
        <span className="flex h-full w-full items-center justify-center rounded-full bg-[#6C5CE7]/20 text-[10px] font-bold text-[#a29bfe]">X</span>
        <BadgeCheck
          size={9}
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[color:var(--bg)] text-[#1d9bf0]"
          strokeWidth={2.6}
        />
      </span>
    ),
    hasUsdValue: true,
    tagline: 'Token Cloud Chain · giá động',
    quickAmounts: [1, 5, 10, 50, 100],
    decimals: 6,
    hasMemo: true,
    enabled: true,
  },
  {
    id: 'sol',
    name: 'Solana',
    symbol: 'SOL',
    icon: <img src={SOL_ICON} alt="SOL" className="h-10 w-10 rounded-full ring-2 ring-white/15" loading="lazy" />,
    iconSm: <img src={SOL_ICON} alt="SOL" className="h-[18px] w-[18px] rounded-full" loading="lazy" />,
    hasUsdValue: false,
    tagline: 'Phí gas · không có giá trị USD',
    quickAmounts: [0.01, 0.05, 0.1, 0.5, 1],
    decimals: 9,
    hasMemo: true,
    enabled: true,
  },
  {
    id: 'star',
    name: 'Star Token',
    symbol: 'STAR',
    icon: <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffb020]/20 text-[18px]">⭐</span>,
    iconSm: <span className="flex h-[18px] w-[18px] items-center justify-center text-[12px]">⭐</span>,
    hasUsdValue: false,
    tagline: 'Token tiện ích · không có giá trị USD',
    quickAmounts: [1, 5, 10, 50, 100],
    decimals: 6,
    hasMemo: true,
    enabled: false,
  },
]

export function getCoin(id: CoinId): CoinConfig {
  return COINS.find((c) => c.id === id) || COINS[0]
}

export const ENABLED_COINS = COINS.filter((c) => c.enabled)
