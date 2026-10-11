/**
 * Sound + system-notification helpers shared by the realtime payment alerts.
 * Everything degrades gracefully: if the browser blocks audio until the first
 * user gesture, or notifications were never granted, the in-app toast still
 * fires.
 */

let ctx: AudioContext | null = null

function audioContext(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Unlock audio on the first user gesture so later alerts can ring. */
export function primeAudio() {
  const context = audioContext()
  if (!context) return
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  gain.gain.value = 0.0001
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.02)
}

function bell(frequencies: number[], duration = 0.42, volume = 0.22, type: OscillatorType = 'sine') {
  const context = audioContext()
  if (!context) return
  const now = context.currentTime
  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.value = frequency
    const start = now + index * 0.11
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  })
}

/** Bright two-note "money received" ring. */
export function ringIncoming() {
  bell([880, 1318.5], 0.5, 0.24)
}

export function ringSuccess() {
  bell([659.25, 987.77], 0.34, 0.18)
}

export function ringError() {
  bell([311.13, 233.08], 0.4, 0.18, 'triangle')
}

export function ringUnlock() {
  bell([1174.66], 0.22, 0.14)
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    const result = await Notification.requestPermission()
    return result === 'granted'
  } catch {
    return false
  }
}

export function showSystemNotification(title: string, body: string, tag?: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  try {
    const notification = new Notification(title, {
      body,
      tag: tag || 'cloudpay',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      silent: false,
    })
    notification.onclick = () => {
      try {
        window.focus()
      } catch {
        /* ignore */
      }
      notification.close()
    }
    return true
  } catch {
    return false
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}
