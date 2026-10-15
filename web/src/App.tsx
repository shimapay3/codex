import { useEffect } from 'react'
import { useWallet } from './state/WalletProvider'
import SpaceBackdrop from './components/SpaceBackdrop'
import Toasts from './components/Toasts'
import LockScreen from './components/LockScreen'
import Onboarding from './components/Onboarding'
import Shell from './components/Shell'
import Logo from './components/Logo'
import TelegramGuide from './components/TelegramGuide'
import { primeAudio } from './lib/notify'
import { isTelegramWebApp } from './lib/telegram'
import FileExportDialog from './components/FileExportDialog'
import WalletBackupGate from './components/WalletBackupGate'

function BootScreen() {
  return (
    <>
      <SpaceBackdrop />
      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-4">
        <div className="animate-float">
          <Logo size={64} />
        </div>
        <p className="text-[12.5px] font-medium text-[color:var(--muted)]">Đang mở két an toàn…</p>
      </div>
    </>
  )
}

export default function App() {
  const { session, wallets } = useWallet()
  const pendingBackup = wallets.find((wallet) => wallet.backupRequired)
  const inTelegram = isTelegramWebApp()

  // The first gesture anywhere unlocks audio so payment chimes can ring later.
  useEffect(() => {
    const handler = () => primeAudio()
    window.addEventListener('pointerdown', handler, { once: true })
    return () => window.removeEventListener('pointerdown', handler)
  }, [])

  if (session === 'booting') return <BootScreen />

  if (session !== 'locked' && pendingBackup) {
    return <><WalletBackupGate key={pendingBackup.id} wallet={pendingBackup} /><FileExportDialog /></>
  }

  if (session === 'onboarding') {
    return (
      <>
        <SpaceBackdrop />
        <Onboarding inTelegram={inTelegram} />
        <FileExportDialog />
        <Toasts />
      </>
    )
  }

  if (session === 'locked') {
    return (
      <>
        <SpaceBackdrop />
        <LockScreen />
        <Toasts />
      </>
    )
  }

  return <><Shell /><FileExportDialog /></>
}
