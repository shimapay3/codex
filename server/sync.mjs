import { rpcMethod, sanitizeRpcUrl, DEFAULT_RPC } from './rpc.mjs'
import { getState } from './store.mjs'
import { getUserCloudTxHistory, getCloudTxsForAddress } from './explorer.mjs'

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

const USDC_MINT = 'USDnBPwJrUpXUuiptBrLXRqDwUebPjXXPSaNSvuxtb2'
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhPkASv1L5Xuo6YHuHD4qLm9Q'

const EXPLORER_BASE = 'https://chain.localusd.cloud'
const EXPLORER_CUSTOM_URL = 'https://rpc.localusd.cloud'

function explorerTxUrl(signature) {
  const params = new URLSearchParams({ cluster: 'custom', customUrl: EXPLORER_CUSTOM_URL })
  return `${EXPLORER_BASE}/tx/${signature}?${params.toString()}`
}

const FIXED_USD = 1
const FIXED_VND = 30000
const PRICE_ENDPOINT = (process.env.PRICE_ENDPOINT || '').trim()
const PRICE_CACHE_MS = 60000

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

async function fetchUsdcBalance(rpcUrl, owner) {
  try {
    const [byMint, byProgram] = await Promise.allSettled([
      rpcMethod(rpcUrl, 'getTokenAccountsByOwner', [owner, { mint: USDC_MINT }, { encoding: 'jsonParsed' }]),
      rpcMethod(rpcUrl, 'getTokenAccountsByOwner', [owner, { programId: TOKEN_2022 }, { encoding: 'jsonParsed' }]),
    ])

    const seen = new Map()
    let decimals = 6
    for (const outcome of [byMint, byProgram]) {
      if (outcome.status !== 'fulfilled') continue
      for (const entry of outcome.value?.value || []) {
        const entryMint = entry?.account?.data?.parsed?.info?.mint
        if (entryMint && entryMint !== USDC_MINT) continue
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
        const { getAssociatedTokenAddress, PublicKey } = await import('@solana/spl-token')
        const ata = await getAssociatedTokenAddress(new PublicKey(USDC_MINT), new PublicKey(owner), false)
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
    return { amount: 0, decimals: 6 }
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

async function fetchRecentTxs(rpcUrl, owner, limit = 15) {
  try {
    // Token-2022 signatures are indexed by the Associated Token Account
    // address, not the owner's system account. Resolve the ATA first so
    // sent transactions appear in the history.
    let queryAddress = owner
    try {
      const { getAssociatedTokenAddress, PublicKey } = await import('@solana/spl-token')
      const ata = await getAssociatedTokenAddress(
        new PublicKey(USDC_MINT),
        new PublicKey(owner),
        false,
        new PublicKey(TOKEN_2022),
      )
      queryAddress = ata.toBase58()
    } catch {
      // Fallback to owner address if ATA resolution fails
    }

    let signatures = await rpcMethod(rpcUrl, 'getSignaturesForAddress', [queryAddress, { limit }])

    // Fallback: if ATA query returns nothing, try the owner's system account.
    // Some RPC nodes don't index Token-2022 activity by the ATA address.
    if ((!Array.isArray(signatures) || signatures.length === 0) && queryAddress !== owner) {
      try {
        const ownerSigs = await rpcMethod(rpcUrl, 'getSignaturesForAddress', [owner, { limit }])
        if (Array.isArray(ownerSigs) && ownerSigs.length > 0) {
          signatures = ownerSigs
        }
      } catch {
        /* keep empty result */
      }
    }

    if (!Array.isArray(signatures) || signatures.length === 0) return []

    const entries = await Promise.all(
      signatures.slice(0, limit).map(async (item) => {
        try {
          const tx = await rpcMethod(rpcUrl, 'getTransaction', [
            item.signature,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
          ], 20000)
          if (!tx) return null

          const decimals =
            tx?.meta?.postTokenBalances?.find((b) => b.mint === USDC_MINT)?.uiTokenAmount?.decimals ??
            tx?.meta?.preTokenBalances?.find((b) => b.mint === USDC_MINT)?.uiTokenAmount?.decimals ?? 6

          const mine = (list) => (list || []).filter((b) => b.mint === USDC_MINT && b.owner === owner)
          const sum = (list) => list.reduce((acc, b) => acc + Number(b.uiTokenAmount?.uiAmountString || 0), 0)
          const delta = sum(mine(tx?.meta?.postTokenBalances)) - sum(mine(tx?.meta?.preTokenBalances))
          const others = (tx?.meta?.postTokenBalances || []).filter((b) => b.mint === USDC_MINT && b.owner && b.owner !== owner)

          let memo = ''
          for (const list of [tx?.transaction?.message?.instructions || [], ...(tx?.meta?.innerInstructions || []).map((i) => i?.instructions || [])]) {
            for (const ix of list) {
              const prog = ix?.program || ix?.programId
              if (prog === 'spl-memo' || prog === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
                if (typeof ix.parsed === 'string') memo = ix.parsed.trim()
                else if (ix.parsed?.info) memo = String(ix.parsed.info).trim()
              }
            }
          }

          const direction = Math.abs(delta) < 1e-9 ? 'other' : delta > 0 ? 'in' : 'out'

          return {
            signature: item.signature,
            slot: item.slot,
            blockTime: item.blockTime ?? tx?.blockTime ?? null,
            direction,
            amount: Math.abs(delta),
            decimals,
            status: item.err || tx?.meta?.err ? 'failed' : 'success',
            memo,
            counterparty: others[0]?.owner ?? null,
            explorerUrl: explorerTxUrl(item.signature),
          }
        } catch {
          return null
        }
      }),
    )

    return (entries.filter(Boolean)).filter((e) => e.amount > 0 || e.direction === 'self')
  } catch {
    return []
  }
}

export async function handleSync(req, res) {
  const { address, rpcUrl: rawRpc, lastSignature, priceEndpoint, telegramId } = req.body || {}
  if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    res.status(400).json({ error: 'Địa chỉ không hợp lệ' })
    return
  }
  const rpcUrl = sanitizeRpcUrl(rawRpc) || DEFAULT_RPC

  try {
    // When telegramId is provided, use cloud transaction history instead of
    // RPC (avoids validator slot overflow / empty history).
    let transactions
    if (telegramId) {
      const cloudTxs = getUserCloudTxHistory(telegramId, address)
      if (cloudTxs.length > 0) {
        transactions = cloudTxs.slice(0, 15)
      } else {
        // Fallback: check txIndex by address (populated even if user txHistory is empty)
        const indexTxs = getCloudTxsForAddress(address)
        if (indexTxs.length > 0) {
          transactions = indexTxs.slice(0, 15)
        } else {
          transactions = await fetchRecentTxs(rpcUrl, address, 15)
        }
      }
    } else {
      // No telegramId — try txIndex by address first, then RPC
      const indexTxs = getCloudTxsForAddress(address)
      if (indexTxs.length > 0) {
        transactions = indexTxs.slice(0, 15)
      } else {
        transactions = await fetchRecentTxs(rpcUrl, address, 15)
      }
    }

    const [usdc, sol, price] = await Promise.all([
      fetchUsdcBalance(rpcUrl, address),
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
