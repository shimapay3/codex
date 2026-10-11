import { Buffer } from 'buffer'

// @solana/web3.js expects a Node-style Buffer in the browser.
if (!window.Buffer) window.Buffer = Buffer
if (!globalThis.Buffer) globalThis.Buffer = Buffer

// Keep the app feeling native on iOS/iPadOS: no pinch-zoom, no double-tap zoom.
document.addEventListener(
  'gesturestart',
  (event) => {
    event.preventDefault()
  },
  { passive: false },
)

let lastTouchEnd = 0
document.addEventListener(
  'touchend',
  (event) => {
    const now = Date.now()
    if (now - lastTouchEnd <= 320) event.preventDefault()
    lastTouchEnd = now
  },
  { passive: false },
)
