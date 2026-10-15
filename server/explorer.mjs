import { rpcMethod, sanitizeRpcUrl, DEFAULT_RPC } from './rpc.mjs'
import { getState, save } from './store.mjs'

/**
 * Explorer API — serves chain.localusd.cloud.
 *
 * Address lookups return live SOL/USDC balances from RPC plus transaction
 * history from the cloud database (built from Yêu cầu 1 — every successful
 * send is saved to the cloud txIndex).  Transaction lookups return the cloud
 * record when available, falling back to a live RPC getTransaction call.
 *
 * All endpoints are GET-only and read-only, so CORS * is safe.
 */

const USDC_MINT = 'USDnBPwJrUpXUuiptBrLXRqDwUebPjXXPSaNSvuxtb2'
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhPkASv1L5Xuo6YHuHD4qLm9Q'
const SOL_ICON = 'https://explorer.solana.com/icon-144.png'
const USDC_ICON = 'https://usdc.dolaxanh.com/a/ACg8ocJtRSV_No5FrhpG55lc3nUSspbIExRO0CVJIMLt4SXgiobyEoI5=s72-c-no'

function lamportsToSol(lamports) {
  return (typeof lamports === 'number' ? lamports : 0) / 1_000_000_000
}

function normalizeAddress(value) {
  return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) ? value : null
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
      } catch { /* zero balance */ }
    }
    return { amount: Number(total) / 10 ** decimals, decimals }
  } catch {
    return { amount: 0, decimals: 6 }
  }
}

export function getCloudTxsForAddress(address) {
  const state = getState()
  const txIndex = state.txIndex || { byAddress: {}, bySignature: {} }
  const sigs = txIndex.byAddress[address] || []
  const records = sigs
    .map((sig) => txIndex.bySignature[sig])
    .filter(Boolean)
    .sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0))
  return records
}

function getCloudTx(signature) {
  const state = getState()
  const txIndex = state.txIndex || { byAddress: {}, bySignature: {} }
  return txIndex.bySignature[signature] || null
}

function extractMemo(tx) {
  const lists = [
    tx?.transaction?.message?.instructions || [],
    ...(tx?.meta?.innerInstructions || []).map((inner) => inner?.instructions || []),
  ]
  for (const list of lists) {
    for (const instruction of list) {
      const program = instruction?.program || instruction?.programId
      if (program === 'spl-memo' || program === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
        if (typeof instruction.parsed === 'string') return instruction.parsed.trim()
        if (instruction.parsed?.info) return String(instruction.parsed.info).trim()
      }
    }
  }
  return ''
}

/**
 * Save a transaction record to the cloud txIndex + user's txHistory.
 * Called by the wallet client after every successful send (when inside Telegram).
 */
export function saveCloudTx(telegramId, tx) {
  const state = getState()
  if (!state.txIndex) state.txIndex = { byAddress: {}, bySignature: {} }
  const txIndex = state.txIndex

  // Store by signature (dedup — don't add the same sig twice)
  if (!txIndex.bySignature[tx.signature]) {
    txIndex.bySignature[tx.signature] = tx

    // Index by wallet address (sender)
    if (tx.walletAddress) {
      if (!txIndex.byAddress[tx.walletAddress]) txIndex.byAddress[tx.walletAddress] = []
      if (!txIndex.byAddress[tx.walletAddress].includes(tx.signature)) {
        txIndex.byAddress[tx.walletAddress].push(tx.signature)
      }
    }
    // Index by counterparty (receiver)
    if (tx.counterparty) {
      if (!txIndex.byAddress[tx.counterparty]) txIndex.byAddress[tx.counterparty] = []
      if (!txIndex.byAddress[tx.counterparty].includes(tx.signature)) {
        txIndex.byAddress[tx.counterparty].push(tx.signature)
      }
    }
  }

  // Also store in user's txHistory
  if (telegramId) {
    if (!state.users) state.users = {}
    if (!state.users[telegramId]) state.users[telegramId] = { contacts: [], prefs: null, samples: [], txHistory: [] }
    if (!state.users[telegramId].txHistory) state.users[telegramId].txHistory = []
    if (!state.users[telegramId].txHistory.some((t) => t.signature === tx.signature)) {
      state.users[telegramId].txHistory.push(tx)
      state.users[telegramId].updatedAt = Date.now()
    }
  }

  save()
}

/**
 * Update a cloud transaction's status (used by sync to resolve pending txs).
 */
export function updateCloudTxStatus(signature, status, slot, blockTime) {
  const state = getState()
  const txIndex = state.txIndex || { byAddress: {}, bySignature: {} }
  const tx = txIndex.bySignature[signature]
  if (!tx) return false

  tx.status = status
  if (slot != null) tx.slot = slot
  if (blockTime != null) tx.blockTime = blockTime

  // Also update in all users' txHistory
  for (const userId of Object.keys(state.users || {})) {
    const user = state.users[userId]
    if (user?.txHistory) {
      const histTx = user.txHistory.find((t) => t.signature === signature)
      if (histTx) {
        histTx.status = status
        if (slot != null) histTx.slot = slot
        if (blockTime != null) histTx.blockTime = blockTime
      }
    }
  }

  save()
  return true
}

/**
 * Get cloud transaction history for a user, filtered by wallet address.
 */
export function getUserCloudTxHistory(telegramId, walletAddress) {
  const state = getState()
  if (!state.users || !state.users[telegramId]) return []
  const history = state.users[telegramId].txHistory || []
  if (!walletAddress) return history
  return history
    .filter((tx) => tx.walletAddress === walletAddress || tx.counterparty === walletAddress)
    .sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0))
}

/** CORS headers for explorer endpoints (read-only, cross-origin from chain.localusd.cloud). */
function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

/** GET /api/explorer/address/:address — balances + cloud tx history. */
export async function handleExplorerAddress(req, res) {
  corsHeaders(res)
  const address = normalizeAddress(req.params.address)
  if (!address) {
    res.status(400).json({ error: 'Địa chỉ không hợp lệ' })
    return
  }
  const rpcUrl = sanitizeRpcUrl(req.query.rpc) || DEFAULT_RPC

  try {
    const [sol, usdc, rawTxs] = await Promise.all([
      fetchSolBalance(rpcUrl, address),
      fetchUsdcBalance(rpcUrl, address),
      Promise.resolve(getCloudTxsForAddress(address)),
    ])

    // Adjust direction relative to the queried address:
    // - walletAddress === address → 'out' (this address sent)
    // - counterparty  === address → 'in'  (this address received)
    const transactions = rawTxs.slice(0, 50).map((tx) => {
      if (tx.counterparty === address && tx.walletAddress !== address) {
        // Viewing from receiver's perspective: counterparty = sender
        return { ...tx, direction: 'in', counterparty: tx.walletAddress }
      }
      if (tx.walletAddress === address && tx.counterparty !== address) {
        return { ...tx, direction: 'out' }
      }
      return tx
    })

    res.json({
      address,
      rpcUrl,
      tokens: [
        { symbol: 'SOL', balance: sol, decimals: 9, icon: SOL_ICON, mint: null },
        { symbol: 'USDC', balance: usdc.amount, decimals: usdc.decimals, icon: USDC_ICON, mint: USDC_MINT },
      ],
      transactions,
      txCount: rawTxs.length,
    })
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed', detail: err?.message })
  }
}

/** GET /api/explorer/tx/:signature — tx details from cloud db or RPC fallback. */
export async function handleExplorerTx(req, res) {
  corsHeaders(res)
  const signature = req.params.signature
  if (!signature || typeof signature !== 'string') {
    res.status(400).json({ error: 'Chữ ký không hợp lệ' })
    return
  }
  const rpcUrl = sanitizeRpcUrl(req.query.rpc) || DEFAULT_RPC

  // 1. Check cloud db first
  const cloudTx = getCloudTx(signature)
  if (cloudTx) {
    res.json({ ...cloudTx, fromCloud: true })
    return
  }

  // 2. Fallback: fetch from RPC
  try {
    const tx = await rpcMethod(
      rpcUrl,
      'getTransaction',
      [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
      20000,
    )
    if (!tx) {
      res.status(404).json({ error: 'Không tìm thấy giao dịch' })
      return
    }

    // Parse token transfers
    const tokenTransfers = []
    const preBalances = tx?.meta?.preTokenBalances || []
    const postBalances = tx?.meta?.postTokenBalances || []
    for (const post of postBalances) {
      const pre = preBalances.find((b) => b.accountIndex === post.accountIndex && b.mint === post.mint)
      const preAmt = pre ? Number(pre.uiTokenAmount?.amount || 0) : 0
      const postAmt = Number(post.uiTokenAmount?.amount || 0)
      const delta = postAmt - preAmt
      if (delta === 0) continue
      const isUsdc = post.mint === USDC_MINT
      tokenTransfers.push({
        amount: Math.abs(delta) / 10 ** (post.uiTokenAmount?.decimals || 6),
        decimals: post.uiTokenAmount?.decimals || 6,
        from: (delta < 0 ? post.owner : pre?.owner || post.owner) || '',
        to: (delta > 0 ? post.owner : pre?.owner || post.owner) || '',
        mint: post.mint,
        symbol: isUsdc ? 'USDC' : null,
        icon: isUsdc ? USDC_ICON : null,
      })
    }

    // Parse SOL transfers
    const solTransfers = []
    for (const ix of tx?.transaction?.message?.instructions || []) {
      if (ix?.program === 'system' && ix?.parsed?.type === 'transfer') {
        solTransfers.push({
          amount: Number(ix.parsed.info.lamports) / 1_000_000_000,
          from: ix.parsed.info.source,
          to: ix.parsed.info.destination,
        })
      }
    }

    res.json({
      signature,
      slot: tx.slot,
      blockTime: tx.blockTime ?? null,
      fee: (tx?.meta?.fee || 0) / 1_000_000_000,
      status: tx?.meta?.err ? 'failed' : 'success',
      memo: extractMemo(tx),
      tokenTransfers,
      solTransfers,
      fromCloud: false,
    })
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed', detail: err?.message })
  }
}
