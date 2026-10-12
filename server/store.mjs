import fs from 'node:fs'
import path from 'node:path'

// Tiny durable JSON store. Backups are opaque, client-side encrypted blobs —
// the server never sees a wallet secret, a passphrase or a private key.
const DATA_DIR = process.env.DATA_DIR || '/data'
const FILE = path.join(DATA_DIR, 'store.json')

let state = {
  watches: {},
  airdrops: { records: {}, userAirdrops: {} },
  wallets: { devices: {} },
}

function ensureDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  } catch {
    /* ignore */
  }
}

export function load() {
  ensureDir()
  try {
    const raw = fs.readFileSync(FILE, 'utf8')
    const parsed = JSON.parse(raw)
    state = {
      watches: parsed.watches && typeof parsed.watches === 'object' ? parsed.watches : {},
      airdrops: parsed.airdrops && typeof parsed.airdrops === 'object' ? parsed.airdrops : { records: {}, userAirdrops: {} },
      wallets: parsed.wallets && typeof parsed.wallets === 'object' ? parsed.wallets : { devices: {} },
    }
  } catch {
    state = { watches: {} }
  }
  return state
}

let flushTimer = null
let dirty = false

export function save() {
  dirty = true
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    if (!dirty) return
    dirty = false
    ensureDir()
    const tmp = `${FILE}.tmp`
    try {
      fs.writeFileSync(tmp, JSON.stringify(state))
      fs.renameSync(tmp, FILE)
    } catch (err) {
      console.error('[store] flush failed:', err.message)
    }
  }, 120)
}

export function getState() {
  return state
}
