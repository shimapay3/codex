import { useEffect, useState } from 'react'
import { useWallet } from './WalletProvider'

/**
 * Telegram identity for display (name, username, id, avatar).
 *
 * Reads the live `telegramUser` from WalletProvider (refreshed on visibility
 * change and every 30s) and appends a cache-buster to the avatar URL so the
 * browser / Telegram WebView never keeps showing a stale profile photo.
 */
export function useTelegramProfile() {
  const { telegramUser } = useWallet()
  const [avatarKey, setAvatarKey] = useState(() => Date.now())

  useEffect(() => {
    const refresh = () => setAvatarKey(Date.now())
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 30000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
    }
  }, [])

  const name = telegramUser
    ? [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') ||
      (telegramUser.username ? `@${telegramUser.username}` : `User ${telegramUser.id}`)
    : 'Khách'
  const username = telegramUser?.username ? `@${telegramUser.username}` : null
  const id = telegramUser ? String(telegramUser.id) : null
  const photo = telegramUser?.photo_url
    ? `${telegramUser.photo_url}${telegramUser.photo_url.includes('?') ? '&' : '?'}_=${avatarKey}`
    : null

  return { name, username, id, photo }
}
