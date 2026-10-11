import { BadgeCheck } from 'lucide-react'
import { USDC_AVATAR, USDC_NAME, USDC_SYMBOL } from '../lib/solana'

type Props = { size?: number; showTick?: boolean; className?: string }

/** Cloud Chain USDC — the single supported token, always shown with its tick. */
export default function UsdcAvatar({ size = 40, showTick = true, className }: Props) {
  return (
    <span className={`relative inline-flex shrink-0 ${className || ''}`} style={{ width: size, height: size }}>
      <img
        src={USDC_AVATAR}
        alt={USDC_NAME}
        width={size}
        height={size}
        loading="lazy"
        className="h-full w-full rounded-full object-cover ring-2 ring-white/15"
        onError={(event) => {
          const target = event.currentTarget
          target.style.visibility = 'hidden'
        }}
      />
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center rounded-full text-[10px] font-bold"
        style={{
          background: 'linear-gradient(135deg, #2775ca, #67b4ff)',
          zIndex: -1,
        }}
      >
        U
      </span>
      {showTick && (
        <BadgeCheck
          size={Math.max(13, Math.round(size * 0.42))}
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-[color:var(--bg)] text-[#1d9bf0]"
          strokeWidth={2.6}
          aria-label="Token đã xác minh"
        />
      )}
    </span>
  )
}

export function UsdcLabel({ tick = true }: { tick?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
      {USDC_SYMBOL}
      {tick && <BadgeCheck size={12} className="text-[#1d9bf0]" />}
    </span>
  )
}
