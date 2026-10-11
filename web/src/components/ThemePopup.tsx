import { Check, Moon, Palette, Sun, X } from 'lucide-react'
import { ACCENTS, ThemeMode } from '../lib/theme'
import { useWallet } from '../state/WalletProvider'

type Props = { open: boolean; onClose: () => void }

const CUSTOM_COLORS = ['#9945ff', '#14f195', '#00d4ff', '#ffb020', '#ff4fd8', '#22e07a', '#ff3d5a', '#e2b53d']

/**
 * Theme picker rendered in a portal-like overlay above the whole app — including
 * above the embedded block explorer, so the sheet is never trapped inside an
 * iframe. Dark/light plus ten accent palettes and a free colour picker.
 */
export default function ThemePopup({ open, onClose }: Props) {
  const { prefs, setPrefs } = useWallet()

  if (!open) return null

  const pickMode = (mode: ThemeMode) => setPrefs({ mode })

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-md rounded-t-[28px] glass-strong p-5 shadow-card sm:rounded-[28px]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 1.25rem)' }}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/25 sm:hidden" />

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette size={18} className="accent-text" />
            <h2 className="text-[15px] font-semibold">Giao diện & màu chủ đạo</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-xl p-1.5 text-[color:var(--muted)] transition hover:bg-white/10"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2">
          {(['dark', 'light'] as ThemeMode[]).map((mode) => {
            const isActive = prefs.mode === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => pickMode(mode)}
                className={[
                  'flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-[13px] font-medium transition',
                  isActive
                    ? 'border-transparent accent-gradient text-white shadow-glow'
                    : 'border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--text)]',
                ].join(' ')}
              >
                {mode === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                {mode === 'dark' ? 'Tối (Space)' : 'Sáng (Daylight)'}
              </button>
            )
          })}
        </div>

        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
          Bảng màu
        </p>
        <div className="grid grid-cols-5 gap-2.5">
          {ACCENTS.map((accent) => {
            const isActive = !prefs.accentColor && prefs.accentId === accent.id
            return (
              <button
                key={accent.id}
                type="button"
                title={accent.name}
                onClick={() => setPrefs({ accentId: accent.id, accentColor: null })}
                className="group relative flex flex-col items-center gap-1.5"
              >
                <span
                  className={[
                    'flex h-11 w-11 items-center justify-center rounded-2xl ring-offset-2 ring-offset-[color:var(--bg)] transition',
                    isActive ? 'ring-2 ring-[color:var(--accent)]' : 'ring-1 ring-[color:var(--border)]',
                  ].join(' ')}
                  style={{
                    background: `linear-gradient(135deg, ${accent.accent}, ${accent.accent2})`,
                  }}
                >
                  {isActive && <Check size={16} className="text-white drop-shadow" />}
                </span>
                <span className="w-full truncate text-center text-[9.5px] text-[color:var(--muted)]">
                  {accent.name}
                </span>
              </button>
            )
          })}
        </div>

        <p className="mb-2.5 mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
          Màu tuỳ chỉnh
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          {CUSTOM_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setPrefs({ accentColor: color })}
              aria-label={`Màu ${color}`}
              className={[
                'h-8 w-8 rounded-xl transition',
                prefs.accentColor === color
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-[color:var(--bg)]'
                  : 'ring-1 ring-[color:var(--border)]',
              ].join(' ')}
              style={{ background: color }}
            />
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-2 rounded-xl border border-[color:var(--border)] px-3 py-1.5 text-[12px] text-[color:var(--muted)]">
            <input
              type="color"
              value={prefs.accentColor || '#9945ff'}
              onChange={(event) => setPrefs({ accentColor: event.target.value })}
              className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            Chọn màu
          </label>
        </div>
      </div>
    </div>
  )
}
