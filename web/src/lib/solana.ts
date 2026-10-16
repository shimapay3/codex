import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token'
import { getTelegramUserIdString } from './telegram'

/** Cloud Chain USDC token — the single supported asset of Cloud Pay Wallet. */
export const USDC_MINT = 'USDnBPwJrUpXUuiptBrLXRqDwUebPjXXPSaNSvuxtb2'
export const USDC_SYMBOL = 'USDC'
export const USDC_NAME = 'USD Coin'

/**
 * Cloud Chain's USDC is issued under the **Token-2022** (Token Extensions)
 * program with a MetadataPointer + TokenMetadata extension, so every token
 * instruction and every associated token address must use that program id
 * rather than the classic SPL Token program.
 */
export const USDC_TOKEN_PROGRAM = TOKEN_2022_PROGRAM_ID
export const USDC_AVATAR =
  'https://usdc.dolaxanh.com/a/ACg8ocJtRSV_No5FrhpG55lc3nUSspbIExRO0CVJIMLt4SXgiobyEoI5=s72-c-no'

export const DEFAULT_RPC_URL = 'https://rpc.localusd.cloud'
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

export const EXPLORER_BASE = 'https://chain.localusd.cloud'
export const SOL_ICON = 'https://explorer.solana.com/icon-144.png'
export const EXPLORER_CUSTOM_URL = 'https://rpc.localusd.cloud'
export const USDC_DECIMALS_FALLBACK = 6
export const MAX_WALLETS = 5

/** Every RPC call goes through our own API so CORS never blocks a custom node. */
export async function rpcFetch<T = any>(
  rpcUrl: string,
  method: string,
  params: any[] = [],
  timeoutMs = 25000,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-rpc-url': rpcUrl },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      signal: controller.signal,
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error?.message || `RPC HTTP ${res.status}`)
    if (json?.error) throw new Error(json.error.message || 'Lỗi RPC')
    return json.result as T
  } finally {
    clearTimeout(timer)
  }
}

export function makeConnection(rpcUrl: string) {
  return new Connection(rpcUrl, { commitment: 'confirmed' })
}

export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000
}

export function formatAmount(amount: number, _decimals = 2): string {
  return amount.toLocaleString('vi-VN', {
    maximumFractionDigits: 20,
  })
}

export function parseAmountInput(value: string, decimals = 6): number {
  const normalised = value.replace(/\s/g, '').replace(/,/g, '.')
  const parsed = Number.parseFloat(normalised)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.floor(parsed * 10 ** decimals) / 10 ** decimals
}

export type TokenBalance = {
  amount: number
  decimals: number
  raw: bigint
  ata: string | null
}

const decimalsCache = new Map<string, number>()

/**
 * Decimals are read from the chain instead of assumed: Cloud Chain's USDC mint
 * carries 9 decimals, not the 6 of mainnet USDC. `getTokenSupply` is the one
 * endpoint every node implements; the raw mint account is the fallback.
 */
export async function getUsdcDecimals(rpcUrl: string, mint = USDC_MINT): Promise<number> {
  const cacheKey = `${rpcUrl}|${mint}`
  const cached = decimalsCache.get(cacheKey)
  if (cached) return cached

  try {
    const supply = await rpcFetch<any>(rpcUrl, 'getTokenSupply', [mint], 12000)
    const decimals = Number(supply?.value?.decimals)
    if (Number.isFinite(decimals) && decimals >= 0) {
      decimalsCache.set(cacheKey, decimals)
      return decimals
    }
  } catch {
    /* fall through to the raw account */
  }

  try {
    const info = await rpcFetch<any>(rpcUrl, 'getAccountInfo', [mint, { encoding: 'base64' }])
    const data = info?.value?.data?.[0]
    if (typeof data === 'string') {
      // Mint layout: decimals is the single byte at offset 44.
      const bytes = Buffer.from(data, 'base64')
      const decimals = bytes.readUInt8(44)
      if (Number.isFinite(decimals) && decimals >= 0) {
        decimalsCache.set(cacheKey, decimals)
        return decimals
      }
    }
  } catch {
    /* keep the default */
  }

  return USDC_DECIMALS_FALLBACK
}

function sumTokenAccounts(accounts: any[]): bigint {
  let total = 0n
  for (const entry of accounts) {
    const raw =
      entry?.account?.data?.parsed?.info?.tokenAmount?.amount ??
      entry?.uiTokenAmount?.amount
    if (raw) total += BigInt(raw)
  }
  return total
}

export async function getUsdcBalance(
  rpcUrl: string,
  owner: string,
  mint = USDC_MINT,
): Promise<TokenBalance> {
  const decimals = await getUsdcDecimals(rpcUrl, mint)

  // Ask both ways (by mint and by the Token-2022 program) and merge: some nodes
  // only honour one of the two filters, and the wallet must not read 0 because
  // of that. A last resort checks the associated token account directly.
  const queries = await Promise.allSettled([
    rpcFetch<any>(rpcUrl, 'getTokenAccountsByOwner', [
      owner,
      { mint },
      { encoding: 'jsonParsed' },
    ]),
    rpcFetch<any>(rpcUrl, 'getTokenAccountsByOwner', [
      owner,
      { programId: USDC_TOKEN_PROGRAM.toBase58() },
      { encoding: 'jsonParsed' },
    ]),
  ])

  const seen = new Map<string, any>()
  for (const outcome of queries) {
    if (outcome.status !== 'fulfilled') continue
    for (const entry of outcome.value?.value || []) {
      const entryMint = entry?.account?.data?.parsed?.info?.mint
      if (entryMint && entryMint !== mint) continue
      const key = entry?.pubkey || String(seen.size)
      seen.set(key, entry)
    }
  }

  let accounts = [...seen.entries()]
  let total = sumTokenAccounts(accounts.map(([, entry]) => entry))

  if (accounts.length === 0) {
    // No listed accounts — verify the deterministic associated address.
    try {
      const ata = await getAssociatedTokenAddress(
        new PublicKey(mint),
        new PublicKey(owner),
        false,
        USDC_TOKEN_PROGRAM,
      )
      const balance = await rpcFetch<any>(rpcUrl, 'getTokenAccountBalance', [ata.toBase58()], 12000)
      const raw = balance?.value?.amount
      if (raw) {
        total = BigInt(raw)
        accounts = [[ata.toBase58(), { pubkey: ata.toBase58() }]]
      }
    } catch {
      /* account does not exist yet — a zero balance */
    }
  }

  return {
    amount: Number(total) / 10 ** decimals,
    decimals,
    raw: total,
    ata: accounts[0]?.[0] ?? null,
  }
}

export async function getSolBalance(rpcUrl: string, owner: string): Promise<number> {
  try {
    const result = await rpcFetch<number | { value?: number }>(rpcUrl, 'getBalance', [owner])
    // Cloud Chain's node wraps the lamport count in the standard
    // `{ context, value }` envelope instead of returning a bare number.
    const lamports = typeof result === 'number' ? result : Number(result?.value)
    return Number.isFinite(lamports) ? lamportsToSol(lamports) : 0
  } catch {
    return 0
  }
}

export type SendParams = {
  rpcUrl: string
  from: Keypair
  to: string
  amount: number
  memo: string
  decimals: number
}

export type SendResult = { signature: string; slot: number; blockTime: number; fee: number; status: 'success' | 'pending' }

export async function sendUsdc({ rpcUrl, from, to, amount, memo, decimals }: SendParams) {
  const recipient = new PublicKey(to)
  const mint = new PublicKey(USDC_MINT)

  const fromAta = await getAssociatedTokenAddress(mint, from.publicKey, false, USDC_TOKEN_PROGRAM)
  const toAta = await getAssociatedTokenAddress(mint, recipient, false, USDC_TOKEN_PROGRAM)

  const [ataInfo, blockhash] = await Promise.all([
    rpcFetch<any>(rpcUrl, 'getAccountInfo', [toAta.toBase58(), { encoding: 'base64' }]),
    rpcFetch<any>(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }]),
  ])

  const tx = new Transaction()
  tx.feePayer = from.publicKey
  tx.recentBlockhash = blockhash.value.blockhash

  // Recipients that never held USDC need their token account opened first.
  if (!ataInfo?.value) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        from.publicKey,
        toAta,
        recipient,
        mint,
        USDC_TOKEN_PROGRAM,
      ),
    )
  }

  const baseUnits = BigInt(Math.round(amount * 10 ** decimals))
  tx.add(
    createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      from.publicKey,
      baseUnits,
      decimals,
      [],
      USDC_TOKEN_PROGRAM,
    ),
  )

  if (memo?.trim()) {
    tx.add(
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memo.trim().slice(0, 500), 'utf8'),
      }),
    )
  }

  tx.sign(from)

  const signature = await rpcFetch<string>(rpcUrl, 'sendTransaction', [
    tx.serialize().toString('base64'),
    {
      encoding: 'base64',
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    },
  ])

  const confirmed = await confirmSignature(rpcUrl, signature, 30000)
  if (!confirmed) {
    return {
      signature,
      slot: 0,
      blockTime: Math.floor(Date.now() / 1000),
      fee: 0,
      status: 'pending' as const,
    }
  }

  try {
    const txInfo = await rpcFetch<any>(
      rpcUrl,
      'getTransaction',
      [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
      15000,
    )
    return {
      signature,
      slot: txInfo?.slot ?? 0,
      blockTime: txInfo?.blockTime ?? Math.floor(Date.now() / 1000),
      fee: (txInfo?.meta?.fee || 0) / 1_000_000_000,
      status: 'success' as const,
    }
  } catch {
    // Confirmed but can't fetch details — still a success
    return {
      signature,
      slot: 0,
      blockTime: Math.floor(Date.now() / 1000),
      fee: 0,
      status: 'success' as const,
    }
  }
}

export async function confirmSignature(
  rpcUrl: string,
  signature: string,
  timeoutMs = 30000,
): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await rpcFetch<any>(
        rpcUrl,
        'getSignatureStatuses',
        [[signature], { searchTransactionHistory: true }],
        12000,
      )
      const status = result?.value?.[0]
      if (status?.err) throw new Error('Giao dịch bị từ chối trên mạng lưới')
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        return true
      }
    } catch (err: any) {
      if (err?.message?.includes('từ chối')) throw err
    }
    await new Promise((resolve) => setTimeout(resolve, 1800))
  }
  // Timeout — not confirmed yet, but not rejected. Return false so the caller
  // can record the transaction as pending and let the sync API re-check it.
  return false
}

export type TxEntry = {
  signature: string
  slot: number
  blockTime: number | null
  direction: 'in' | 'out' | 'self' | 'other'
  amount: number
  decimals: number
  fee: number
  status: 'success' | 'failed' | 'pending'
  memo: string
  counterparty: string | null
  explorerUrl: string
}

/**
 * Explorer URLs always use the fixed Cloud Chain customUrl (localusd.cloud).
 * The rpcUrl parameter is kept for API compatibility but the customUrl is
 * hardcoded — explorer.dolaxanh.com returns empty results without it.
 */
export function explorerTxUrl(signature: string, _rpcUrl?: string): string {
  const params = new URLSearchParams({ cluster: 'custom', customUrl: EXPLORER_CUSTOM_URL })
  return `${EXPLORER_BASE}/tx/${signature}?${params.toString()}`
}

export function explorerAddressUrl(address: string, _rpcUrl?: string): string {
  const params = new URLSearchParams({ cluster: 'custom', customUrl: EXPLORER_CUSTOM_URL })
  return `${EXPLORER_BASE}/address/${address}?${params.toString()}`
}

// --- Server-side wallet limit enforcement ----------------------------------
// Each device is limited to MAX_WALLETS wallets. The server tracks wallet
// addresses per device ID and rejects creation beyond the limit.

export type WalletCountInfo = { count: number; limit: number; canCreate: boolean }

export async function getWalletCount(deviceId: string): Promise<WalletCountInfo> {
  try {
    const res = await fetch(`/api/wallet/count/${encodeURIComponent(deviceId)}`)
    const json = await res.json()
    return {
      count: Number(json.count) || 0,
      limit: Number(json.limit) || MAX_WALLETS,
      canCreate: json.canCreate !== false,
    }
  } catch {
    // If the server is unreachable, allow creation (client-side limit still applies)
    return { count: 0, limit: MAX_WALLETS, canCreate: true }
  }
}

export async function registerWalletWithServer(deviceId: string, address: string): Promise<boolean> {
  try {
    const res = await fetch('/api/wallet/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId, address }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Manual refresh and realtime polling must use the same merged, wallet-relative history. */
export async function fetchTokenHistory(
  rpcUrl: string,
  owner: string,
  mint = USDC_MINT,
  limit?: number,
): Promise<TxEntry[]> {
  if (mint !== USDC_MINT) return []
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: owner, rpcUrl, telegramId: getTelegramUserIdString() }),
  })
  if (!res.ok) throw new Error('Không tải được lịch sử giao dịch')
  const data = await res.json()
  const entries: TxEntry[] = Array.isArray(data.transactions) ? data.transactions : []
  return limit == null ? entries : entries.slice(0, limit)
}

export async function fetchTransactionSummary(
  rpcUrl: string,
  signature: string,
  owner: string,
  mint = USDC_MINT,
): Promise<TxEntry | null> {
  if (mint !== USDC_MINT) return null
  try {
    const res = await fetch(`/api/explorer/tx/${encodeURIComponent(signature)}?rpc=${encodeURIComponent(rpcUrl)}&address=${encodeURIComponent(owner)}`)
    if (!res.ok) return null
    const tx = await res.json()
    if (tx.amount == null || !tx.direction) return null
    return { ...tx, explorerUrl: explorerTxUrl(signature, rpcUrl) } as TxEntry
  } catch {
    return null
  }
}

export type PriceInfo = { usd: number; vnd: number; source: string; fallback?: boolean }

// --- SOL airdrop API (Telegram-based, 10 SOL per user / 3 days) ------------

export type AirdropStatus = 'none' | 'pending' | 'sending' | 'confirmed' | 'error'

export type AirdropInfo = {
  status: AirdropStatus
  address: string
  payserver: string
  signature: string | null
  confirmedAt: number | null
  error: string | null
  canReceive?: boolean
  remaining?: number
}

export type AirdropEligibility = {
  canReceive: boolean
  received: number
  limit: number
  remaining: number
  windowDays: number
}

/** Request 10 SOL airdrop for a new Telegram user's first wallet. */
export async function requestAirdrop(address: string, telegramId: string, rpcUrl?: string): Promise<AirdropInfo> {
  try {
    const res = await fetch('/api/airdrop/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, telegramId, rpcUrl }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'Airdrop request failed')
    return json as AirdropInfo
  } catch (err: any) {
    return { status: 'error', address, payserver: '', signature: null, confirmedAt: null, error: err?.message || 'Airdrop failed' }
  }
}

export async function checkAirdropEligibility(telegramId: string): Promise<AirdropEligibility> {
  try {
    const res = await fetch(`/api/airdrop/eligibility/${encodeURIComponent(telegramId)}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'Eligibility check failed')
    return json as AirdropEligibility
  } catch {
    return { canReceive: true, received: 0, limit: 10, remaining: 10, windowDays: 3 }
  }
}

export async function fetchAirdropStatus(address: string): Promise<AirdropInfo> {
  try {
    const res = await fetch(`/api/airdrop/status/${address}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'Airdrop status failed')
    return json as AirdropInfo
  } catch {
    return { status: 'none', address, payserver: '', signature: null, confirmedAt: null, error: null }
  }
}

/** Transfer SOL from one wallet to another (client-side signed). */
export async function transferSol(
  rpcUrl: string,
  from: Keypair,
  toAddress: string,
  solAmount: number,
  memo?: string,
): Promise<SendResult> {
  const lamports = Math.floor(solAmount * 1_000_000_000)
  if (lamports <= 0) throw new Error('Số lượng SOL không hợp lệ')

  const recipient = new PublicKey(toAddress)
  const blockhash = await rpcFetch<any>(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])

  const tx = new Transaction({
    feePayer: from.publicKey,
    recentBlockhash: blockhash.value.blockhash,
  })
  tx.add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: recipient, lamports }))

  if (memo?.trim()) {
    tx.add(
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memo.trim().slice(0, 500), 'utf8'),
      }),
    )
  }

  tx.sign(from)

  const signature = await rpcFetch<string>(rpcUrl, 'sendTransaction', [
    tx.serialize().toString('base64'),
    { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 },
  ])
  const confirmed = await confirmSignature(rpcUrl, signature, 30000)
  if (!confirmed) {
    return {
      signature,
      slot: 0,
      blockTime: Math.floor(Date.now() / 1000),
      fee: 0,
      status: 'pending' as const,
    }
  }
  try {
    const txInfo = await rpcFetch<any>(
      rpcUrl,
      'getTransaction',
      [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
      15000,
    )
    return {
      signature,
      slot: txInfo?.slot ?? 0,
      blockTime: txInfo?.blockTime ?? Math.floor(Date.now() / 1000),
      fee: (txInfo?.meta?.fee || 0) / 1_000_000_000,
      status: 'success' as const,
    }
  } catch {
    return {
      signature,
      slot: 0,
      blockTime: Math.floor(Date.now() / 1000),
      fee: 0,
      status: 'success' as const,
    }
  }
}

export function formatSolBalance(sol: number): string {
  return `◎${sol.toLocaleString('vi-VN', { minimumFractionDigits: 6, maximumFractionDigits: 6 })} SOL`
}

// --- User data cloud sync (contacts, prefs, samples by Telegram ID) --------

export type UserCloudData = {
  contacts: Array<{ id: string; name: string; address: string; note?: string; createdAt: number; favorite?: boolean }>
  prefs: Record<string, unknown> | null
  samples: Array<{ t: number; amount: number }>
  updatedAt: number | null
}

export async function fetchUserCloudData(telegramId: string): Promise<UserCloudData | null> {
  try {
    const res = await fetch(`/api/user/data/${encodeURIComponent(telegramId)}`)
    if (!res.ok) return null
    const json = await res.json()
    return {
      contacts: Array.isArray(json.contacts) ? json.contacts : [],
      prefs: json.prefs || null,
      samples: Array.isArray(json.samples) ? json.samples : [],
      updatedAt: json.updatedAt || null,
    }
  } catch {
    return null
  }
}

export async function pushUserCloudData(
  telegramId: string,
  data: { contacts?: unknown[]; prefs?: unknown; samples?: unknown[] },
): Promise<boolean> {
  try {
    const res = await fetch('/api/user/data', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ telegramId, ...data }),
    })
    return res.ok
  } catch {
    return false
  }
}

// --- Cloud transaction history (Yêu cầu 1) --------------------------------

export type CloudTxRecord = {
  signature: string
  slot: number
  blockTime: number | null
  direction: 'in' | 'out' | 'self' | 'other'
  amount: number
  decimals: number
  fee: number
  status: 'success' | 'failed' | 'pending'
  memo: string
  counterparty: string | null
  tokenSymbol: string
  walletAddress: string
  walletName: string
  explorerUrl: string
}

/** Save a transaction to the cloud (called after every successful send when in Telegram). */
export async function pushCloudTx(
  telegramId: string,
  tx: Omit<CloudTxRecord, 'explorerUrl'>,
): Promise<boolean> {
  try {
    const res = await fetch('/api/user/tx', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ telegramId, tx: { ...tx, explorerUrl: explorerTxUrl(tx.signature) } }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchPrice(endpoint?: string): Promise<PriceInfo> {
  const query = endpoint?.trim() ? `?endpoint=${encodeURIComponent(endpoint.trim())}` : ''
  try {
    const res = await fetch(`/api/price${query}`)
    const json = await res.json()
    return {
      usd: Number(json.usd) || 1,
      vnd: Number(json.vnd) || 30000,
      source: json.source || 'fixed',
      fallback: !!json.fallback,
    }
  } catch {
    return { usd: 1, vnd: 30000, source: 'fixed' }
  }
}
