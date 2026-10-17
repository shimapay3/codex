import { rpcMethod, sanitizeRpcUrl, DEFAULT_RPC } from './rpc.mjs'
import { getState, save } from './store.mjs'
import { projectWalletTx, mergeTransactions, parseUsdcTransaction, USDC_MINT, XSA_MINT } from './tx-history.mjs'

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

const TOKEN_2022 = 'TokenzQdBNbLqP5VEhPkASv1L5Xuo6YHuHD4qLm9Q'
const SOL_ICON = 'https://explorer.solana.com/icon-144.png'
const USDC_ICON = 'https://usdc.dolaxanh.com/a/ACg8ocJtRSV_No5FrhpG55lc3nUSspbIExRO0CVJIMLt4SXgiobyEoI5=s72-c-no'
const XSA_ICON = 'https://usdc.dolaxanh.com/a/ACg8ocJtRSV_No5FrhpG55lc3nUSspbIExRO0CVJIMLt4SXgiobyEoI5=s72-c-no'

/** Cloud Chain USDC luôn dùng 9 decimals — không phải 6 như mainnet. */
const USDC_DECIMALS = 9
/** Phí giao dịch mặc định trên Solana (~5000 lamports). */
const DEFAULT_FEE_SOL = 0.000005

function lamportsToSol(lamports) {
  return (typeof lamports === 'number' ? lamports : 0) / 1_000_000_000
}

/**
 * Chuẩn hoá decimals cho bản ghi cloud USDC.
 * Cloud Chain USDC luôn dùng 9 decimals.  Chỉ sửa trường decimals,
 * KHÔNG chia amount — amount đã là human-readable khi lưu qua pushCloudTx
 * (frontend gửi params.amount trực tiếp).  Heuristic chia amount cũ đã
 * phá giá trị hợp lệ lớn (vd 3,000,000,000 USDC → 3).
 */
export function normalizeCloudTxAmount(tx) {
  if (!tx) return tx
  tx = { ...tx } // Read-time formatting must not mutate the canonical record.
  const isSol = tx.tokenSymbol === 'SOL'
  const isXsa = tx.tokenSymbol === 'XSA'
  if (isSol || isXsa) return tx
  // USDC records: Cloud Chain USDC always uses 9 decimals.
  if (tx.decimals != null && tx.decimals !== USDC_DECIMALS) {
    tx.decimals = USDC_DECIMALS
  } else if (tx.decimals == null) {
    tx.decimals = USDC_DECIMALS
  }
  return tx
}

/**
 * Tìm phí SOL gần nhất khác 0 từ danh sách cloud tx, dùng làm phí ước tính
 * khi validator đã prune (fee=0).
 */
export function estimateFeeFromCloudTxs(txs) {
  if (!Array.isArray(txs)) return DEFAULT_FEE_SOL
  const withFee = txs.filter((t) => t && typeof t.fee === 'number' && t.fee > 0)
  if (withFee.length > 0) return withFee[0].fee
  return DEFAULT_FEE_SOL
}

/** Áp dụng phí ước tính cho các tx có fee=0 (validator pruned). */
function applyFeeEstimate(txs, estimatedFee) {
  for (const tx of txs) {
    if (tx && (tx.fee == null || tx.fee === 0)) {
      tx.fee = estimatedFee
    }
  }
  return txs
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
        const { getAssociatedTokenAddress, PublicKey } = await import('@solana/spl-token')
        const ata = await getAssociatedTokenAddress(new PublicKey(mint), new PublicKey(owner), false)
        const bal = await rpcMethod(rpcUrl, 'getTokenAccountBalance', [ata.toBase58()], 12000)
        const raw = bal?.value?.amount
        if (raw) total = BigInt(raw)
        const dec = bal?.value?.decimals
        if (dec) decimals = Number(dec)
      } catch { /* zero balance */ }
    }
    return { amount: Number(total) / 10 ** decimals, decimals }
  } catch {
    return { amount: 0, decimals: defaultDecimals }
  }
}

export function getCloudTxsForAddress(address) {
  const state = getState()
  const txIndex = state.txIndex || { byAddress: {}, bySignature: {} }
  const sigs = [...new Set([...(txIndex.byAddress[address] || []),
    ...Object.values(txIndex.bySignature).filter((tx) => tx.walletAddress === address || tx.counterparty === address).map((tx) => tx.signature),
  ])]
  const records = sigs
    .map((sig) => txIndex.bySignature[sig])
    .filter(Boolean)
    .map(normalizeCloudTxAmount)
    .sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0))
  // Áp dụng phí ước tính cho tx có fee=0
  const estFee = estimateFeeFromCloudTxs(records)
  applyFeeEstimate(records, estFee)
  return records
}

function getCloudTx(signature) {
  const state = getState()
  const txIndex = state.txIndex || { byAddress: {}, bySignature: {} }
  const tx = txIndex.bySignature[signature]
  return tx ? normalizeCloudTxAmount(tx) : null
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

  const existing = txIndex.bySignature[tx.signature]
  const reported = existing ? projectWalletTx(tx, existing.walletAddress) : tx
  const record = mergeTransactions(existing ? [existing] : [], reported ? [reported] : [])[0]
  if (!record) return
  txIndex.bySignature[tx.signature] = record
  for (const address of [record.walletAddress, record.counterparty].filter(Boolean)) {
    if (!txIndex.byAddress[address]) txIndex.byAddress[address] = []
    if (!txIndex.byAddress[address].includes(tx.signature)) txIndex.byAddress[address].push(tx.signature)
  }

  if (telegramId) {
    if (!state.users) state.users = {}
    if (!state.users[telegramId]) state.users[telegramId] = { contacts: [], prefs: null, samples: [] }
    const user = state.users[telegramId]
    user.txHistory = mergeTransactions(user.txHistory || [], [record])
    user.updatedAt = Date.now()
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
  if (blockTime != null && !tx.clientTime) tx.blockTime = blockTime

  // Also update in all users' txHistory
  for (const userId of Object.keys(state.users || {})) {
    const user = state.users[userId]
    if (user?.txHistory) {
      const histTx = user.txHistory.find((t) => t.signature === signature)
      if (histTx) {
        histTx.status = status
        if (slot != null) histTx.slot = slot
        if (blockTime != null && !histTx.clientTime) histTx.blockTime = blockTime
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
  const records = history
    .filter((tx) => tx.walletAddress === walletAddress || tx.counterparty === walletAddress)
    .map(normalizeCloudTxAmount)
    .sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0))
  // Áp dụng phí ước tính cho tx có fee=0
  const estFee = estimateFeeFromCloudTxs(records)
  applyFeeEstimate(records, estFee)
  return records
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
    const [sol, usdc, xsa, rawTxs] = await Promise.all([
      fetchSolBalance(rpcUrl, address),
      fetchTokenBalance(rpcUrl, address, USDC_MINT),
      fetchTokenBalance(rpcUrl, address, XSA_MINT),
      Promise.resolve(getCloudTxsForAddress(address)),
    ])

    // Adjust direction relative to the queried address:
    // - walletAddress === address → 'out' (this address sent)
    // - counterparty  === address → 'in'  (this address received)
    // Also apply fee estimate for pruned transactions.
    const estFee = estimateFeeFromCloudTxs(rawTxs)
    const transactions = rawTxs.map((tx) => projectWalletTx(tx, address)).filter(Boolean).map((tx) => ({
      ...tx, fee: tx.fee != null && tx.fee > 0 ? tx.fee : estFee,
    }))

    res.json({
      address,
      rpcUrl,
      tokens: [
        { symbol: 'SOL', balance: sol, decimals: 9, icon: SOL_ICON, mint: null },
        { symbol: 'USDC', balance: usdc.amount, decimals: usdc.decimals, icon: USDC_ICON, mint: USDC_MINT },
        { symbol: 'XSA', balance: xsa.amount, decimals: xsa.decimals, icon: XSA_ICON, mint: XSA_MINT },
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
    // Đảm bảo tx cloud có phí SOL (ước tính nếu validator đã prune)
    if (cloudTx.fee == null || cloudTx.fee === 0) {
      const allTxs = getCloudTxsForAddress(cloudTx.walletAddress || '')
      cloudTx.fee = estimateFeeFromCloudTxs(allTxs)
    }
    const address = normalizeAddress(req.query.address)
    const viewed = address ? projectWalletTx(cloudTx, address) : cloudTx
    res.json({ ...(viewed || { ...cloudTx, direction: 'other' }), fromCloud: true })
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
      const isXsa = post.mint === XSA_MINT
      tokenTransfers.push({
        amount: Math.abs(delta) / 10 ** (post.uiTokenAmount?.decimals || 6),
        decimals: post.uiTokenAmount?.decimals || 6,
        from: (delta < 0 ? post.owner : pre?.owner || post.owner) || '',
        to: (delta > 0 ? post.owner : pre?.owner || post.owner) || '',
        mint: post.mint,
        symbol: isUsdc ? 'USDC' : isXsa ? 'XSA' : null,
        icon: isUsdc ? USDC_ICON : isXsa ? XSA_ICON : null,
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
      ...(normalizeAddress(req.query.address)
        ? parseUsdcTransaction(tx, signature, req.query.address, [], USDC_MINT)
          || parseUsdcTransaction(tx, signature, req.query.address, [], XSA_MINT)
          || { direction: 'other', amount: 0 }
        : {}),
      fromCloud: false,
    })
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed', detail: err?.message })
  }
}

/** Rebuild derived indexes from both surviving stores; no amount or signature is rewritten. */
export function repairTransactionIndex() {
  const state = getState()
  const old = state.txIndex || { bySignature: {}, byAddress: {} }
  const records = mergeTransactions(
    ...Object.values(state.users || {}).map((u) => u.txHistory || []),
    Object.values(old.bySignature || {}),
  ).filter((tx) => tx?.signature && tx.walletAddress)
  const bySignature = Object.fromEntries(records.map((tx) => [tx.signature, tx]))
  const byAddress = {}
  for (const tx of records) {
    for (const address of new Set([tx.walletAddress, tx.counterparty].filter(Boolean))) {
      if (!byAddress[address]) byAddress[address] = []
      byAddress[address].push(tx.signature)
    }
  }
  const repaired = { bySignature, byAddress }
  let changed = JSON.stringify(old) !== JSON.stringify(repaired)
  let recoveredUserRecords = 0
  state.txIndex = repaired
  // Only explicit Telegram-device wallet registrations establish ownership.
  for (const [id, user] of Object.entries(state.users || {})) {
    const addresses = new Set(state.wallets?.devices?.[`tg-${id}`]?.addresses || [])
    if (!addresses.size) continue
    const previous = user.txHistory || []
    const recovered = records.filter((tx) => addresses.has(tx.walletAddress) || addresses.has(tx.counterparty))
    const merged = mergeTransactions(previous, recovered)
    if (JSON.stringify(previous) !== JSON.stringify(merged)) {
      recoveredUserRecords += merged.length - previous.length
      user.txHistory = merged
      changed = true
    }
  }
  if (changed) save()
  return { records: records.length, addresses: Object.keys(byAddress).length, recoveredUserRecords }
}
