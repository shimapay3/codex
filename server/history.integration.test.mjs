import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { USDC_MINT } from './tx-history.mjs'

const A = '11111111111111111111111111111111'
const B = 'So11111111111111111111111111111111111111112'
const C = 'SysvarRent111111111111111111111111111111111'
const base = { walletAddress: A, walletName: 'Isolated test', counterparty: B, direction: 'out', amount: 10.123456789, decimals: 9, fee: 0.000005, tokenSymbol: 'USDC', status: 'success', memo: 'test', slot: 10, blockTime: 100 }
const bal = (accountIndex, owner, raw) => ({ accountIndex, owner, mint: USDC_MINT, uiTokenAmount: { amount: String(raw), decimals: 9 } })
const tx = (incoming) => ({ slot: 200, blockTime: 200, transaction: { message: { accountKeys: [A, B], instructions: [] } }, meta: { err: null, fee: 5000, preTokenBalances: [bal(0, A, 100000000000), bal(1, B, 100000000000)], postTokenBalances: [bal(0, A, incoming ? 105000000000 : 97000000000), bal(1, B, incoming ? 95000000000 : 103000000000)] } })

test('isolated API: Telegram/non-Telegram history, persistence, and index recovery', { timeout: 30000 }, async (t) => {
  // This whole database belongs to this test. No application/user database is loaded.
  const dir = await mkdtemp(join(tmpdir(), 'cloudpay-history-test-'))
  const rpc = http.createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const { method, params = [], id } = JSON.parse(raw)
    const result = method === 'getTokenAccountsByOwner' ? { value: [] }
      : method === 'getSignaturesForAddress' ? [{ signature: [A, B, C].includes(params[0]) ? 'owner-sent' : 'ata-received', slot: 200, blockTime: 200 }]
      : method === 'getTransaction' ? tx(params[0] === 'ata-received')
      : method === 'getBalance' ? { value: 0 }
      : method === 'getTokenAccountBalance' ? { value: { amount: '0', decimals: 9 } }
      : method === 'getSignatureStatuses' ? { value: [{ confirmationStatus: 'confirmed', slot: 200, err: null }] }
      : null
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result }))
  })
  rpc.listen(0, '127.0.0.1')
  await once(rpc, 'listening')
  const rpcUrl = `http://127.0.0.1:${rpc.address().port}`
  const initial = Array.from({ length: 76 }, (_, i) => ({ ...base, signature: `archived-${i}`, blockTime: i }))
  await writeFile(join(dir, 'store.json'), JSON.stringify({
    users: { '123456': { contacts: [], prefs: null, samples: [], txHistory: initial }, '654321': { contacts: [], prefs: null, samples: [] } },
    wallets: { devices: { 'tg-654321': { addresses: [B] } } },
    txIndex: { byAddress: {}, bySignature: { 'index-only': { ...base, signature: 'index-only' }, 'sol-only': { ...base, signature: 'sol-only', tokenSymbol: 'SOL' } } },
    airdrops: { records: {}, userAirdrops: {} },
  }))
  const portProbe = http.createServer().listen(0, '127.0.0.1')
  await once(portProbe, 'listening')
  const port = portProbe.address().port
  await new Promise((resolve) => portProbe.close(resolve))
  const child = spawn(process.execPath, ['index.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, DATA_DIR: dir, PORT: String(port), DEFAULT_RPC_URL: rpcUrl, AIRDROP_CRON_MS: '86400000', SOLANA_KEYPAIR_PATH: join(dir, 'keypair.json') }, stdio: 'pipe' })
  let logs = ''
  child.stdout.on('data', (b) => { logs += b })
  child.stderr.on('data', (b) => { logs += b })
  const url = `http://127.0.0.1:${port}`
  const post = async (path, body) => {
    const res = await fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal(res.status, 200, `${path}: ${await res.clone().text()}`)
    return res.json()
  }
  try {
    let ready = false
    for (let i = 0; i < 50; i++) {
      try { ready = (await fetch(url + '/health')).ok } catch {}
      if (ready) break
      await new Promise((r) => setTimeout(r, 100))
    }
    assert.ok(ready, logs)
    await t.test('all archived and new RPC records are merged in BOTH Telegram modes', async () => {
      for (const telegramId of [undefined, '123456']) {
        const sender = await post('/api/sync', { address: A, telegramId, rpcUrl })
        const receiver = await post('/api/sync', { address: B, telegramId, rpcUrl })
        assert.equal(sender.transactions.length, 79)
        assert.equal(receiver.transactions.length, 79)
        assert.equal(sender.transactions.find((tx) => tx.signature === 'archived-0').direction, 'out')
        const received = receiver.transactions.find((tx) => tx.signature === 'archived-0')
        assert.equal(received.direction, 'in')
        assert.equal(received.counterparty, A)
        assert.equal(sender.transactions.find((tx) => tx.signature === 'owner-sent').direction, 'out')
        assert.equal(sender.transactions.find((tx) => tx.signature === 'ata-received').direction, 'in')
        assert.equal(new Set(sender.transactions.map((tx) => tx.signature)).size, sender.transactions.length)
        assert.ok(sender.transactions.every((tx) => tx.tokenSymbol !== 'SOL'))
      }
    })
    await t.test('startup recovers erased user history only from explicitly registered wallet ownership', async () => {
      const recovered = await (await fetch(url + '/api/user/tx/654321')).json()
      assert.equal(recovered.txHistory.length, 78)
      assert.ok(recovered.txHistory.some((tx) => tx.signature === 'index-only'))
    })
    await t.test('actual save -> preferences sync -> history read preserves transactions and upgrades pending', async () => {
      const added = { ...base, signature: 'created-through-api', status: 'pending' }
      await post('/api/user/tx', { telegramId: '123456', tx: added })
      await post('/api/user/tx', { telegramId: '123456', tx: { ...added, status: 'success', slot: 301 } })
      await post('/api/user/data', { telegramId: '123456', contacts: [], prefs: { fiat: 'both' }, samples: [] })
      const stored = await (await fetch(url + '/api/user/tx/123456')).json()
      assert.equal(stored.txHistory.length, 77)
      assert.equal(stored.txHistory.find((tx) => tx.signature === added.signature).status, 'success')
      const history = await post('/api/sync', { address: B, telegramId: '123456', rpcUrl })
      assert.equal(history.transactions.find((tx) => tx.signature === added.signature).direction, 'in')
    })
    await t.test('explorer projection matches wallet history and never flips the stored sender record', async () => {
      const explorer = await (await fetch(url + '/api/explorer/address/' + B)).json()
      assert.ok(explorer.transactions.length > 50)
      assert.equal(explorer.transactions.find((tx) => tx.signature === 'archived-0').direction, 'in')
      const raw = await (await fetch(url + '/api/explorer/tx/archived-0')).json()
      assert.equal(raw.direction, 'out')
      assert.equal(raw.walletAddress, A)
      const viewed = await (await fetch(url + '/api/explorer/tx/archived-0?address=' + B)).json()
      assert.equal(viewed.direction, 'in')
      const unrelated = await post('/api/sync', { address: C, rpcUrl })
      assert.equal(unrelated.transactions.length, 0)
    })
  } finally {
    child.kill('SIGTERM')
    await once(child, 'exit').catch(() => {})
    await new Promise((resolve) => rpc.close(resolve))
    await rm(dir, { recursive: true, force: true })
  }
})
