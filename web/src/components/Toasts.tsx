import { AlertTriangle, ArrowDownLeft, CheckCircle2, Info, X } from 'lucide-react'
import { useWallet } from '../state/WalletProvider'

const TONE_STYLES: Record<string, { ring: string; icon: JSX.Element }> = {
  success: { ring: '#22e07a', icon: <CheckCircle2 size={18} /> },
  error: { ring: '#ff4d6d', icon: <AlertTriangle size={18} /> },
  info: { ring: '#00d4ff', icon: <Info size={18} /> },
  payment: { ring: 'var(--accent-2)', icon: <ArrowDownLeft size={18} /> },
}

export default function Toasts() {
  const { toasts, dismissToast } = useWallet()

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[120] flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
      {toasts.map((toast) => {
        const tone = TONE_STYLES[toast.tone] || TONE_STYLES.info
        return (
          <div
            key={toast.id}
            className="pointer-events-auto w-full max-w-md animate-slide-up overflow-hidden rounded-2xl glass-strong shadow-card"
            style={{ boxShadow: `0 18px 42px -26px ${tone.ring}` }}
          >
            <div className="flex items-start gap-3 p-3.5">
              <span
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ background: `linear-gradient(135deg, ${tone.ring}, color-mix(in srgb, ${tone.ring} 45%, #000))` }}
              >
                {toast.tone === 'payment' ? (
                  <span className="relative flex h-9 w-9 items-center justify-center">
                    <span
                      className="absolute inset-0 animate-ring-pulse rounded-xl"
                      style={{ background: tone.ring }}
                    />
                    {tone.icon}
                  </span>
                ) : (
                  tone.icon
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold">{toast.title}</p>
                {toast.body && (
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[color:var(--muted)]">
                    {toast.body}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Đóng thông báo"
                className="rounded-lg p-1 text-[color:var(--muted)] transition hover:bg-white/10"
              >
                <X size={15} />
              </button>
            </div>
            <div className="h-[3px] w-full" style={{ background: tone.ring, opacity: 0.65 }} />
          </div>
        )
      })}
    </div>
  )
}
