import { useState } from 'react'
import SettingsPanel from '../components/SettingsPanel'
import ThemePopup from '../components/ThemePopup'

export default function SettingsPage() {
  const [themeOpen, setThemeOpen] = useState(false)
  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-[20px] font-semibold tracking-tight">Cài đặt</h1>
        <p className="mt-0.5 text-[12px] text-[color:var(--muted)]">
          Mạng, bảo mật dữ liệu, thông báo và sao lưu
        </p>
      </header>
      <SettingsPanel onOpenTheme={() => setThemeOpen(true)} />
      <ThemePopup open={themeOpen} onClose={() => setThemeOpen(false)} />
    </div>
  )
}
