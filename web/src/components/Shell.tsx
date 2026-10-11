import { useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { BookUser, Moon, Palette, Sparkles, Sun, TimerReset, X } from 'lucide-react'
import { useWallet } from '../state/WalletProvider'
import { LogoWordmark } from './Logo'
import BottomNav from './BottomNav'
import SpaceBackdrop from './SpaceBackdrop'
import Toasts from './Toasts'
import ThemePopup from './ThemePopup'
import WalletSwitcher, { WalletSwitcherChip } from './WalletSwitcher'
import HomePage from '../pages/HomePage'
import SendPage from '../pages/SendPage'
import ReceivePage from '../pages/ReceivePage'
import HistoryPage from '../pages/HistoryPage'
import ContactsPage from '../pages/ContactsPage'
import SettingsPage from '../pages/SettingsPage'
import ExplorerPage from '../pages/ExplorerPage'
import { splitMemo } from '../lib/categories'
import { formatAmount } from '../lib/solana'

function AutoLockBanner() {
  const { autoLockSeconds, extendAutoLock, prefs } = useWallet()
  if (autoLockSeconds === null || autoLockSeconds > 29) return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+5.4rem)] z-[70] flex justify-center px-3">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl glass-strong px-3.5 py-3 shadow-card">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl accent-gradient text-white">
          <TimerReset size={17} />
        </span>
        <p className="flex-1 text-[12px] leading-snug">
          Két sẽ tự khoá sau <b>{autoLockSeconds}s</b>
          {prefs.autoLockMinutes ? '' : ''} do không có thao tác.
        </p>
        <button
          type="button"
          onClick={extendAutoLock}
          className="shrink-0 rounded-xl border border-[color:var(--border)] px-3 py-1.5 text-[11.5px] font-semibold"
        >
          Gia hạn
        </button>
      </div>
    </div>
  )
}

function IncomingBanner() {
  const { lastPayment, pushToast } = useWallet()
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (!lastPayment || dismissed === lastPayment.signature) return null
  const parsed = splitMemo(lastPayment.memo)
  return (
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+4.6rem)] z-[80] flex justify-center px-3">
      <div
        className="flex w-full max-w-md items-center gap-3 rounded-2xl glass-strong px-3.5 py-3 shadow-card"
        style={{ boxShadow: `0 20px 44px -26px ${parsed.category.color}` }}
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[18px]"
          style={{ background: `color-mix(in srgb, ${parsed.category.color} 26%, transparent)` }}>
          <span
            className="absolute inset-0 animate-ring-pulse rounded-xl"
            style={{ background: `color-mix(in srgb, ${parsed.category.color} 40%, transparent)` }}
          />
          {parsed.category.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">Tiền vừa vào ví!</p>
          <p className="truncate text-[11.5px] text-[color:var(--muted)]">
            {parsed.title || parsed.category.label}
            {lastPayment.memo ? ` · ${lastPayment.memo}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            pushToast({ tone: 'info', title: 'Đang tải giao dịch…', body: 'Chi tiết sẽ hiện trong Lịch sử' })
            setDismissed(lastPayment.signature)
          }}
          className="shrink-0 rounded-xl accent-gradient px-2.5 py-1.5 text-[11px] font-semibold text-white"
        >
          Xem
        </button>
        <button
          type="button"
          aria-label="Đóng"
          onClick={() => setDismissed(lastPayment.signature)}
          className="shrink-0 rounded-lg p-1 text-[color:var(--muted)]"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export default function Shell() {
  const { prefs, setPrefs, balance } = useWallet()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)

  return (
    <>
      <SpaceBackdrop />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <header className="safe-top sticky top-0 z-30 px-4 pb-2.5 pt-3 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <Link to="/" className="shrink-0">
              <LogoWordmark compact />
            </Link>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                aria-label={prefs.mode === 'dark' ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
                onClick={() => setPrefs({ mode: prefs.mode === 'dark' ? 'light' : 'dark' })}
                className="rounded-2xl glass p-2.5 text-[color:var(--muted)]"
              >
                {prefs.mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                type="button"
                aria-label="Màu chủ đạo"
                onClick={() => setThemeOpen(true)}
                className="rounded-2xl glass p-2.5 text-[color:var(--muted)]"
              >
                <Palette size={16} />
              </button>
              <Link
                to="/contacts"
                aria-label="Danh bạ"
                className="rounded-2xl glass p-2.5 text-[color:var(--muted)]"
              >
                <BookUser size={16} />
              </Link>
            </div>
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <WalletSwitcherChip onOpen={() => setSwitcherOpen(true)} />
            <span className="ml-auto flex items-center gap-1.5 rounded-2xl glass px-2.5 py-1.5 text-[10.5px] font-semibold text-[color:var(--muted)]">
              <Sparkles size={11} className="accent-text" />
              {prefs.hideBalances ? '••••' : formatAmount(balance.usdc, 2)} USDC
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.4rem)] pt-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/send" element={<SendPage />} />
            <Route path="/receive" element={<ReceivePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/explorer" element={<ExplorerPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <BottomNav />
      </div>

      <IncomingBanner />
      <AutoLockBanner />
      <WalletSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      <ThemePopup open={themeOpen} onClose={() => setThemeOpen(false)} />
      <Toasts />
    </>
  )
}
