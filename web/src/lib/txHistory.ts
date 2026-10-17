import type { TxEntry } from './solana'

/** Latest authoritative values win, except stale pending must not undo confirmation. */
export function mergeTxHistory(previous: TxEntry[], incoming: TxEntry[]): TxEntry[] {
  const records = new Map(previous.map((tx) => [tx.signature, tx]))
  for (const tx of incoming) {
    const old = records.get(tx.signature)
    if (old && old.status !== 'pending' && tx.status === 'pending') continue
    const merged = { ...old, ...tx }
    // The sender's wall-clock time beats the (skewed) chain clock.
    if (old?.clientTime && !tx.clientTime) { merged.blockTime = old.blockTime; merged.clientTime = true }
    records.set(tx.signature, merged)
  }
  return [...records.values()].sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0) || b.slot - a.slot)
}

export function historyKey(rpcUrl: string, address: string): string {
  return `${rpcUrl.replace(/\/+$/, '')}|${address}`
}
