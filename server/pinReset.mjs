/**
 * Server-side PIN reset for Telegram users.
 *
 * The Telegram backup is encrypted with a key derived from the Telegram user ID
 * (HKDF). The server knows the Telegram ID, so it can decrypt the backup,
 * rebuild a complete vault store + PIN wrap, and return the full localStorage
 * payload that the client can import to reset a user's PIN.
 *
 * Uses Node.js 22 built-in Web Crypto API (globalThis.crypto.subtle).
 */

import { getState } from './store.mjs'

const TG_BACKUP_INFO = 'cloudpay.tg.backup.v1'
const TG_SALT = 'cloudchain.telegram.backup.salt.v1'
const VAULT_WRAP_INFO = 'cloudpay.vault.wrap.v1'
const HKDF_SALT = 'cloudpay.hkdf.v1'

// --- Crypto helpers (mirror web/src/lib/crypto.ts) --------------------------

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length))
}

function bytesToB64(bytes) {
  let out = ''
  for (const byte of bytes) out += String.fromCharCode(byte)
  return btoa(out)
}

function b64ToBytes(value) {
  const raw = atob(value)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function importAesKey(raw, usage = ['encrypt', 'decrypt']) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usage)
}

async function hkdf(bytes, info) {
  const base = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(HKDF_SALT),
      info: new TextEncoder().encode(info),
    },
    base,
    256,
  )
  return new Uint8Array(bits)
}

async function pbkdf2(password, salt, iterations = 210000) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations },
    base,
    256,
  )
  return new Uint8Array(bits)
}

async function seal(key, payload) {
  const iv = randomBytes(12)
  const data = new TextEncoder().encode(JSON.stringify(payload))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  return { iv: bytesToB64(iv), ciphertext: bytesToB64(new Uint8Array(cipher)), v: 1 }
}

async function open(key, envelope) {
  const iv = b64ToBytes(envelope.iv)
  const data = b64ToBytes(envelope.ciphertext)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return JSON.parse(new TextDecoder().decode(plain))
}

// --- PIN reset logic --------------------------------------------------------

async function tgBackupKey(telegramId) {
  const derived = await hkdf(
    new TextEncoder().encode(telegramId + ':' + TG_SALT),
    TG_BACKUP_INFO,
  )
  return importAesKey(derived)
}

function toIndex(wallet) {
  return {
    id: wallet.id,
    name: wallet.name,
    address: wallet.address,
    createdAt: wallet.createdAt,
    tone: wallet.tone,
  }
}

/**
 * Generate a complete localStorage payload that resets a user's PIN.
 *
 * @param {string} telegramId - Telegram user ID
 * @param {string} pin - New 6-digit PIN
 * @returns {Promise<object>} - { vault, pinWrap, pinEnabled } ready for localStorage
 */
export async function generatePinReset(telegramId, pin) {
  const state = getState()
  if (!state.tgBackups || !state.tgBackups[telegramId]) {
    throw new Error('Không tìm thấy bản sao lưu cho Telegram ID này')
  }

  const record = state.tgBackups[telegramId]
  const key = await tgBackupKey(telegramId)
  const payload = await open(key, record)

  const wallets = payload.wallets || []
  if (!wallets.length) throw new Error('Bản sao lưu không có ví nào')

  // Create a new random vault key
  const vaultKey = randomBytes(32)

  // Build vault data
  const vaultData = {
    wallets,
    activeWalletId: wallets[0].id,
    contacts: payload.contacts || [],
    txMeta: payload.txMeta || {},
    samples: payload.samples || [],
    prefs: payload.prefs || {
      mode: 'dark',
      accentId: 'solana',
      accentColor: null,
      rpcUrl: 'https://rpc.localusd.cloud',
      priceEndpoint: '',
      autoLockMinutes: 5,
      fiat: 'both',
      notifications: true,
      sound: true,
      hideBalances: false,
    },
    cloudBackup: true,
    lastBackupAt: payload.savedAt || Date.now(),
  }

  // Encrypt vault data
  const vaultAesKey = await importAesKey(vaultKey)
  const envelope = await seal(vaultAesKey, vaultData)

  // Create key wraps for each wallet
  const keyWraps = {}
  for (const wallet of wallets) {
    const wrappingKeyRaw = await hkdf(Uint8Array.from(wallet.secret), VAULT_WRAP_INFO)
    const wrappingKey = await importAesKey(wrappingKeyRaw)
    keyWraps[wallet.id] = await seal(wrappingKey, { k: bytesToB64(vaultKey) })
  }

  // Create vault store
  const vaultStore = {
    version: 1,
    envelope,
    index: wallets.map(toIndex),
    keyWraps,
    createdAt: Date.now(),
  }

  // Create PIN wrap
  const salt = bytesToB64(randomBytes(16))
  const pinDerivedRaw = await pbkdf2(pin, `cloudpay.pin.${salt}`, 210000)
  const pinDerivedKey = await importAesKey(pinDerivedRaw)
  const pinEnvelope = await seal(pinDerivedKey, { k: bytesToB64(vaultKey) })

  const pinWrap = {
    envelope: pinEnvelope,
    salt,
    createdAt: Date.now(),
  }

  return {
    vault: vaultStore,
    pinWrap,
    pinEnabled: true,
  }
}

/**
 * Express handler for POST /api/admin/reset-pin/:telegramId
 * Body: { pin: string }
 */
export async function handlePinReset(req, res) {
  const tgId = req.params.telegramId
  if (!tgId || !/^\d{1,20}$/.test(tgId)) {
    res.status(400).json({ error: 'Telegram ID không hợp lệ' })
    return
  }

  const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : ''
  if (!/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: 'PIN phải gồm đúng 6 chữ số' })
    return
  }

  try {
    const result = await generatePinReset(tgId, pin)
    res.json({ ok: true, telegramId: tgId, ...result })
  } catch (err) {
    res.status(400).json({ error: err.message || 'Không thể reset PIN' })
  }
}
