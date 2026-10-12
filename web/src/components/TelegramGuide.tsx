import { Download, ExternalLink, Smartphone, Monitor, Apple } from 'lucide-react'
import Logo from './Logo'

const DOWNLOAD_LINKS = [
  {
    icon: <Apple size={22} />,
    label: 'iOS / iPadOS',
    href: 'https://apps.apple.com/app/telegram-messenger/id686449807',
  },
  {
    icon: <Smartphone size={22} />,
    label: 'Android',
    href: 'https://play.google.com/store/apps/details?id=org.telegram.messenger',
  },
  {
    icon: <Monitor size={22} />,
    label: 'Desktop',
    href: 'https://desktop.telegram.org/',
  },
]

export default function TelegramGuide() {
  return (
    <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-5 pb-8 pt-[calc(env(safe-area-inset-top,0px)+3rem)]">
      <div className="flex flex-col items-center text-center">
        <Logo size={70} />
        <h1 className="mt-4 text-[24px] font-semibold tracking-tight">
          X<span className="accent-text">Pay</span> Wallet
        </h1>
        <p className="mt-1 text-[12.5px] text-[color:var(--muted)]">
          Ví thanh toán USDC trên Cloud Chain
        </p>
      </div>

      <div className="mt-8 w-full rounded-[26px] glass-strong p-6 text-center">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'color-mix(in srgb, #229ED9 22%, transparent)' }}
        >
          <svg viewBox="0 0 240 240" className="h-10 w-10" aria-hidden>
            <defs>
              <linearGradient id="tg-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2AABEE" />
                <stop offset="1" stopColor="#229ED9" />
              </linearGradient>
            </defs>
            <circle cx="120" cy="120" r="120" fill="url(#tg-grad)" />
            <path
              fill="#fff"
              d="M53 118l139-53c6-2 12 1 10 11l-24 112c-2 8-7 10-14 6l-38-28-18 18c-2 2-4 3-8 3l3-42 72-65c3-3-1-4-5-2l-89 56-38-12c-8-3-8-8 2-12z"
            />
          </svg>
        </div>
        <h2 className="text-[17px] font-semibold">Cần mở trong Telegram</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[color:var(--muted)]">
          XPay Wallet chạy như một ứng dụng Telegram Mini App. Vui lòng mở
          liên kết này từ bên trong Telegram để tiếp tục.
        </p>
      </div>

      <div className="mt-4 w-full rounded-[26px] glass p-5">
        <p className="mb-3 flex items-center gap-2 text-[14px] font-semibold">
          <Download size={16} className="accent-text" /> Tải Telegram cho thiết bị của bạn
        </p>
        <div className="space-y-2.5">
          {DOWNLOAD_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl border border-[color:var(--border)] px-4 py-3.5 transition hover:bg-[color:var(--surface)]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--surface-strong)]">
                {item.icon}
              </span>
              <span className="flex-1 text-[14px] font-semibold">{item.label}</span>
              <ExternalLink size={16} className="text-[color:var(--muted)]" />
            </a>
          ))}
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-[color:var(--muted)]">
        Sau khi cài đặt Telegram, mở liên kết XPay Wallet từ Telegram để
        truy cập ví của bạn.
      </p>
    </div>
  )
}
