import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import * as bip39 from 'bip39'
import { derivePath } from 'ed25519-hd-key'

/**
 * All secret material in Cloud Pay Wallet is handled on the device. Nothing is
 * ever uploaded in the clear: the vault is AES-GCM encrypted with a random key
 * that only a successful Passkey assertion (or a wallet secret re-entry) can
 * unwrap, and the cloud backup stores ciphertext derived from the wallet secret.
 */

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function bytesToB64(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += String.fromCharCode(byte)
  return btoa(out)
}

export function b64ToBytes(value: string): Uint8Array {
  const raw = atob(value)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

export async function importAesKey(raw: Uint8Array, usage: KeyUsage[] = ['encrypt', 'decrypt']) {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usage)
}

export async function hkdf(bytes: Uint8Array, info: string): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('cloudpay.hkdf.v1'),
      info: new TextEncoder().encode(info),
    },
    base,
    256,
  )
  return new Uint8Array(bits)
}

export async function pbkdf2(
  password: string,
  salt: string,
  iterations = 210000,
): Promise<Uint8Array> {
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

export type Envelope = { iv: string; ciphertext: string; v: number }

export async function seal(key: CryptoKey, payload: unknown): Promise<Envelope> {
  const iv = randomBytes(12)
  const data = new TextEncoder().encode(JSON.stringify(payload))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  return { iv: bytesToB64(iv), ciphertext: bytesToB64(new Uint8Array(cipher)), v: 1 }
}

export async function open<T = unknown>(key: CryptoKey, envelope: Envelope): Promise<T> {
  const iv = b64ToBytes(envelope.iv)
  const data = b64ToBytes(envelope.ciphertext)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return JSON.parse(new TextDecoder().decode(plain)) as T
}

/** Wrap a raw vault key with a derived key so it can be stored at rest. */
export async function wrapKey(wrappingKey: CryptoKey, rawKey: Uint8Array) {
  return seal(wrappingKey, { k: bytesToB64(rawKey) })
}

export async function unwrapKey(wrappingKey: CryptoKey, envelope: Envelope): Promise<Uint8Array> {
  const payload = await open<{ k: string }>(wrappingKey, envelope)
  return b64ToBytes(payload.k)
}

// --- Wallet secret import/export -------------------------------------------

export type ImportKind = 'json-array' | 'bs58-secret' | 'bs58-seed' | 'private-key-hex' | 'mnemonic' | 'passphrase'

export type ImportResult = {
  keypair: Keypair
  kind: ImportKind
  /** Normalised, portable representation of what the user supplied. */
  canonicalSecret: number[]
}

function keypairFromSecretBytes(bytes: Uint8Array): Keypair {
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes)
  if (bytes.length === 32) return Keypair.fromSeed(bytes)
  throw new Error('Độ dài khoá bí mật không hợp lệ (cần 32 hoặc 64 byte)')
}

function parseMnemonic(input: string): Uint8Array | null {
  const words = input.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!/^[a-z ]+$/.test(words)) return null
  if (!bip39.validateMnemonic(words)) return null
  const seed = bip39.mnemonicToSeedSync(words)
  const derived = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key
  return new Uint8Array(derived)
}

/**
 * Accepts every form a user might hold a Solana secret in: the `secretKey`
 * binary JSON array exported by most wallets, base58 secret keys and seeds,
 * raw hex private keys, a BIP39 recovery phrase, or a free-form passphrase
 * (derived deterministically so the same phrase always restores the wallet).
 */
export async function importSecret(input: string): Promise<ImportResult> {
  // Strip BOM (\uFEFF) that some browsers prepend when reading uploaded files,
  // plus zero-width chars that can sneak in via copy-paste.
  const value = input.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\u2060]/g, '').trim()
  if (!value) throw new Error('Hãy nhập khoá bí mật')

  const finish = (keypair: Keypair, kind: ImportKind): ImportResult => ({
    keypair,
    kind,
    canonicalSecret: Array.from(keypair.secretKey),
  })

  // 1. Binary JSON — `[12,34,...]` or `{"secretKey":[...]}` / `{"privateKey":...}`
  if (value.startsWith('[') || value.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('JSON khoá bí mật không hợp lệ')
    }
    const candidate =
      Array.isArray(parsed)
        ? parsed
        : (parsed as Record<string, unknown>)?.secretKey ??
          (parsed as Record<string, unknown>)?.privateKey ??
          (parsed as Record<string, unknown>)?.secret ??
          (Array.isArray((parsed as any)?.keypair?.secretKey)
            ? (parsed as any).keypair.secretKey
            : null)

    if (Array.isArray(candidate)) {
      const bytes = Uint8Array.from(candidate.map((n) => Number(n)))
      if ([...bytes].some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        throw new Error('Mảng JSON chứa giá trị không phải byte')
      }
      return finish(keypairFromSecretBytes(bytes), 'json-array')
    }
    if (typeof candidate === 'string') return importSecret(candidate)
    throw new Error('Không tìm thấy khoá bí mật trong JSON')
  }

  // 2. Hex private key
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(value)) {
    const hex = value.replace(/^0x/, '')
    const bytes = Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
    return finish(keypairFromSecretBytes(bytes), 'private-key-hex')
  }

  // 3. BIP39 recovery phrase
  const mnemonicSeed = parseMnemonic(value)
  if (mnemonicSeed) return finish(Keypair.fromSeed(mnemonicSeed), 'mnemonic')

  // 4. Base58 payload
  try {
    const decoded = bs58.decode(value)
    if (decoded.length === 64) return finish(Keypair.fromSecretKey(decoded), 'bs58-secret')
    if (decoded.length === 32) return finish(Keypair.fromSeed(decoded), 'bs58-seed')
  } catch {
    /* not base58 — fall through to passphrase */
  }

  // 5. Free-form passphrase
  if (value.length < 6) throw new Error('Mật khẩu/Passphrase quá ngắn (tối thiểu 6 ký tự)')
  const derived = await pbkdf2(value, 'cloudchain.passphrase.v1', 120000)
  return finish(Keypair.fromSeed(derived), 'passphrase')
}

export function secretToBase58(keypair: Keypair): string {
  return bs58.encode(keypair.secretKey)
}

export function isValidAddress(value: string): boolean {
  try {
    const decoded = bs58.decode(value.trim())
    return decoded.length === 32
  } catch {
    return false
  }
}

export function shortAddress(value: string, size = 4): string {
  if (!value) return ''
  if (value.length <= size * 2 + 3) return value
  return `${value.slice(0, size)}…${value.slice(-size)}`
}
