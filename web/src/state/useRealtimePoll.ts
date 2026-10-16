import { useEffect, useRef } from 'react'
import { TxEntry, PriceInfo, AirdropInfo } from '../lib/solana'

export type SyncResponse = {
  address: string
  usdcBalance: number
  solBalance: number
  decimals: number
  transactions: TxEntry[]
  newCount: number
  airdrop: {
    status: AirdropInfo['status']
    address: string
    signature: string | null
    confirmedAt: number | null
    error: string | null
  }
  price: PriceInfo
  at: number
}

type Options = {
  rpcUrl: string
  address: string | null
  priceEndpoint?: string
  telegramId?: string | null
  enabled: boolean
  onResult: (data: SyncResponse) => void
}

/**
 * Unified sync polling — hits the server's /api/sync endpoint every 5 seconds.
 * The server merges balance + history + airdrop status + price into one
 * response so the client makes a single request instead of multiple polls.
 */
export function useRealtimePoll({ rpcUrl, address, priceEndpoint, telegramId, enabled, onResult }: Options) {
  const handler = useRef(onResult)
  handler.current = onResult

  useEffect(() => {
    if (!enabled || !address) return

    let cancelled = false
    let timer: number | undefined

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address, rpcUrl, priceEndpoint, telegramId }),
        })
        if (cancelled || !res.ok) return
        const data: SyncResponse = await res.json()
        if (!cancelled && data.address === address) handler.current(data)
      } catch {
        /* network hiccup — next tick retries */
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 5000)
      }
    }

    void poll()

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled, address, rpcUrl, priceEndpoint, telegramId])
}
