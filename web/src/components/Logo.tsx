import React from 'react'

type Props = {
  size?: number
  withRing?: boolean
  className?: string
}

/** Cloud Pay mark — a cloud inside its orbit. Scales from 16px to billboard. */
export default function Logo({ size = 40, withRing = true, className }: Props) {
  const id = React.useId().replace(/:/g, '')
  const grad = `cp-grad-${id}`
  const bg = `cp-bg-${id}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role="img"
      aria-label="Cloud Pay Wallet"
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
        <radialGradient id={bg} cx="26%" cy="16%" r="96%">
          <stop offset="0" stopColor="#1b1f42" />
          <stop offset="1" stopColor="#05060f" />
        </radialGradient>
      </defs>

      <rect width="512" height="512" rx="116" fill={`url(#${bg})`} />
      <circle cx="256" cy="256" r="168" fill={`url(#${grad})`} opacity="0.16" />

      <g fill="#ffffff">
        <circle cx="198" cy="252" r="60" />
        <circle cx="248" cy="208" r="56" />
        <circle cx="308" cy="242" r="68" />
        <rect x="140" y="248" width="228" height="64" rx="32" />
      </g>

      {withRing && (
        <g transform="rotate(-18 256 262)">
          <ellipse
            cx="256"
            cy="262"
            rx="182"
            ry="70"
            fill="none"
            stroke={`url(#${grad})`}
            strokeWidth="26"
            strokeLinecap="round"
          />
        </g>
      )}

      <circle cx="120" cy="150" r="9" fill="#ffffff" opacity="0.8" />
      <circle cx="404" cy="118" r="6" fill="#ffffff" opacity="0.55" />
      <circle cx="392" cy="372" r="7" fill="#ffffff" opacity="0.45" />
    </svg>
  )
}

export function LogoWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={compact ? 32 : 38} />
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight">
          Cloud <span className="accent-text">Pay</span>
        </div>
        <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[color:var(--muted)]">
          Cloud Chain
        </div>
      </div>
    </div>
  )
}
