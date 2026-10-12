import http from 'node:http'
import express from 'express'
import { DEFAULT_RPC, handleRpcProxy } from './rpc.mjs'
import { startWatcher } from './watcher.mjs'
import { startAirdropCron, handleAirdropInit, handleAirdropStatus, handleAirdropInfo } from './airdrop.mjs'
import { getState, load, save } from './store.mjs'

const PORT = Number(process.env.PORT || 8000)

// Fixed reference price for USDC. USDC is a USD stablecoin, so 1 USDC ≈ 1 USD.
// The VND leg is a fixed reference rate and can be overridden either by the
// PRICE_ENDPOINT env var or at runtime from the app's Settings screen, where the
// user may point it at any RPC/price endpoint that returns JSON.
const FIXED_USD = 1
const FIXED_VND = 30000
const PRICE_ENDPOINT = (process.env.PRICE_ENDPOINT || '').trim()

const app = express()
app.use(express.json({ limit: '512kb' }))

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'cloud-pay-wallet-api', rpc: DEFAULT_RPC })
})

app.post('/api/rpc', handleRpcProxy)

// --- SOL airdrop for new wallets -------------------------------------------
// The payserver holds a funded keypair and sends 1 SOL to new wallets that
// have no gas budget. Rate-limited and deduplicated to prevent abuse.

app.post('/api/airdrop/init', handleAirdropInit)
app.get('/api/airdrop/status/:address', handleAirdropStatus)
app.get('/api/airdrop/info', handleAirdropInfo)

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

app.get('/api/price', async (req, res) => {
  const requested = typeof req.query.endpoint === 'string' ? req.query.endpoint.trim() : ''
  const endpoint = requested || PRICE_ENDPOINT

  if (!endpoint) {
    res.json({
      usd: FIXED_USD,
      vnd: FIXED_VND,
      source: 'fixed',
      updatedAt: Date.now(),
    })
    return
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const upstream = await fetch(endpoint, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    const payload = await upstream.json()
    const price = pickPrice(payload)
    if (!price) throw new Error('Không đọc được giá từ endpoint')
    res.json({ ...price, source: 'endpoint', updatedAt: Date.now() })
  } catch (err) {
    // Never break the Pay flow on a flaky price feed — fall back to the
    // USD-stablecoin reference rate and tell the client why.
    res.json({
      usd: FIXED_USD,
      vnd: FIXED_VND,
      source: 'fixed',
      fallback: true,
      reason: err?.message || 'Không lấy được giá',
      updatedAt: Date.now(),
    })
  }
})

// --- Encrypted cloud backup -------------------------------------------------
// Payloads are AES-GCM ciphertext produced on the device from a key derived
// from the wallet secret. The server stores bytes it cannot read.

function normalizeAddress(value) {
  return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) ? value : null
}

app.get('/api/backup/:address', (req, res) => {
  const address = normalizeAddress(req.params.address)
  if (!address) {
    res.status(400).json({ error: 'Địa chỉ không hợp lệ' })
    return
  }
  const record = getState().backups[address]
  if (!record) {
    res.status(404).json({ error: 'Chưa có bản sao lưu cho ví này' })
    return
  }
  res.json(record)
})

app.put('/api/backup/:address', (req, res) => {
  const address = normalizeAddress(req.params.address)
  if (!address) {
    res.status(400).json({ error: 'Địa chỉ không hợp lệ' })
    return
  }
  const { ciphertext, iv, version, label } = req.body || {}
  if (typeof ciphertext !== 'string' || typeof iv !== 'string') {
    res.status(400).json({ error: 'Bản sao lưu không hợp lệ' })
    return
  }
  if (ciphertext.length > 900000) {
    res.status(413).json({ error: 'Bản sao lưu quá lớn' })
    return
  }
  const state = getState()
  state.backups[address] = {
    ciphertext,
    iv,
    version: Number(version) || 1,
    label: typeof label === 'string' ? label.slice(0, 60) : '',
    updatedAt: Date.now(),
  }
  save()
  res.json({ ok: true, updatedAt: state.backups[address].updatedAt })
})

app.delete('/api/backup/:address', (req, res) => {
  const address = normalizeAddress(req.params.address)
  if (!address) {
    res.status(400).json({ error: 'Địa chỉ không hợp lệ' })
    return
  }
  delete getState().backups[address]
  save()
  res.json({ ok: true })
})

load()

const server = http.createServer(app)
startWatcher(server)
startAirdropCron()

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] Cloud Pay Wallet API on :${PORT} — default RPC ${DEFAULT_RPC}`)
})
