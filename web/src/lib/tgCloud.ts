import { hkdf, importAesKey, open, seal, randomBytes, bytesToB64, b64ToBytes } from './crypto'

/**
 * Telegram ID-based cloud backup.
 *
 * The backup is encrypted with a key derived from the Telegram user ID via
 * PBKDF2, so a user only needs to be logged in via Telegram to restore —
 * no wallet secret is required to recover wallet state.
 */

const TG_BACKUP_INFO = 'cloudpay.tg.backup.v1'
const TG_SALT = 'cloudchain.telegram.backup.salt.v1'

async function tgBackupKey(telegramId: string): Promise<CryptoKey> {
  const derived = await hkdf(
    new TextEncoder().encode(telegramId + ':' + TG_SALT),
    TG_BACKUP_INFO,
  )
  return importAesKey(derived)
}

export type TgBackupPayload = {
  wallets: Array<{
    id: string
    name: string
    address: string
    secret: number[]
    createdAt: number
    tone: string
  }>
  contacts: unknown[]
  prefs: unknown
  txMeta: unknown
  samples: unknown
  savedAt: number
}

export async function uploadTgBackup(
  telegramId: string,
  payload: Omit<TgBackupPayload, 'savedAt'>,
): Promise<number> {
  const key = await tgBackupKey(telegramId)
  const envelope = await seal(key, { ...payload, savedAt: Date.now() })
  const res = await fetch(`/api/tg-backup/${encodeURIComponent(telegramId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...envelope, label: `tg-${telegramId}` }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || 'Sao lưu Telegram thất bại')
  return json.updatedAt as number
}

export async function downloadTgBackup(telegramId: string): Promise<TgBackupPayload | null> {
  const res = await fetch(`/api/tg-backup/${encodeURIComponent(telegramId)}`)
  if (res.status === 404) return null
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || 'Không tải được bản sao lưu Telegram')
  const key = await tgBackupKey(telegramId)
  return open<TgBackupPayload>(key, json)
}
