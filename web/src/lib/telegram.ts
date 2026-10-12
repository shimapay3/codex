/**
 * Telegram WebApp integration.
 *
 * The wallet runs inside Telegram as a Mini App. We detect the Telegram SDK,
 * read the user's identity (id, username, photo_url) from initDataUnsafe,
 * and use the Telegram user id as the device identifier for server-side
 * wallet limits and airdrop tracking.
 *
 * When the app is opened outside Telegram (no SDK, no user), the App gate
 * shows a download-Telegram guide page instead of the wallet.
 */

export type TelegramUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string | null
  language_code?: string
  is_premium?: boolean
}

/** Raw Telegram WebApp SDK object injected by telegram-web-app.js. */
export function getTelegramWebApp(): any {
  return (window as any).Telegram?.WebApp ?? null
}

/** True when the Telegram WebApp SDK is present and ready. */
export function isTelegramWebApp(): boolean {
  const wa = getTelegramWebApp()
  return !!wa && typeof wa === 'object' && !!wa.initDataUnsafe
}

/** Returns the Telegram user when running inside Telegram, null otherwise. */
export function getTelegramUser(): TelegramUser | null {
  const wa = getTelegramWebApp()
  const user = wa?.initDataUnsafe?.user
  if (!user || typeof user.id !== 'number') return null
  return user as TelegramUser
}

/** Stable device id derived from the Telegram user id. */
export function getTelegramDeviceId(): string {
  const user = getTelegramUser()
  return user ? `tg-${user.id}` : ''
}

/** Telegram user avatar URL, or null when not available. */
export function getTelegramPhotoUrl(): string | null {
  const user = getTelegramUser()
  return user?.photo_url ?? null
}

/** Display name: "first_name last_name" or username, falling back to id. */
export function getTelegramDisplayName(): string {
  const user = getTelegramUser()
  if (!user) return 'Object None'
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ')
  if (name) return name
  if (user.username) return `@${user.username}`
  return `User ${user.id}`
}

/** Telegram username with @ prefix, or null. */
export function getTelegramUsername(): string | null {
  const user = getTelegramUser()
  if (!user?.username) return null
  return `@${user.username}`
}

/** Telegram user id as string, or null. */
export function getTelegramUserIdString(): string | null {
  const user = getTelegramUser()
  return user ? String(user.id) : null
}

/** Call Telegram WebApp ready() to signal the app is loaded. */
export function telegramReady() {
  const wa = getTelegramWebApp()
  try {
    wa?.ready?.()
    wa?.expand?.()
  } catch {
    /* ignore */
  }
}

/** Telegram brand color */
export const TELEGRAM_BLUE = '#229ED9'
export const TELEGRAM_LOGO =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2AABEE"/><stop offset="1" stop-color="#229ED9"/>' +
      '</linearGradient></defs>' +
      '<circle cx="120" cy="120" r="120" fill="url(#g)"/>' +
      '<path fill="#fff" d="M53 118l139-53c6-2 12 1 10 11l-24 112c-2 8-7 10-14 6l-38-28-18 18c-2 2-4 3-8 3l3-42 72-65c3-3-1-4-5-2l-89 56-38-12c-8-3-8-8 2-12z"/>' +
      '</svg>',
  )
