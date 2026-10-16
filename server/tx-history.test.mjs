import test from 'node:test'
import assert from 'node:assert/strict'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { USDC_MINT, projectWalletTx, mergeTransactions, parseUsdcTransaction, collectRpcHistory } from './tx-history.mjs'

const A = '11111111111111111111111111111111'
const B = 'So11111111111111111111111111111111111111112'
const record = { signature: 's1', walletAddress: A, counterparty: B, direction: 'out', amount: 12.123456789, status: 'success', blockTime: 100 }
const balance = (accountIndex, owner, raw) => ({ accountIndex, owner, mint: USDC_MINT, uiTokenAmount: { amount: String(raw), decimals: 9, uiAmountString: null } })
function transaction(before = '1000000000000000000', after = '999999999999999999') {
  return {
    slot: 42, blockTime: 100, transaction: { message: { accountKeys: [A, B], instructions: [] } },
    meta: { fee: 5000, err: null, preTokenBalances: [balance(0, A, before), balance(1, B, 0)], postTokenBalances: [balance(0, A, after), balance(1, B, BigInt(before) - BigInt(after))] },
  }
}

test('same transfer is outgoing for sender and incoming for receiver, without mutating stored data', () => {
  const snapshot = JSON.stringify(record)
  assert.equal(projectWalletTx(record, A).direction, 'out')
  const received = projectWalletTx(record, B)
  assert.equal(received.direction, 'in')
  assert.equal(received.counterparty, A)
  assert.equal(received.walletAddress, B)
  assert.equal(JSON.stringify(record), snapshot)
  assert.equal(projectWalletTx(record, 'unrelated'), null)
})

test('receiver-originated records invert correctly; self transfers are not a credit or debit', () => {
  const incoming = { ...record, walletAddress: B, counterparty: A, direction: 'in' }
  assert.equal(projectWalletTx(incoming, A).direction, 'out')
  assert.equal(projectWalletTx({ ...record, counterparty: A }, A).direction, 'self')
})

test('cloud + RPC merge retains older history beyond 50, deduplicates, and lets RPC correct direction', () => {
  const old = Array.from({ length: 75 }, (_, i) => ({ ...record, signature: `s${i}`, blockTime: i }))
  const merged = mergeTransactions(old, [{ ...record, direction: 'in', blockTime: 100 }])
  assert.equal(merged.length, 75)
  assert.equal(merged[0].direction, 'in')
})

test('pending cannot overwrite confirmed; confirmed can replace pending', () => {
  assert.equal(mergeTransactions([record], [{ ...record, status: 'pending' }])[0].status, 'success')
  assert.equal(mergeTransactions([{ ...record, status: 'pending' }], [record])[0].status, 'success')
})

test('integer token deltas preserve one base-unit transfer on a billion-USDC balance', () => {
  const tx = transaction()
  const sent = parseUsdcTransaction(tx, 's', A)
  const received = parseUsdcTransaction(tx, 's', B)
  assert.equal(sent.direction, 'out')
  assert.equal(sent.amount, 0.000000001)
  assert.equal(received.direction, 'in')
  assert.equal(received.amount, sent.amount)
  assert.equal(sent.counterparty, B)
  assert.equal(received.counterparty, A)
})

test('owner missing on pre/post is recovered by account index, including closed token accounts', () => {
  const tx = transaction('10000000000', '0')
  delete tx.meta.preTokenBalances[0].owner
  assert.equal(parseUsdcTransaction(tx, 's', A).direction, 'out')
  tx.meta.preTokenBalances[0].owner = A
  tx.meta.postTokenBalances = [tx.meta.postTokenBalances[1]]
  assert.equal(parseUsdcTransaction(tx, 's', A).amount, 10)
})

test('ATA ownership is usable when RPC omits owner metadata entirely', () => {
  const tx = transaction('2000000000', '1000000000')
  delete tx.meta.preTokenBalances[0].owner
  delete tx.meta.postTokenBalances[0].owner
  tx.transaction.message.accountKeys[0] = 'owned-ata'
  assert.equal(parseUsdcTransaction(tx, 's', A, ['owned-ata']).amount, 1)
})

test('counterparty comes from the opposing delta, not first unrelated token owner', () => {
  const tx = transaction('2000000000', '1000000000')
  tx.meta.preTokenBalances.unshift(balance(2, 'unrelated', 123))
  tx.meta.postTokenBalances.unshift(balance(2, 'unrelated', 123))
  assert.equal(parseUsdcTransaction(tx, 's', A).counterparty, B)
})

test('SOL-only and zero-token-delta transactions do not contaminate USDC history', () => {
  assert.equal(parseUsdcTransaction(transaction('123', '123'), 's', A), null)
})

test('owner and Token-2022 ATA are queried together even when both return non-empty lists', async () => {
  const ata = (await getAssociatedTokenAddress(new PublicKey(USDC_MINT), new PublicKey(A), false, TOKEN_2022_PROGRAM_ID)).toBase58()
  const queried = new Set()
  const rpc = async (_url, method, params) => {
    if (method === 'getTokenAccountsByOwner') return { value: [] }
    if (method === 'getSignaturesForAddress') {
      queried.add(params[0])
      return [{ signature: params[0] === A ? 'owner-send' : 'ata-receive', slot: 42 }]
    }
    if (method === 'getTransaction') return params[0] === 'owner-send' ? transaction('2000000000', '1000000000') : transaction('1000000000', '2000000000')
  }
  const entries = await collectRpcHistory('mock', A, rpc)
  assert.deepEqual(queried, new Set([A, ata]))
  assert.equal(entries.length, 2)
  assert.deepEqual(new Set(entries.map((t) => t.direction)), new Set(['in', 'out']))
})

test('signature pagination follows before cursor, deduplicates overlapping indexes, and keeps all pages', async () => {
  const cursors = []
  const rpc = async (_url, method, params) => {
    if (method === 'getTokenAccountsByOwner') return { value: [] }
    if (method === 'getSignaturesForAddress') {
      cursors.push(params[1].before)
      return params[1].before ? [{ signature: 'third', slot: 1 }] : [{ signature: 'first', slot: 3 }, { signature: 'second', slot: 2 }]
    }
    if (method === 'getTransaction') return transaction('2000000000', '1000000000')
  }
  const entries = await collectRpcHistory('mock', A, rpc, new Map(), 2)
  assert.equal(entries.length, 3)
  assert.ok(cursors.includes('second'))
})

test('one failed signature index does not discard transactions from the other', async () => {
  const rpc = async (_url, method, params) => {
    if (method === 'getTokenAccountsByOwner') return { value: [] }
    if (method === 'getSignaturesForAddress') {
      if (params[0] === A) throw new Error('node index unavailable')
      return [{ signature: 'still-visible', slot: 1 }]
    }
    if (method === 'getTransaction') return transaction('2000000000', '1000000000')
  }
  assert.equal((await collectRpcHistory('mock', A, rpc)).length, 1)
})
