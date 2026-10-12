import http from 'node:http'
import express from 'express'
import { DEFAULT_RPC, handleRpcProxy } from './rpc.mjs'
import { startWatcher } from './watcher.mjs'
import { startAirdropCron, handleAirdropRequest, handleAirdropStatus, handleAirdropInfo, handleAirdropEligibility } from './airdrop.mjs'
import { handleRealtime } from './realtime.mjs'
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

app.post('/api/airdrop/request', handleAirdropRequest)
app.get('/api/airdrop/eligibility/:telegramId', handleAirdropEligibility)
app.get('/api/airdrop/status/:address', handleAirdropStatus)
app.get('/api/airdrop/info', handleAirdropInfo)

// --- Unified realtime endpoint -------------------------------------------
// One POST returns USDC balance, SOL balance, and recent transactions.
// The client polls this every 5 s instead of multiple separate calls.
app.post('/api/realtime', handleRealtime)

// --- Wallet creation limit (max 5 per device) -------------------------------
// Each device is identified by a client-generated ID stored in localStorage.
// The server tracks wallet addresses per device and rejects creation beyond
// the limit. IP is recorded as a secondary identifier for abuse detection.

const MAX_WALLETS_PER_DEVICE = 5

function getWalletState() {
  const state = getState()
  if (!state.wallets) state.wallets = { devices: {} }
  if (!state.wallets.devices) state.wallets.devices = {}
  return state.wallets
}

app.get('/api/wallet/count/:deviceId', (req, res) => {
  const deviceId = req.params.deviceId
  if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 200) {
    res.status(400).json({ error: 'Device ID không hợp lệ' })
    return
  }
  const ws = getWalletState()
  const device = ws.devices[deviceId]
  const count = Array.isArray(device?.addresses) ? device.addresses.length : 0
  res.json({ count, limit: MAX_WALLETS_PER_DEVICE, canCreate: count < MAX_WALLETS_PER_DEVICE })
})

app.post('/api/wallet/register', (req, res) => {
  const { deviceId, address } = req.body || {}
  if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 200) {
    res.status(400).json({ error: 'Device ID không hợp lệ' })
    return
  }
  const addr = normalizeAddress(address)
  if (!addr) {
    res.status(400).json({ error: 'Địa chỉ ví không hợp lệ' })
    return
  }

  const ip = req.ip || req.socket?.remoteAddress || 'unknown'
  const ws = getWalletState()

  if (!ws.devices[deviceId]) {
    ws.devices[deviceId] = { addresses: [], createdAt: Date.now(), ip }
  }
  const device = ws.devices[deviceId]

  if (!device.addresses.includes(addr)) {
    if (device.addresses.length >= MAX_WALLETS_PER_DEVICE) {
      res.status(403).json({
        error: `Đã đạt giới hạn ${MAX_WALLETS_PER_DEVICE} ví cho thiết bị này`,
        count: device.addresses.length,
        limit: MAX_WALLETS_PER_DEVICE,
        canCreate: false,
      })
      return
    }
    device.addresses.push(addr)
    save()
  }

  res.json({
    count: device.addresses.length,
    limit: MAX_WALLETS_PER_DEVICE,
    canCreate: device.addresses.length < MAX_WALLETS_PER_DEVICE,
  })
})

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

// --- Telegram ID-based cloud backup -----------------------------------------
// Backups are stored by Telegram user ID and encrypted client-side with a key
// derived from the Telegram user ID. This allows wallet state restoration
// with just a Telegram login — no wallet secret needed.

function normalizeTelegramId(value) {
  return typeof value === 'string' && /^\d{1,20}$/.test(value) ? value : null
}

app.get('/api/tg-backup/:telegramId', (req, res) => {
  const tgId = normalizeTelegramId(req.params.telegramId)
  if (!tgId) {
    res.status(400).json({ error: 'Telegram ID không hợp lệ' })
    return
  }
  const state = getState()
  if (!state.tgBackups) state.tgBackups = {}
  const record = state.tgBackups[tgId]
  if (!record) {
    res.status(404).json({ error: 'Chưa có bản sao lưu cho Telegram ID này' })
    return
  }
  res.json(record)
})

app.put('/api/tg-backup/:telegramId', (req, res) => {
  const tgId = normalizeTelegramId(req.params.telegramId)
  if (!tgId) {
    res.status(400).json({ error: 'Telegram ID không hợp lệ' })
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
  if (!state.tgBackups) state.tgBackups = {}
  state.tgBackups[tgId] = {
    ciphertext,
    iv,
    version: Number(version) || 1,
    label: typeof label === 'string' ? label.slice(0, 60) : '',
    updatedAt: Date.now(),
  }
  save()
  res.json({ ok: true, updatedAt: state.tgBackups[tgId].updatedAt })
})

app.delete('/api/tg-backup/:telegramId', (req, res) => {
  const tgId = normalizeTelegramId(req.params.telegramId)
  if (!tgId) {
    res.status(400).json({ error: 'Telegram ID không hợp lệ' })
    return
  }
  const state = getState()
  if (!state.tgBackups) state.tgBackups = {}
  delete state.tgBackups[tgId]
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
