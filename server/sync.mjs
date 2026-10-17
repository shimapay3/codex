import { rpcMethod, sanitizeRpcUrl, DEFAULT_RPC } from './rpc.mjs'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { projectWalletTx, mergeTransactions, fetchRpcHistory, USDC_MINT, XSA_MINT } from './tx-history.mjs'
import { getState } from './store.mjs'
import { getUserCloudTxHistory, getCloudTxsForAddress, updateCloudTxStatus, estimateFeeFromCloudTxs } from './explorer.mjs'

/**
 * Unified sync endpoint — the single realtime API the client polls every 5 s.
 *
 * Merges into one response:
 *   • USDC balance (via RPC)
 *   • SOL balance   (via RPC)
 *   • Recent USDC transactions (via RPC)
 *   • Airdrop status (server-side state)
 *   • Price info     (fixed or cached from endpoint)
 *
 * Replaces the old /api/realtime + separate airdrop-status + price polls.
 */

const TOKEN_2022 = 'TokenzQdBNbLqP5VEhPkASv1L5Xuo6YHuHD4qLm9Q'

const FIXED_USD = 1
const FIXED_VND = 30000
const PRICE_ENDPOINT = (process.env.PRICE_ENDPOINT || '').trim()
const PRICE_CACHE_MS = 5000

const priceCache = new Map()

function lamportsToSol(lamports) {
  return (typeof lamports === 'number' ? lamports : 0) / 1_000_000_000
}

function coerceNumber(value) {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null
}

function pickPrice(payload) {
  if (!payload || typeof payload !== 'object') return null
  const usd =
    coerceNumber(payload.usd) ??
    coerceNumber(payload.USD) ??
    coerceNumber(payload.usdPrice) ??
    coerceNumber(payload.price) ??
    coerceNumber(payload?.data?.usd) ??
    coerceNumber(payload?.data?.price) ??
    coerceNumber(payload?.['usd-coin']?.usd) ??
    null
  const vnd =
    coerceNumber(payload.vnd) ??
    coerceNumber(payload.VND) ??
    coerceNumber(payload.vndPrice) ??
    coerceNumber(payload?.data?.vnd) ??
    coerceNumber(payload?.['usd-coin']?.vnd) ??
    null
  if (!usd && !vnd) return null
  return { usd: usd ?? FIXED_USD, vnd: vnd ?? (usd ? Math.round(usd * FIXED_VND) : FIXED_VND) }
}

async function getPrice(endpoint) {
  const url = (typeof endpoint === 'string' ? endpoint.trim() : '') || PRICE_ENDPOINT
  if (!url) {
    return { usd: FIXED_USD, vnd: FIXED_VND, source: 'fixed' }
  }
  const cached = priceCache.get(url)
  if (cached && Date.now() - cached.at < PRICE_CACHE_MS) {
    return cached.value
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const upstream = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    const payload = await upstream.json()
    const price = pickPrice(payload)
    if (!price) throw new Error('Không đọc được giá')
    const result = { ...price, source: 'endpoint' }
    priceCache.set(url, { value: result, at: Date.now() })
    return result
  } catch {
    return { usd: FIXED_USD, vnd: FIXED_VND, source: 'fixed', fallback: true }
  }
}

function getAirdropStatus(address) {
  const state = getState()
  const record = state.airdrops?.records?.[address]
  if (!record) return { status: 'none', address, signature: null, confirmedAt: null, error: null }
  return {
    status: record.status,
    address,
    signature: record.signature || null,
    confirmedAt: record.confirmedAt || null,
    error: record.error || null,
  }
}

async function fetchTokenBalance(rpcUrl, owner, mint) {
  const defaultDecimals = mint === XSA_MINT ? 8 : 9
  try {
    const [byMint, byProgram] = await Promise.allSettled([
      rpcMethod(rpcUrl, 'getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]),
      rpcMethod(rpcUrl, 'getTokenAccountsByOwner', [owner, { programId: TOKEN_2022 }, { encoding: 'jsonParsed' }]),
    ])

    const seen = new Map()
    let decimals = defaultDecimals
    for (const outcome of [byMint, byProgram]) {
      if (outcome.status !== 'fulfilled') continue
      for (const entry of outcome.value?.value || []) {
        const entryMint = entry?.account?.data?.parsed?.info?.mint
        if (entryMint && entryMint !== mint) continue
        const key = entry?.pubkey || String(seen.size)
        seen.set(key, entry)
        const dec = entry?.account?.data?.parsed?.info?.tokenAmount?.decimals
        if (dec) decimals = dec
      }
    }

    let total = 0n
    for (const entry of seen.values()) {
      const raw = entry?.account?.data?.parsed?.info?.tokenAmount?.amount
      if (raw) total += BigInt(raw)
    }

    if (seen.size === 0) {
      try {
        const ata = await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(owner), false, TOKEN_2022_PROGRAM_ID)
        const bal = await rpcMethod(rpcUrl, 'getTokenAccountBalance', [ata.toBase58()], 12000)
        const raw = bal?.value?.amount
        if (raw) total = BigInt(raw)
        const dec = bal?.value?.decimals
        if (dec) decimals = Number(dec)
      } catch {
        /* zero balance */
      }
    }

    return { amount: Number(total) / 10 ** decimals, decimals }
  } catch {
    return { amount: 0, decimals: defaultDecimals }
  }
}

async function fetchSolBalance(rpcUrl, owner) {
  try {
    const result = await rpcMethod(rpcUrl, 'getBalance', [owner])
    const lamports = typeof result === 'number' ? result : result?.value
    return Number.isFinite(lamports) ? lamportsToSol(lamports) : 0
  } catch {
    return 0
  }
}

/** Cloud history supplements RPC, never prevents it from being queried. */
export async function getWalletTransactions(rpcUrl, address, telegramId) {
  const userTxs = telegramId ? getUserCloudTxHistory(telegramId, address) : []
  const indexTxs = getCloudTxsForAddress(address)
  const project = (txs) => txs
    .map((tx) => projectWalletTx(tx, address)).filter(Boolean)
  // RPC is authoritative for records the validator still retains.
  const transactions = mergeTransactions(project(userTxs), project(indexTxs), await fetchRpcHistory(rpcUrl, address))
  await recheckPendingTxs(rpcUrl, transactions)
  const estFee = estimateFeeFromCloudTxs(transactions)
  return transactions.map((tx) => ({ ...tx, fee: tx.fee > 0 ? tx.fee : estFee }))
}

/**
 * Requirement 1: re-check pending transactions via RPC.
 * For each pending tx, poll getSignatureStatuses:
 *  - confirmed/finalized → update to 'success' with slot/blockTime
 *  - err → update to 'failed'
 *  - still pending or RPC error → leave as 'pending' (retry next sync)
 */
async function recheckPendingTxs(rpcUrl, transactions) {
  const pending = transactions.filter((tx) => tx.status === 'pending')
  if (pending.length === 0) return transactions

  await Promise.all(
    pending.map(async (tx) => {
      try {
        const statusResult = await rpcMethod(
          rpcUrl,
          'getSignatureStatuses',
          [[tx.signature], { searchTransactionHistory: true }],
          12000,
        )
        const sigStatus = statusResult?.value?.[0]

        if (sigStatus?.err) {
          updateCloudTxStatus(tx.signature, 'failed', null, null)
          tx.status = 'failed'
          return
        }

        if (
          sigStatus?.confirmationStatus === 'confirmed' ||
          sigStatus?.confirmationStatus === 'finalized'
        ) {
          // Confirmed — try to get slot/blockTime
          let slot = sigStatus?.slot ?? 0
          let blockTime = tx.blockTime
          try {
            const txInfo = await rpcMethod(
              rpcUrl,
              'getTransaction',
              [
                tx.signature,
                {
                  encoding: 'jsonParsed',
                  maxSupportedTransactionVersion: 0,
                  commitment: 'confirmed',
                },
              ],
              15000,
            )
            if (txInfo?.slot) slot = txInfo.slot
            if (txInfo?.blockTime) blockTime = txInfo.blockTime
          } catch {
            // Can't get details — use status slot
          }
          updateCloudTxStatus(tx.signature, 'success', slot, blockTime)
          tx.status = 'success'
          tx.slot = slot
          tx.blockTime = blockTime
        }
        // else: still pending — leave as is, retry next sync
      } catch {
        // RPC error — leave as pending, retry next sync
      }
    }),
  )

  return transactions
}

export async function handleSync(req, res) {
  const { address, rpcUrl: rawRpc, lastSignature, priceEndpoint, telegramId } = req.body || {}
  if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    res.status(400).json({ error: 'Địa chỉ không hợp lệ' })
    return
  }
  const rpcUrl = sanitizeRpcUrl(rawRpc) || DEFAULT_RPC

  try {
    const [transactions, usdc, xsa, sol, price] = await Promise.all([
      getWalletTransactions(rpcUrl, address, telegramId),
      fetchTokenBalance(rpcUrl, address, USDC_MINT),
      fetchTokenBalance(rpcUrl, address, XSA_MINT),
      fetchSolBalance(rpcUrl, address),
      getPrice(priceEndpoint),
    ])

    const airdrop = getAirdropStatus(address)

    let newCount = 0
    if (lastSignature && transactions.length) {
      const idx = transactions.findIndex((t) => t.signature === lastSignature)
      newCount = idx === -1 ? transactions.length : idx
    } else if (transactions.length) {
      newCount = transactions.length
    }

    res.json({
      address,
      usdcBalance: usdc.amount,
      xsaBalance: xsa.amount,
      xsaDecimals: xsa.decimals,
      solBalance: sol,
      decimals: usdc.decimals,
      transactions,
      newCount,
      airdrop,
      price,
      at: Date.now(),
    })
  } catch (err) {
    res.status(500).json({ error: 'Sync failed', detail: err?.message })
  }
}
