import { b64ToBytes, bytesToB64, hkdf, importAesKey, open, randomBytes, seal } from './crypto'

/**
 * Personal cloud backup.
 *
 * The backup key is derived from the wallet's own secret, so the server stores
 * nothing but ciphertext: restoring on a new device only needs the same secret
 * (binary JSON, base58, recovery phrase or passphrase) that the user already
 * holds offline.
 */

const BACKUP_INFO = 'cloudpay.cloud.backup.v1'

export async function backupKeyFromSecret(secretKey: Uint8Array) {
  const derived = await hkdf(secretKey, BACKUP_INFO)
  return importAesKey(derived)
}

export type BackupPayload = {
  wallets: Array<{ id: string; name: string; address: string; createdAt: number }>
  contacts: unknown[]
  settings: unknown
  transactionMeta: unknown
  balanceSamples: unknown
  savedAt: number
}

export type BackupStatus = {
  state: 'idle' | 'syncing' | 'synced' | 'error'
  updatedAt: number | null
  message?: string
}

export async function uploadBackup(
  address: string,
  secretKey: Uint8Array,
  payload: Omit<BackupPayload, 'savedAt'>,
): Promise<number> {
  const key = await backupKeyFromSecret(secretKey)
  const envelope = await seal(key, { ...payload, savedAt: Date.now() })
  const res = await fetch(`/api/backup/${address}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...envelope, label: address }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || 'Sao lưu thất bại')
  return json.updatedAt as number
}

export async function downloadBackup(
  address: string,
  secretKey: Uint8Array,
): Promise<BackupPayload | null> {
  const res = await fetch(`/api/backup/${address}`)
  if (res.status === 404) return null
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error || 'Không tải được bản sao lưu')
  const key = await backupKeyFromSecret(secretKey)
  return open<BackupPayload>(key, json)
}

export async function backupInfo(address: string): Promise<{ updatedAt: number; label: string } | null> {
  try {
    const res = await fetch(`/api/backup/${address}`)
    if (!res.ok) return null
    const json = await res.json()
    return { updatedAt: json.updatedAt, label: json.label || '' }
  } catch {
    return null
  }
}

export async function deleteBackup(address: string) {
  await fetch(`/api/backup/${address}`, { method: 'DELETE' })
}

/** Portable encrypted export the user can keep somewhere they own. */
export async function exportEncryptedVault(secretKey: Uint8Array, payload: unknown) {
  const salt = randomBytes(16)
  const key = await importAesKey(await hkdf(new Uint8Array([...salt, ...secretKey]), BACKUP_INFO))
  const envelope = await seal(key, payload)
  return {
    format: 'cloudpay-encrypted-vault',
    version: 1,
    salt: bytesToB64(salt),
    ...envelope,
  }
}

export async function importEncryptedVault(secretKey: Uint8Array, file: any) {
  const salt = b64ToBytes(file.salt)
  const key = await importAesKey(await hkdf(new Uint8Array([...salt, ...secretKey]), BACKUP_INFO))
  return open(key, file)
}
