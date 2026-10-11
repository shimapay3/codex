import { NavLink } from 'react-router-dom'
import { ArrowDownToLine, ArrowUpRight, Clock, Home, Settings2 } from 'lucide-react'

const ITEMS = [
  { to: '/', label: 'Ví', icon: Home },
  { to: '/send', label: 'Gửi', icon: ArrowUpRight },
  { to: '/receive', label: 'Nhận', icon: ArrowDownToLine },
  { to: '/history', label: 'Lịch sử', icon: Clock },
  { to: '/settings', label: 'Cài đặt', icon: Settings2 },
]

export default function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.6rem)] pt-2">
      <div className="mx-auto flex max-w-md items-stretch justify-between gap-1 rounded-[22px] glass-strong p-1.5 shadow-card">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              [
                'group relative flex flex-1 flex-col items-center gap-1 rounded-[17px] px-1 py-2 text-[10.5px] font-medium transition',
                isActive ? 'text-white' : 'text-[color:var(--muted)] hover:text-[color:var(--text)]',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute inset-0 rounded-[17px] accent-gradient opacity-90 shadow-glow" />
                )}
                <span className="relative z-10 flex flex-col items-center gap-1">
                  <item.icon size={18} strokeWidth={isActive ? 2.4 : 2} />
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
