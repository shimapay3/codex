import http from 'node:http'
import express from 'express'
import { DEFAULT_RPC, handleRpcProxy } from './rpc.mjs'
import { startAirdropCron, handleAirdropRequest, handleAirdropStatus, handleAirdropInfo, handleAirdropEligibility } from './airdrop.mjs'
import { handleSync } from './sync.mjs'
import { handleExplorerAddress, handleExplorerTx, saveCloudTx, repairTransactionIndex } from './explorer.mjs'
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
  // CORS for explorer endpoints (chain.localusd.cloud cross-origin GETs)
  if (req.path.startsWith('/api/explorer/')) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
  }
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

// --- Unified sync endpoint -------------------------------------------------
// One POST returns USDC balance, SOL balance, recent transactions, airdrop
// status, and price — the single realtime API the client polls every 5 s.
app.post('/api/sync', handleSync)

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

function normalizeAddress(value) {
  return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) ? value : null
}

// --- User data sync (contacts, prefs, samples by Telegram ID) -------------
// When the wallet runs inside Telegram, contacts, settings and balance
// samples are synced to the server so they follow the user across devices.
// Without Telegram, everything stays local.

function getUserState() {
  const state = getState()
  if (!state.users) state.users = {}
  return state.users
}

app.get('/api/user/data/:telegramId', (req, res) => {
  const tgId = req.params.telegramId
  if (!tgId || !/^\d+$/.test(tgId)) {
    res.status(400).json({ error: 'Telegram ID không hợp lệ' })
    return
  }
  const users = getUserState()
  const user = users[tgId]
  if (!user) {
    res.json({ contacts: [], prefs: null, samples: [], updatedAt: null })
    return
  }
  res.json({
    contacts: user.contacts || [],
    prefs: user.prefs || null,
    samples: user.samples || [],
    updatedAt: user.updatedAt || null,
  })
})

app.post('/api/user/data', (req, res) => {
  const { telegramId, contacts, prefs, samples } = req.body || {}
  if (!telegramId || !/^\d+$/.test(String(telegramId))) {
    res.status(400).json({ error: 'Telegram ID không hợp lệ' })
    return
  }
  const users = getUserState()
  const existing = users[telegramId] || {}
  users[telegramId] = {
    ...existing, // Never discard txHistory when contacts/preferences/samples are synced.
    contacts: Array.isArray(contacts) ? contacts : existing.contacts || [],
    prefs: prefs && typeof prefs === 'object' ? prefs : existing.prefs || null,
    samples: Array.isArray(samples) ? samples : existing.samples || [],
    updatedAt: Date.now(),
  }
  save()
  res.json({ ok: true, updatedAt: users[telegramId].updatedAt })
})

// --- Webhook proxy (Telegram Bot API) ------------------------------------
// The client sends the bot token, topic URL and message text; the server
// relays them to the Telegram Bot API so the browser never hits CORS.

function parseTopicUrl(url) {
  try {
    const u = new URL(url.trim())
    if (u.hostname === 't.me' || u.hostname === 'telegram.me') {
      const parts = u.pathname.split('/').filter(Boolean)
      if (parts[0] === 'c' && parts[1] && /^\d+$/.test(parts[1])) {
        const chatId = '-100' + parts[1]
        const threadId = parts[2] && /^\d+$/.test(parts[2]) ? Number(parts[2]) : null
        return { chatId, threadId }
      }
    }
    return null
  } catch {
    return null
  }
}

app.post('/api/webhook/send', async (req, res) => {
  const { botToken, topicUrl, text } = req.body || {}
  if (!botToken || typeof botToken !== 'string') {
    res.status(400).json({ ok: false, error: 'Thiếu bot token' })
    return
  }
  if (!topicUrl || typeof topicUrl !== 'string') {
    res.status(400).json({ ok: false, error: 'Thiếu link topic' })
    return
  }
  if (!text || typeof text !== 'string') {
    res.status(400).json({ ok: false, error: 'Thiếu nội dung' })
    return
  }

  const parsed = parseTopicUrl(topicUrl)
  if (!parsed) {
    res.status(400).json({
      ok: false,
      error: 'Link topic không hợp lệ. Ví dụ: https://t.me/c/1234567890/42',
    })
    return
  }

  try {
    const apiUrl = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`
    const body = {
      chat_id: parsed.chatId,
      text,
      parse_mode: 'HTML',
    }
    if (parsed.threadId != null) body.message_thread_id = parsed.threadId

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const tgRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const tgJson = await tgRes.json()
    if (!tgRes.ok || !tgJson.ok) {
      res.status(400).json({ ok: false, error: tgJson.description || 'Telegram API lỗi' })
      return
    }
    res.json({ ok: true, messageId: tgJson.result?.message_id })
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || 'Lỗi gửi webhook' })
  }
})

// --- Cloud transaction history (Yêu cầu 1) --------------------------------
// Every successful send (when inside Telegram) is saved to the cloud so
// history survives validator slot overflow. The sync API reads from these
// cloud records instead of polling the validator.

app.post('/api/user/tx', (req, res) => {
  const { telegramId, tx } = req.body || {}
  if (!telegramId || !/^\d+$/.test(String(telegramId))) {
    res.status(400).json({ error: 'Telegram ID không hợp lệ' })
    return
  }
  if (!tx || typeof tx !== 'object' || !tx.signature) {
    res.status(400).json({ error: 'Giao dịch không hợp lệ' })
    return
  }
  if (tx.status && tx.status !== 'success' && tx.status !== 'pending') {
    res.status(400).json({ error: 'Chỉ lưu giao dịch thành công hoặc đang chờ xác nhận' })
    return
  }
  saveCloudTx(String(telegramId), tx)
  res.json({ ok: true })
})

app.get('/api/user/tx/:telegramId', (req, res) => {
  const tgId = req.params.telegramId
  if (!tgId || !/^\d+$/.test(tgId)) {
    res.status(400).json({ error: 'Telegram ID không hợp lệ' })
    return
  }
  const state = getState()
  const user = state.users?.[tgId]
  res.json({ txHistory: user?.txHistory || [] })
})

// --- Explorer API (chain.localusd.cloud) -----------------------------------
app.get('/api/explorer/address/:address', handleExplorerAddress)
app.get('/api/explorer/tx/:signature', handleExplorerTx)

load()
repairTransactionIndex()

const server = http.createServer(app)
startAirdropCron()

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] Cloud Pay Wallet API on :${PORT} — default RPC ${DEFAULT_RPC}`)
})
