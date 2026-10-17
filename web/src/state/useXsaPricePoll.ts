import { useEffect, useRef, useState } from 'react'
import { XsaPriceInfo, XSA_PRICE_API, VND_RATE } from '../lib/solana'

const POLL_MS = 5000

const FALLBACK: XsaPriceInfo = {
  usd: 1,
  vnd: VND_RATE,
  dailyChange: 0,
  hourChange: 0,
  source: 'fixed',
  fallback: true,
}

/**
 * Polls the XSA price API every 5 seconds.
 *
 * The API (https://api.localusd.cloud/xsa/price.json) returns:
 *   • value              — current USD price of 1 XSA
 *   • daily_change_value — USD price change in the last 24h
 *   • hour_change_value  — USD price change in the last 1h
 *
 * VND = USD × 30,000 (VND_RATE).
 */
export function useXsaPricePoll(enabled: boolean): XsaPriceInfo {
  const [price, setPrice] = useState<XsaPriceInfo>(FALLBACK)
  const priceRef = useRef(price)
  priceRef.current = price

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let timer: number | undefined

    const poll = async () => {
      if (cancelled) return
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 8000)
        const res = await fetch(XSA_PRICE_API, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        clearTimeout(timeout)
        if (cancelled || !res.ok) return
        const data = await res.json()
        const usd = Number(data.value)
        const dailyChange = Number(data.daily_change_value) || 0
        const hourChange = Number(data.hour_change_value) || 0
        if (cancelled || !Number.isFinite(usd) || usd <= 0) return
        setPrice({
          usd,
          vnd: usd * VND_RATE,
          dailyChange,
          hourChange,
          source: 'endpoint',
        })
      } catch {
        /* network hiccup — keep last value, retry next tick */
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, POLL_MS)
      }
    }

    void poll()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [enabled])

  return price
}
