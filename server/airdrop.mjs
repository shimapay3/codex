import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { rpcMethod, sanitizeRpcUrl, DEFAULT_RPC } from './rpc.mjs'
import { getState, save } from './store.mjs'

const require = createRequire(import.meta.url)
const { Keypair, SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js')

const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR_PATH || '/root/.config/solana/id.json'
const AIRDROP_LAMPORTS = 1 * LAMPORTS_PER_SOL
const MIN_BALANCE_LAMPORTS = 1 * LAMPORTS_PER_SOL
const MAX_AIRDROPS_PER_DAY = Number(process.env.AIRDROP_DAILY_LIMIT || 100)
const MAX_PER_IP_PER_HOUR = 3
const CRON_MS = Number(process.env.AIRDROP_CRON_MS || 15000)
const CONFIRM_TIMEOUT_MS = 60000

let payserverKeypair = null

function loadKeypair() {
  if (payserverKeypair) return payserverKeypair

  const tryLoad = (p) => {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8')
        const secret = JSON.parse(raw)
        const kp = Keypair.fromSecretKey(Uint8Array.from(secret))
        console.log(`[airdrop] payserver loaded: ${kp.publicKey.toBase58()}`)
        return kp
      }
    } catch (err) {
      console.warn(`[airdrop] cannot load keypair from ${p}:`, err.message)
    }
    return null
  }

  payserverKeypair = tryLoad(KEYPAIR_PATH)
  if (payserverKeypair) return payserverKeypair

  const dataDir = process.env.DATA_DIR || '/data'
  const fallbackPath = path.join(dataDir, 'payserver-keypair.json')
  payserverKeypair = tryLoad(fallbackPath)
  if (payserverKeypair) return payserverKeypair

  payserverKeypair = Keypair.generate()
  try {
    fs.mkdirSync(path.dirname(fallbackPath), { recursive: true })
    fs.writeFileSync(fallbackPath, JSON.stringify(Array.from(payserverKeypair.secretKey)))
    console.log(`[airdrop] generated new payserver: ${payserverKeypair.publicKey.toBase58()}`)
    console.warn('[airdrop] WARNING: generated keypair has no SOL — fund it to enable airdrops')
  } catch (err) {
    console.error('[airdrop] cannot save fallback keypair:', err.message)
  }
  return payserverKeypair
}

function getAirdropState() {
  const state = getState()
  if (!state.airdrops) {
    state.airdrops = { records: {}, ipLog: {}, dailyCount: 0, dailyResetAt: 0 }
  }
  return state.airdrops
}

function isRateLimited(ip) {
  const st = getAirdropState()
  const now = Date.now()
  const hourAgo = now - 3_600_000
  if (!st.ipLog[ip]) st.ipLog[ip] = []
  st.ipLog[ip] = st.ipLog[ip].filter((t) => t > hourAgo)
  return st.ipLog[ip].length >= MAX_PER_IP_PER_HOUR
}

function recordIpRequest(ip) {
  const st = getAirdropState()
  if (!st.ipLog[ip]) st.ipLog[ip] = []
  st.ipLog[ip].push(Date.now())
  save()
}

function checkDailyLimit() {
  const st = getAirdropState()
  const now = Date.now()
  if (now - (st.dailyResetAt || 0) > 86_400_000) {
    st.dailyCount = 0
    st.dailyResetAt = now
  }
  return st.dailyCount >= MAX_AIRDROPS_PER_DAY
}

function incrementDailyCount() {
  const st = getAirdropState()
  st.dailyCount = (st.dailyCount || 0) + 1
  save()
}

async function getSolBalanceLamports(rpcUrl, address) {
  try {
    const result = await rpcMethod(rpcUrl, 'getBalance', [address])
    const lamports = typeof result === 'number' ? result : result?.value
    return Number.isFinite(lamports) ? lamports : 0
  } catch {
    return 0
  }
}

async function sendSol(rpcUrl, toAddress, lamports) {
  const kp = loadKeypair()
  const to = new PublicKey(toAddress)

  const blockhashResult = await rpcMethod(rpcUrl, 'getLatestBlockhash', [{ commitment: 'confirmed' }])
  const blockhash = blockhashResult?.value?.blockhash || blockhashResult?.blockhash
  if (!blockhash) throw new Error('Không lấy được blockhash')

  const tx = new Transaction({ feePayer: kp.publicKey, recentBlockhash: blockhash })
  tx.add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: to, lamports }))
  tx.sign(kp)

  const signature = await rpcMethod(rpcUrl, 'sendTransaction', [
    tx.serialize().toString('base64'),
    { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 },
  ])
  return signature
}

async function confirmTx(rpcUrl, signature) {
  const started = Date.now()
  while (Date.now() - started < CONFIRM_TIMEOUT_MS) {
    try {
      const result = await rpcMethod(rpcUrl, 'getSignatureStatuses', [[signature]])
      const status = result?.value?.[0]
      if (status?.err) return { confirmed: false, error: 'Transaction failed on-chain' }
      if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
        return { confirmed: true }
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return { confirmed: false, error: 'Confirmation timeout' }
}

let processing = false

async function processQueue(rpcUrl) {
  if (processing) return
  processing = true
  try {
    const st = getAirdropState()
    const pending = Object.entries(st.records).filter(
      ([, rec]) => rec.status === 'pending' || rec.status === 'sending',
    )
    if (pending.length === 0) return

    const kp = loadKeypair()
    const payserverBalance = await getSolBalanceLamports(rpcUrl, kp.publicKey.toBase58())
    if (payserverBalance < AIRDROP_LAMPORTS + 10000) {
      console.warn(`[airdrop] payserver balance too low: ${payserverBalance / LAMPORTS_PER_SOL} SOL`)
      return
    }

    for (const [address, record] of pending) {
      if (record.status === 'sending') continue
      try {
        const balance = await getSolBalanceLamports(rpcUrl, address)
        if (balance >= MIN_BALANCE_LAMPORTS) {
          record.status = 'confirmed'
          record.confirmedAt = Date.now()
          record.skipped = true
          save()
          continue
        }

        record.status = 'sending'
        record.sendingAt = Date.now()
        save()

        const signature = await sendSol(rpcUrl, address, AIRDROP_LAMPORTS)
        record.signature = signature
        save()

        confirmTx(rpcUrl, signature).then((result) => {
          const s = getAirdropState()
          const r = s.records[address]
          if (!r) return
          if (result.confirmed) {
            r.status = 'confirmed'
            r.confirmedAt = Date.now()
          } else {
            r.status = 'error'
            r.error = result.error
          }
          save()
        })
      } catch (err) {
        record.status = 'error'
        record.error = err.message
        save()
        console.error(`[airdrop] failed to send to ${address}:`, err.message)
      }
    }
  } finally {
    processing = false
  }
}

let cronTimer = null

export function startAirdropCron() {
  const rpcUrl = DEFAULT_RPC
  const tick = async () => {
    try {
      await processQueue(rpcUrl)
    } catch (err) {
      console.error('[airdrop] cron error:', err.message)
    }
  }
  cronTimer = setInterval(tick, CRON_MS)
  cronTimer.unref?.()
  void tick()
  console.log(`[airdrop] cron started (interval ${CRON_MS}ms)`)
}

export async function handleAirdropInit(req, res) {
  const address = req.body?.address
  if (!address || typeof address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    res.status(400).json({ error: 'Địa chỉ ví không hợp lệ' })
    return
  }

  const ip = req.ip || req.socket?.remoteAddress || 'unknown'
  const rpcUrl = sanitizeRpcUrl(req.body?.rpcUrl) || DEFAULT_RPC
  const st = getAirdropState()

  const existing = st.records[address]
  if (existing) {
    const kp = loadKeypair()
    res.json({
      status: existing.status,
      address,
      payserver: kp.publicKey.toBase58(),
      signature: existing.signature || null,
      confirmedAt: existing.confirmedAt || null,
      error: existing.error || null,
    })
    return
  }

  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' })
    return
  }

  if (checkDailyLimit()) {
    res.status(429).json({ error: 'Đã đạt giới hạn airdrop trong ngày' })
    return
  }

  recordIpRequest(ip)
  incrementDailyCount()

  st.records[address] = {
    status: 'pending',
    address,
    ip,
    createdAt: Date.now(),
    signature: null,
    confirmedAt: null,
    error: null,
  }
  save()

  const kp = loadKeypair()
  res.json({
    status: 'pending',
    address,
    payserver: kp.publicKey.toBase58(),
    signature: null,
    confirmedAt: null,
    error: null,
  })

  void processQueue(rpcUrl)
}

export function handleAirdropStatus(req, res) {
  const address = req.params.address
  if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    res.status(400).json({ error: 'Địa chỉ ví không hợp lệ' })
    return
  }

  const st = getAirdropState()
  const record = st.records[address]
  if (!record) {
    res.json({ status: 'none', address })
    return
  }

  const kp = loadKeypair()
  res.json({
    status: record.status,
    address,
    payserver: kp.publicKey.toBase58(),
    signature: record.signature || null,
    confirmedAt: record.confirmedAt || null,
    error: record.error || null,
  })
}

export function handleAirdropInfo(_req, res) {
  const kp = loadKeypair()
  res.json({
    payserver: kp.publicKey.toBase58(),
    airdropAmount: 1,
    currency: 'SOL',
  })
}
