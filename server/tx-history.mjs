import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { rpcMethod } from './rpc.mjs'

export const USDC_MINT = 'USDnBPwJrUpXUuiptBrLXRqDwUebPjXXPSaNSvuxtb2'
export const XSA_MINT = 'XSAdG6BXMCFxD5Q8qHtJqEHisSk3qdEVDZt8YvTjX47'
export const SUPPORTED_MINTS = [USDC_MINT, XSA_MINT]

/** Records are stored in the reporting wallet's perspective, never the viewer's. */
export function projectWalletTx(tx, address) {
  if (!tx || (tx.walletAddress !== address && tx.counterparty !== address)) return null
  if (tx.walletAddress === address && tx.counterparty === address) {
    return { ...tx, direction: 'self' }
  }
  if (tx.walletAddress === address) return { ...tx }
  return {
    ...tx,
    walletAddress: address,
    counterparty: tx.walletAddress,
    direction: tx.direction === 'out' ? 'in' : tx.direction === 'in' ? 'out' : tx.direction,
  }
}

export function mergeTransactions(...sources) {
  const bySignature = new Map()
  for (const entries of sources) {
    for (const entry of entries) {
      const previous = bySignature.get(entry.signature)
      // A stale pending response must never replace a terminal result.
      if (previous && previous.status !== 'pending' && entry.status === 'pending') continue
      const merged = { ...previous, ...entry }
      // The sender's wall-clock time beats the (skewed) chain clock.
      if (previous?.clientTime && !entry.clientTime) { merged.blockTime = previous.blockTime; merged.clientTime = true }
      bySignature.set(entry.signature, merged)
    }
  }
  return [...bySignature.values()].sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0) || (b.slot || 0) - (a.slot || 0))
}

/** Use integer base units: floating point subtraction loses tiny transfers on large balances. */
export function parseUsdcTransaction(tx, signature, owner, tokenAccounts = [], mint = USDC_MINT) {
  if (!tx?.meta) return null
  const pre = tx.meta.preTokenBalances || []
  const post = tx.meta.postTokenBalances || []
  const keys = tx.transaction?.message?.accountKeys || []
  const owners = new Map()
  const owned = new Set(tokenAccounts)
  const balances = new Map()
  let decimals = 9
  for (const b of [...pre, ...post]) {
    if (b.mint !== mint) continue
    const key = keys[b.accountIndex]
    const address = typeof key === 'string' ? key : key?.pubkey
    if (b.owner) owners.set(b.accountIndex, b.owner)
    else if (owned.has(address)) owners.set(b.accountIndex, owner)
    decimals = b.uiTokenAmount?.decimals ?? decimals
  }
  for (const [list, sign] of [[pre, -1n], [post, 1n]]) {
    for (const b of list) {
      if (b.mint !== mint) continue
      const address = owners.get(b.accountIndex)
      if (!address) continue
      const raw = b.uiTokenAmount?.amount
      if (raw == null) continue
      balances.set(address, (balances.get(address) || 0n) + sign * BigInt(raw))
    }
  }
  const delta = balances.get(owner) || 0n
  if (delta === 0n) return null // SOL-only, failed-with-no-token-change, or no token movement
  const counterparty = [...balances].find(([address, change]) =>
    address !== owner && (delta > 0n ? change < 0n : change > 0n),
  )?.[0] || null
  let memo = ''
  for (const list of [tx.transaction?.message?.instructions || [], ...(tx.meta.innerInstructions || []).map((i) => i.instructions || [])]) {
    for (const ix of list) {
      const program = ix.program || ix.programId
      if (program === 'spl-memo' || program === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
        if (typeof ix.parsed === 'string') memo = ix.parsed.trim()
        else if (ix.parsed?.info) memo = String(ix.parsed.info).trim()
      }
    }
  }
  const tokenSymbol = mint === XSA_MINT ? 'XSA' : 'USDC'
  return {
    signature, slot: tx.slot || 0, blockTime: tx.blockTime ?? null,
    direction: delta > 0n ? 'in' : 'out',
    amount: Number(delta > 0n ? delta : -delta) / 10 ** decimals,
    decimals, fee: (tx.meta.fee || 0) / 1_000_000_000,
    status: tx.meta.err ? 'failed' : 'success', memo, counterparty,
    tokenSymbol,
    explorerUrl: `https://chain.localusd.cloud/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent('https://rpc.localusd.cloud')}`,
  }
}

/** Always query BOTH owner and Token-2022 accounts, following every retained RPC page. */
export async function collectRpcHistory(rpcUrl, owner, rpc = rpcMethod, decoded = new Map(), pageSize = 1000) {
  const allEntries = []
  for (const mint of SUPPORTED_MINTS) {
    const mintEntries = await collectRpcHistoryForMint(rpcUrl, owner, mint, rpc, decoded, pageSize)
    allEntries.push(...mintEntries)
  }
  return mergeTransactions(allEntries)
}

async function collectRpcHistoryForMint(rpcUrl, owner, mint, rpc, decoded, pageSize) {
  const ata = await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(owner), false, TOKEN_2022_PROGRAM_ID)
  const addresses = new Set([owner, ata.toBase58()])
  const accounts = await Promise.allSettled([
    rpc(rpcUrl, 'getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]),
    rpc(rpcUrl, 'getTokenAccountsByOwner', [owner, { programId: TOKEN_2022_PROGRAM_ID.toBase58() }, { encoding: 'jsonParsed' }]),
  ])
  for (const result of accounts) {
    if (result.status !== 'fulfilled') continue
    for (const account of result.value?.value || []) {
      if (account.account?.data?.parsed?.info?.mint === mint && account.pubkey) addresses.add(account.pubkey)
    }
  }
  const signatures = new Map()
  await Promise.all([...addresses].map(async (address) => {
    let before
    try {
      for (;;) {
        const page = await rpc(rpcUrl, 'getSignaturesForAddress', [address, { limit: pageSize, commitment: 'confirmed', ...(before ? { before } : {}) }])
        if (!Array.isArray(page) || !page.length) break
        for (const item of page) signatures.set(item.signature, item)
        const cursor = page.at(-1)?.signature
        if (page.length < pageSize || !cursor || cursor === before) break
        before = cursor
      }
    } catch { /* Other indexes and cached/cloud history remain usable. */ }
  }))
  const items = [...signatures.values()]
  const entries = []
  let next = 0
  // Bounded concurrency avoids flooding a validator during first-time recovery.
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      try {
        let tx = decoded.get(item.signature)
        if (!tx) {
          tx = await rpc(rpcUrl, 'getTransaction', [item.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }], 12000)
          if (tx) {
            decoded.set(item.signature, tx)
            if (decoded.size > 2000) decoded.delete(decoded.keys().next().value)
          }
        }
        const entry = parseUsdcTransaction(tx, item.signature, owner, [...addresses].filter((a) => a !== owner), mint)
        if (entry) entries.push({ ...entry, slot: item.slot ?? entry.slot, blockTime: item.blockTime ?? entry.blockTime, status: item.err ? 'failed' : entry.status })
      } catch { /* Pruned transactions are retained by cloud/local history instead. */ }
    }
  }))
  return entries
}

const historyCache = new Map()
const decodedByRpc = new Map()
export async function fetchRpcHistory(rpcUrl, owner) {
  const key = `${rpcUrl}|${owner}`
  const cached = historyCache.get(key)
  if (cached?.pending) return cached.pending
  if (cached && Date.now() - cached.at < 5000) return cached.entries
  if (!decodedByRpc.has(rpcUrl)) decodedByRpc.set(rpcUrl, new Map())
  const pending = collectRpcHistory(rpcUrl, owner, rpcMethod, decodedByRpc.get(rpcUrl))
    .then((entries) => {
      historyCache.set(key, { entries, at: Date.now() })
      return entries
    }).catch(() => {
      historyCache.delete(key)
      return []
    })
  historyCache.set(key, { ...cached, pending })
  return pending
}
