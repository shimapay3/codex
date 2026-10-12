import { rpcMethod, sanitizeRpcUrl, DEFAULT_RPC } from './rpc.mjs'

/**
 * Unified realtime endpoint.
 *
 * Merges balance, history, and airdrop status into a single server-side
 * poll so the client makes one request every 5 s instead of multiple
 * parallel calls + a WebSocket.
 */

const USDC_MINT = 'USDnBPwJrUpXUuiptBrLXRqDwUebPjXXPSaNSvuxtb2'
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhPkASv1L5Xuo6YHuHD4qLm9Q'

function lamportsToSol(lamports) {
  return (typeof lamports === 'number' ? lamports : 0) / 1_000_000_000
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
    const signatures = await rpcMethod(rpcUrl, 'getSignaturesForAddress', [owner, { limit }])
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

          // Extract memo
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

export async function handleRealtime(req, res) {
  const { address, rpcUrl: rawRpc, lastSignature } = req.body || {}
  if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    res.status(400).json({ error: 'Địa chỉ không hợp lệ' })
    return
  }
  const rpcUrl = sanitizeRpcUrl(rawRpc) || DEFAULT_RPC

  try {
    const [usdc, sol, transactions] = await Promise.all([
      fetchUsdcBalance(rpcUrl, address),
      fetchSolBalance(rpcUrl, address),
      fetchRecentTxs(rpcUrl, address, 15),
    ])

    // Check for new transactions since lastSignature
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
      at: Date.now(),
    })
  } catch (err) {
    res.status(500).json({ error: 'Realtime fetch failed', detail: err?.message })
  }
}
