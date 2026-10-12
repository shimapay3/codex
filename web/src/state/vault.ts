import {
  Envelope,
  b64ToBytes,
  bytesToB64,
  hkdf,
  importAesKey,
  open,
  randomBytes,
  seal,
  unwrapKey,
  wrapKey,
} from '../lib/crypto'
import { readLocal, writeLocal, StorageKeys } from '../lib/storage'

export type WalletRecord = {
  id: string
  name: string
  address: string
  /** 64-byte secret key. Only ever present in memory inside the decrypted vault. */
  secret: number[]
  createdAt: number
  tone: string
}

export type Contact = {
  id: string
  name: string
  address: string
  note?: string
  createdAt: number
  favorite?: boolean
}

export type TxMeta = Record<
  string,
  { category?: string; wish?: string; note?: string; counterpartyLabel?: string }
>

export type BalanceSample = { t: number; amount: number }

export type Prefs = {
  mode: 'dark' | 'light'
  accentId: string
  accentColor: string | null
  rpcUrl: string
  priceEndpoint: string
  autoLockMinutes: number
  fiat: 'both' | 'usd' | 'vnd'
  notifications: boolean
  sound: boolean
  hideBalances: boolean
}

export type VaultData = {
  wallets: WalletRecord[]
  activeWalletId: string | null
  contacts: Contact[]
  txMeta: TxMeta
  samples: BalanceSample[]
  prefs: Prefs
}

export type WalletIndexEntry = {
  id: string
  name: string
  address: string
  createdAt: number
  tone: string
}

export type VaultStore = {
  version: number
  envelope: Envelope
  index: WalletIndexEntry[]
  /** One wrapped copy of the vault key per wallet secret — any wallet can unlock. */
  keyWraps: Record<string, Envelope>
  /** Present when a Passkey protects this vault. */
  passkeyWrap?: Envelope
  createdAt: number
}

const TONES = ['#9945ff', '#14f195', '#00d4ff', '#ffb020', '#ff4fd8', '#3b6bff', '#22e07a']

export function toneForIndex(index: number): string {
  return TONES[index % TONES.length]
}

const VAULT_INFO = 'cloudpay.vault.key.v1'
const WRAP_INFO = 'cloudpay.vault.wrap.v1'

export function emptyVault(prefs: Prefs): VaultData {
  return {
    wallets: [],
    activeWalletId: null,
    contacts: [],
    txMeta: {},
    samples: [],
    prefs,
  }
}

export async function secretWrappingKey(secretKey: Uint8Array) {
  return importAesKey(await hkdf(secretKey, WRAP_INFO))
}

export async function encryptVaultData(vaultKeyRaw: Uint8Array, data: VaultData): Promise<Envelope> {
  const key = await importAesKey(vaultKeyRaw)
  return seal(key, data)
}

export async function decryptVaultData(vaultKeyRaw: Uint8Array, envelope: Envelope): Promise<VaultData> {
  const key = await importAesKey(vaultKeyRaw)
  return open<VaultData>(key, envelope)
}

export function loadStore(): VaultStore | null {
  const store = readLocal<VaultStore | null>(StorageKeys.vault, null)
  if (!store?.envelope?.ciphertext) return null
  return store
}

export function saveStore(store: VaultStore) {
  writeLocal(StorageKeys.vault, store)
}

/** Build the wrapping entry that lets one wallet's secret unlock the whole vault. */
export async function buildKeyWrap(walletId: string, secretKey: Uint8Array, vaultKeyRaw: Uint8Array) {
  const wrapping = await secretWrappingKey(secretKey)
  return { walletId, envelope: await wrapKey(wrapping, vaultKeyRaw) }
}

/**
 * Try every known wallet wrap with a freshly imported secret. Returns the vault
 * key when the secret belongs to this vault.
 */
export async function unwrapVaultKeyWithSecret(
  store: VaultStore,
  secretKey: Uint8Array,
): Promise<Uint8Array | null> {
  const wrapping = await secretWrappingKey(secretKey)
  for (const wallet of store.index) {
    const envelope = store.keyWraps?.[wallet.id]
    if (!envelope) continue
    try {
      return await unwrapKey(wrapping, envelope)
    } catch {
      /* wrong wallet — try the next one */
    }
  }
  return null
}

export async function createVaultStore(
  wallet: WalletRecord,
  vaultKeyRaw: Uint8Array,
  data: VaultData,
): Promise<VaultStore> {
  const wrap = await buildKeyWrap(wallet.id, Uint8Array.from(wallet.secret), vaultKeyRaw)
  return {
    version: 1,
    envelope: await encryptVaultData(vaultKeyRaw, data),
    index: [toIndex(wallet)],
    keyWraps: { [wallet.id]: wrap.envelope },
    createdAt: Date.now(),
  }
}

export function toIndex(wallet: WalletRecord): WalletIndexEntry {
  return {
    id: wallet.id,
    name: wallet.name,
    address: wallet.address,
    createdAt: wallet.createdAt,
    tone: wallet.tone,
  }
}

export function syncIndex(store: VaultStore, data: VaultData): VaultStore {
  return { ...store, index: data.wallets.map(toIndex) }
}

export function newVaultKey(): Uint8Array {
  return randomBytes(32)
}

// --- PIN protection (primary unlock method) ----

export type PinWrap = { envelope: Envelope; salt: string; createdAt: number }

export async function setPinWrap(pin: string, vaultKeyRaw: Uint8Array): Promise<PinWrap> {
  const salt = bytesToB64(randomBytes(16))
  const derived = await importAesKey(
    await (async () => {
      const { pbkdf2 } = await import('../lib/crypto')
      return pbkdf2(pin, `cloudpay.pin.${salt}`, 210000)
    })(),
  )
  return { envelope: await wrapKey(derived, vaultKeyRaw), salt, createdAt: Date.now() }
}

export async function openPinWrap(pin: string, wrap: PinWrap): Promise<Uint8Array> {
  const { pbkdf2 } = await import('../lib/crypto')
  const derived = await importAesKey(await pbkdf2(pin, `cloudpay.pin.${wrap.salt}`, 210000))
  return unwrapKey(derived, wrap.envelope)
}

export function loadPinWrap(): PinWrap | null {
  return readLocal<PinWrap | null>(StorageKeys.pinWrap, null)
}

export function savePinWrap(wrap: PinWrap | null) {
  if (wrap) writeLocal(StorageKeys.pinWrap, wrap)
  else writeLocal(StorageKeys.pinWrap, null)
}

export function b64ToBytesSafe(value: string) {
  return b64ToBytes(value)
}

// --- PIN attempt rate limiting ----------------------------------------------
// Prevents brute-forcing the 6-digit PIN by locking out after repeated failures.
// State is stored in localStorage; a determined attacker can clear it, but the
// server-side wallet limit and Telegram identity are the primary defenses.

export type PinAttempts = { count: number; lockedUntil: number; lastAttempt: number }

export function loadPinAttempts(): PinAttempts {
  return readLocal<PinAttempts>(StorageKeys.pinAttempts, { count: 0, lockedUntil: 0, lastAttempt: 0 })
}

export function savePinAttempts(attempts: PinAttempts) {
  writeLocal(StorageKeys.pinAttempts, attempts)
}

export function getPinLockoutRemaining(): number {
  const attempts = loadPinAttempts()
  if (!attempts.lockedUntil) return 0
  return Math.max(0, attempts.lockedUntil - Date.now())
}

export function recordPinFailure(): { locked: boolean; remainingMs: number } {
  const attempts = loadPinAttempts()
  const count = attempts.count + 1
  let lockedUntil = 0
  if (count >= 10) lockedUntil = Date.now() + 30 * 60 * 1000   // 30 minutes
  else if (count >= 5) lockedUntil = Date.now() + 5 * 60 * 1000  // 5 minutes
  else if (count >= 3) lockedUntil = Date.now() + 30 * 1000      // 30 seconds
  savePinAttempts({ count, lockedUntil, lastAttempt: Date.now() })
  return { locked: lockedUntil > 0, remainingMs: lockedUntil > 0 ? lockedUntil - Date.now() : 0 }
}

export function resetPinAttempts() {
  savePinAttempts({ count: 0, lockedUntil: 0, lastAttempt: 0 })
}
