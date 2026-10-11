import { WebSocketServer } from 'ws'
import { rpcMethod, sanitizeRpcUrl } from './rpc.mjs'
import { getState, save } from './store.mjs'

// Real-time security notifications: every connected client subscribes with the
// addresses it currently watches. We poll `getSignaturesForAddress` per address
// and push a lightweight event the moment a new signature shows up, so the
// device can ring, buzz and show a system notification without the wallet
// holding an open connection to the RPC endpoint itself.
const POLL_MS = Number(process.env.WATCH_POLL_MS || 12000)

/** @type {Map<string, {rpcUrl:string,address:string,last:string|null,refs:number}>} */
const subscriptions = new Map()

function key(rpcUrl, address) {
  return `${rpcUrl}||${address}`
}

let wss = null

function push(entry, message) {
  if (!wss) return
  for (const client of wss.clients) {
    if (client.readyState !== 1) continue
    if (!client.subscribed?.has(key(entry.rpcUrl, entry.address))) continue
    try {
      client.send(JSON.stringify(message))
    } catch {
      /* ignore dead socket */
    }
  }
}

async function pollOne(entry) {
  try {
    const result = await rpcMethod(
      entry.rpcUrl,
      'getSignaturesForAddress',
      [entry.address, { limit: 8 }],
      12000,
    )
    if (!Array.isArray(result) || result.length === 0) return
    const newest = result[0]?.signature
    if (!newest) return

    const persisted = getState().watches[key(entry.rpcUrl, entry.address)]
    const baseline = entry.last ?? persisted ?? null

    if (!baseline) {
      // First successful poll only records a baseline — never notify for history.
      entry.last = newest
      getState().watches[key(entry.rpcUrl, entry.address)] = newest
      save()
      return
    }
    if (baseline === newest) return

    const seen = new Set()
    const fresh = []
    for (const item of result) {
      if (!item?.signature || item.signature === baseline) break
      if (seen.has(item.signature)) continue
      seen.add(item.signature)
      // Skip transactions that failed on-chain — nothing arrived.
      if (item.err) continue
      fresh.push({
        signature: item.signature,
        slot: item.slot,
        blockTime: item.blockTime || null,
        memo: item.memo || null,
      })
    }
    entry.last = newest
    getState().watches[key(entry.rpcUrl, entry.address)] = newest
    save()

    if (fresh.length) {
      push(entry, {
        type: 'payment',
        address: entry.address,
        rpcUrl: entry.rpcUrl,
        items: fresh.slice(0, 6),
        at: Date.now(),
      })
    }
  } catch {
    // Network hiccups are expected — the next tick retries.
  }
}

let ticking = false
async function tick() {
  if (ticking) return
  ticking = true
  try {
    await Promise.all([...subscriptions.values()].map((entry) => pollOne(entry)))
  } finally {
    ticking = false
  }
}

let timer = null

export function startWatcher(server) {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (socket) => {
    socket.subscribed = new Set()
    socket.isAlive = true
    socket.on('pong', () => {
      socket.isAlive = true
    })

    socket.on('message', (raw) => {
      let msg
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      if (msg?.type !== 'subscribe') return
      const rpcUrl = sanitizeRpcUrl(msg.rpcUrl)
      const addresses = Array.isArray(msg.addresses) ? msg.addresses : []

      // Release previous subscriptions held by this socket.
      for (const k of socket.subscribed) {
        const entry = subscriptions.get(k)
        if (entry) {
          entry.refs -= 1
          if (entry.refs <= 0) subscriptions.delete(k)
        }
      }
      socket.subscribed = new Set()

      for (const address of addresses) {
        if (typeof address !== 'string' || address.length < 32 || address.length > 44) continue
        const k = key(rpcUrl, address)
        socket.subscribed.add(k)
        const existing = subscriptions.get(k)
        if (existing) {
          existing.refs += 1
        } else {
          subscriptions.set(k, { rpcUrl, address, last: null, refs: 1 })
        }
      }
      socket.send(JSON.stringify({ type: 'subscribed', count: socket.subscribed.size }))
      // Give an immediate baseline so the first real payment rings right away.
      tick()
    })

    socket.on('close', () => {
      for (const k of socket.subscribed || []) {
        const entry = subscriptions.get(k)
        if (!entry) continue
        entry.refs -= 1
        if (entry.refs <= 0) subscriptions.delete(k)
      }
    })
  })

  timer = setInterval(tick, POLL_MS)
  timer.unref?.()

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate()
        continue
      }
      socket.isAlive = false
      try {
        socket.ping()
      } catch {
        /* ignore */
      }
    }
  }, 30000)
  heartbeat.unref?.()

  console.log(`[watcher] listening on /ws (poll ${POLL_MS}ms)`)
  return wss
}
