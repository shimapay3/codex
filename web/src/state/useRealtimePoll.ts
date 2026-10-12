import { useCallback, useEffect, useRef } from 'react'
import { rpcFetch, TxEntry, USDC_DECIMALS_FALLBACK } from '../lib/solana'

type RealtimeResponse = {
  address: string
  usdcBalance: number
  solBalance: number
  decimals: number
  transactions: TxEntry[]
  newCount: number
  at: number
}

type Options = {
  rpcUrl: string
  address: string | null
  enabled: boolean
  onResult: (data: RealtimeResponse) => void
}

/**
 * Unified realtime polling — hits the server's /api/realtime endpoint every
 * 5 seconds. The server merges balance + history into one response so the
 * client makes a single request instead of multiple parallel calls.
 */
export function useRealtimePoll({ rpcUrl, address, enabled, onResult }: Options) {
  const handler = useRef(onResult)
  handler.current = onResult

  useEffect(() => {
    if (!enabled || !address) return

    let cancelled = false
    let timer: number | undefined

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch('/api/realtime', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ address, rpcUrl }),
        })
        if (cancelled || !res.ok) return
        const data: RealtimeResponse = await res.json()
        handler.current(data)
      } catch {
        /* network hiccup — next tick retries */
      }
    }

    void poll()
    timer = window.setInterval(poll, 5000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled, address, rpcUrl])
}
