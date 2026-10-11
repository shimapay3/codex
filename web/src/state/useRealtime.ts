import { useEffect, useRef, useState } from 'react'

export type PaymentEvent = {
  address: string
  signature: string
  slot: number
  blockTime: number | null
  memo: string | null
}

type Options = {
  rpcUrl: string
  addresses: string[]
  enabled: boolean
  onPayment: (events: PaymentEvent[]) => void
}

/**
 * Keeps a live push channel open so an incoming transfer rings on the device
 * the moment the network sees it. Falls back to polling when the socket cannot
 * be established.
 */
export function useRealtime({ rpcUrl, addresses, enabled, onPayment }: Options) {
  const [connected, setConnected] = useState(false)
  const handler = useRef(onPayment)
  handler.current = onPayment

  const key = addresses.join(',')

  useEffect(() => {
    if (!enabled || addresses.length === 0) {
      setConnected(false)
      return
    }

    let socket: WebSocket | null = null
    let closed = false
    let retry = 0
    let retryTimer: number | undefined

    const url = `${location.origin.replace(/^http/, 'ws')}/ws`

    const subscribe = () => {
      try {
        socket = new WebSocket(url)
      } catch {
        scheduleRetry()
        return
      }

      socket.onopen = () => {
        retry = 0
        setConnected(true)
        socket?.send(JSON.stringify({ type: 'subscribe', rpcUrl, addresses }))
      }

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload?.type === 'payment' && Array.isArray(payload.items)) {
            handler.current(payload.items)
          }
        } catch {
          /* ignore malformed frames */
        }
      }

      socket.onclose = () => {
        setConnected(false)
        if (!closed) scheduleRetry()
      }

      socket.onerror = () => {
        try {
          socket?.close()
        } catch {
          /* ignore */
        }
      }
    }

    const scheduleRetry = () => {
      retry = Math.min(retry + 1, 6)
      const delay = Math.min(1500 * 2 ** (retry - 1), 20000)
      retryTimer = window.setTimeout(() => {
        if (!closed) subscribe()
      }, delay)
    }

    subscribe()

    return () => {
      closed = true
      window.clearTimeout(retryTimer)
      try {
        socket?.close()
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rpcUrl, key])

  return { connected }
}
