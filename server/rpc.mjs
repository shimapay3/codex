// JSON-RPC proxy. The browser talks to our API (same origin) so the wallet
// works no matter what CORS policy the configured RPC endpoint uses, and the
// endpoint itself stays swappable at runtime from the app's Settings screen.
export const DEFAULT_RPC = process.env.DEFAULT_RPC_URL || 'https://rpc.dolaxanh.com'

const MAX_BODY = 1024 * 512

function sanitizeRpcUrl(raw) {
  if (!raw || typeof raw !== 'string') return DEFAULT_RPC
  let value = raw.trim()
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_RPC
    return url.toString().replace(/\/+$/, '') || DEFAULT_RPC
  } catch {
    return DEFAULT_RPC
  }
}

export function rpcUrlFromRequest(req) {
  const header = req.get('x-rpc-url')
  return sanitizeRpcUrl(header || DEFAULT_RPC)
}

export async function rpcCall(url, payload, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(sanitizeRpcUrl(url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`RPC trả về dữ liệu không hợp lệ (HTTP ${res.status})`)
    }
    return json
  } finally {
    clearTimeout(timer)
  }
}

export async function rpcMethod(url, method, params, timeoutMs) {
  const json = await rpcCall(url, { jsonrpc: '2.0', id: 1, method, params }, timeoutMs)
  if (json?.error) throw new Error(json.error.message || 'RPC error')
  return json?.result
}

export async function handleRpcProxy(req, res) {
  const body = req.body
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Body JSON-RPC không hợp lệ' })
    return
  }
  const raw = JSON.stringify(body)
  if (raw.length > MAX_BODY) {
    res.status(413).json({ error: 'Payload quá lớn' })
    return
  }
  try {
    const json = await rpcCall(rpcUrlFromRequest(req), body)
    res.json(json)
  } catch (err) {
    res.status(502).json({
      error: { code: -32000, message: err?.message || 'Không kết nối được RPC' },
    })
  }
}

export { sanitizeRpcUrl }
