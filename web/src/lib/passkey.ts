import { b64ToBytes, bytesToB64 } from './crypto'

/**
 * Passkey (WebAuthn) helpers.
 *
 * A passkey proves the person holding the device is the wallet owner. When the
 * authenticator supports the WebAuthn PRF extension (Chrome/Android/Apple
 * platform authenticators on current OS versions) we derive a real encryption
 * key from the credential itself, so the vault key only exists after a
 * successful user-verified assertion. When PRF is unavailable we still require
 * a user-verified assertion and unwrap a locally stored copy of the vault key —
 * clearly surfaced in the UI as "Passkey (không hỗ trợ PRF)".
 */

const PRF_SALT_LABEL = 'cloudpay.wallet.vault.v1'

export type PasskeyRecord = {
  credentialId: string
  /** base64url user handle */
  userId: string
  label: string
  createdAt: number
  /** Whether the credential could produce a PRF output at registration time. */
  prf: boolean
  /** base64 PRF output captured at registration — lets us verify a later assertion. */
  prfCheck?: string
}

function b64url(bytes: Uint8Array): string {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return b64ToBytes(padded + '='.repeat((4 - (padded.length % 4)) % 4))
}

export function passkeysSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    !!navigator.credentials?.create
  )
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  try {
    if (!passkeysSupported()) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

function prfSalt(): Uint8Array {
  return new TextEncoder().encode(PRF_SALT_LABEL)
}

function extensionResults(credential: PublicKeyCredential) {
  const results: any = credential.getClientExtensionResults?.() || {}
  const prf = results.prf || {}
  return {
    enabled: !!prf.enabled,
    first: typeof prf.results?.first === 'string' ? prf.results.first : null,
  }
}

export type RegisterOutcome = {
  record: PasskeyRecord
  /** Raw PRF bytes when the authenticator produced them. */
  prfBytes: Uint8Array | null
}

export async function registerPasskey(label: string): Promise<RegisterOutcome> {
  if (!passkeysSupported()) throw new Error('Thiết bị/trình duyệt này không hỗ trợ Passkey')

  const userId = new TextEncoder().encode(`cloudpay-${Date.now()}-${Math.random()}`)
  const extensionInput: Record<string, unknown> = {
    prf: { eval: { first: prfSalt() } },
  }

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Cloud Pay Wallet' },
      user: { id: userId, name: label || 'Cloud Pay', displayName: label || 'Cloud Pay' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        requireResidentKey: false,
        userVerification: 'required',
      },
      timeout: 90000,
      attestation: 'none',
      extensions: extensionInput as any,
    },
  })) as PublicKeyCredential | null

  if (!credential) throw new Error('Không tạo được Passkey')

  const ext = extensionResults(credential)
  const prfBytes = ext.first ? fromB64url(ext.first) : null

  const record: PasskeyRecord = {
    credentialId: b64url(new Uint8Array(credential.rawId)),
    userId: b64url(userId),
    label: label || 'Cloud Pay',
    createdAt: Date.now(),
    prf: !!prfBytes,
    prfCheck: prfBytes ? bytesToB64(await prfVerifier(prfBytes)) : undefined,
  }

  return { record, prfBytes }
}

/** Stable digest of the PRF output so we can detect a mismatching credential. */
async function prfVerifier(prfBytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', prfBytes)
  return new Uint8Array(digest).slice(0, 16)
}

export type AssertOutcome = {
  prfBytes: Uint8Array | null
}

export async function assertPasskey(record: PasskeyRecord): Promise<AssertOutcome> {
  if (!passkeysSupported()) throw new Error('Thiết bị/trình duyệt này không hỗ trợ Passkey')

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: window.location.hostname,
      allowCredentials: [
        { type: 'public-key', id: fromB64url(record.credentialId), transports: ['internal'] },
      ],
      userVerification: 'required',
      timeout: 90000,
      extensions: { prf: { eval: { first: prfSalt() } } } as any,
    },
  })) as PublicKeyCredential | null

  if (!assertion) throw new Error('Xác thực Passkey bị huỷ')

  const ext = extensionResults(assertion)
  const prfBytes = ext.first ? fromB64url(ext.first) : null
  return { prfBytes }
}

export async function verifyPrf(record: PasskeyRecord, prfBytes: Uint8Array): Promise<boolean> {
  if (!record.prfCheck) return true
  const verifier = await prfVerifier(prfBytes)
  return bytesToB64(verifier) === record.prfCheck
}

export function describePasskeySupport(record: PasskeyRecord | null): string {
  if (!record) return 'Chưa thiết lập'
  return record.prf ? 'Passkey + PRF (khoá phần cứng)' : 'Passkey (không hỗ trợ PRF)'
}
