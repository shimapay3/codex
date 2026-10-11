import { useEffect, useRef, useState } from 'react'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'focus'] as const

/**
 * Auto-lock: the wallet drops its in-memory key after the configured idle
 * period. A warning countdown is surfaced first so the user can extend it.
 */
export function useAutoLock(options: {
  enabled: boolean
  minutes: number
  onLock: () => void
  onExtend: () => void
}) {
  const { enabled, minutes, onLock, onExtend } = options
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const lastActivity = useRef(Date.now())
  const warnRef = useRef(false)

  useEffect(() => {
    if (!enabled || minutes <= 0) {
      setSecondsLeft(null)
      return
    }

    const limitMs = minutes * 60 * 1000
    const warnMs = Math.min(30000, limitMs / 3)

    lastActivity.current = Date.now()
    warnRef.current = false

    const bump = () => {
      lastActivity.current = Date.now()
      warnRef.current = false
      setSecondsLeft(null)
    }

    ACTIVITY_EVENTS.forEach((name) =>
      window.addEventListener(name, bump, { passive: true } as AddEventListenerOptions),
    )

    const timer = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current
      if (idle >= limitMs) {
        onLock()
        return
      }
      if (idle >= limitMs - warnMs) {
        warnRef.current = true
        setSecondsLeft(Math.ceil((limitMs - idle) / 1000))
      } else {
        warnRef.current = false
        setSecondsLeft(null)
      }
    }, 1000)

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, bump))
      window.clearInterval(timer)
    }
  }, [enabled, minutes, onLock])

  const extend = () => {
    lastActivity.current = Date.now()
    setSecondsLeft(null)
    onExtend()
  }

  const lockNow = () => {
    lastActivity.current = Date.now()
    setSecondsLeft(null)
    onLock()
  }

  return { secondsLeft, extend, lockNow }
}
