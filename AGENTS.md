# AGENTS.md — Cloud Pay Wallet

## What this is

A non-custodial **USDC pay wallet** for the Solana-based **Cloud Chain** network, built as an
installable PWA. Two services, no external credentials of any kind:

| Service | Path | Port | What it does |
| --- | --- | --- | --- |
| `web` | `web/` | 3000 (public) | React + Vite SPA. Owns all key handling. |
| `api` | `server/` | 8000 | Express: JSON-RPC proxy, USDC price, encrypted backup store, realtime WebSocket. |

Run it with `docker compose -f docker-compose.base44.yml up -d --build`.
Verify with `docker compose -f docker-compose.base44.yml ps` and `curl -s localhost:3000 | head`.

## Non-obvious things worth knowing

- **Secrets never leave the browser.** The vault (wallets, contacts, MEMO metadata, balance samples)
  is AES-GCM encrypted with a random vault key kept in memory only. There are three independent ways
  to release that key: a Passkey assertion (PRF-derived), a 6-digit PIN (PBKDF2, enabled only after a
  Passkey success), or re-entering **any** wallet secret (a wrapped copy of the vault key is stored
  per wallet). Nothing on the server can reveal a private key.
- **WebAuthn PRF is optional.** When the authenticator returns a PRF output the vault key is wrapped
  with it and the Passkey alone unlocks. Without PRF the Passkey only proves identity and a PIN is
  mandatory — the UI says "không hỗ trợ PRF". `rp.id` is deliberately omitted so the credential binds
  to whatever origin the app is served from.
- **All RPC traffic goes through `/api/rpc`** with the endpoint in the `x-rpc-url` header. This keeps
  a user-configured node from being blocked by CORS, and lets Settings swap the RPC at runtime.
- **Cloud Chain wraps some RPC results.** `getBalance` returns the standard `{ context, value }`
  envelope instead of a bare lamport count, so balance helpers must unwrap `value` before converting
  to SOL (`getSolBalance` in `web/src/lib/solana.ts`). Feeding the raw object into `lamportsToSol`
  renders `NaN SOL` on Home.
- **The browser needs a Node shim.** `@solana/errors` reads `process.env.NODE_ENV` at module init, and
  `@solana/web3.js` expects a `Buffer`. Both are provided in `web/src/polyfill.ts`, which must stay
  the first import in `web/src/main.tsx` — without the `process` shim the app throws
  "process is not defined" and `#root` stays empty.
- **Realtime notifications** arrive over `/ws` (Vite proxies it to the API). The server polls
  `getSignaturesForAddress` for every subscribed address and pushes new signatures; the client then
  reads the transaction itself to ring + show the system notification. The client also diffs its own
  history refresh, so a dropped socket never loses an incoming payment.
- **Backups are stored server-side but are unreadable**: the payload is sealed with a key derived
  from the *first* wallet's secret (HKDF), and addressed by that wallet's public key. Restoring on a
  new device needs only that secret. Data lives in the `api_data` volume as JSON at `/data`.
- **Only USDC is supported** (`USDnBPwJrUpXUuiptBrLXRqDwUebPjXXPSaNSvuxtb2`). Transfers add a
  `spl-memo` instruction so the note is visible on-chain, and open the recipient's associated token
  account when it does not exist yet (the sender pays the small rent).
- **USDC price** is fixed at 1 USD / 30,000 VND unless a price endpoint is configured in Settings
  (blank by default). A failing endpoint falls back to the fixed rate and flags `fallback: true`.
- Icons are pre-rendered PNGs in `web/public/icons/` (iOS ignores SVG for `apple-touch-icon`). The
  source mark is `web/public/logo.svg`; regenerate with sharp if the mark changes.

## Sandbox-only overrides

- `web/vite.config.ts` appends `.${BASE44_SANDBOX_HOST_DOMAIN}` to Vite's `allowedHosts` **only when
  `BASE44_PREVIEW_MODE === '1'`**. With the flag unset or any other value the allow-list is exactly
  what Vite ships, so a real deployment is unaffected.
- `docker-compose.base44.yml` passes `BASE44_PREVIEW_MODE`, `BASE44_SANDBOX_HOST_DOMAIN` and
  `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` through as bare environment entries. None of them is ever
  hardcoded; `API_PROXY_TARGET` is what makes the SPA single-origin behind the dev server proxy.
- No application behaviour is disabled in preview mode, and no authentication check is bypassed.

## Verifying

```bash
docker compose -f docker-compose.base44.yml logs -f web      # live Vite compilation
docker compose -f docker-compose.base44.yml logs -f api      # RPC + watcher
curl -s localhost:8000/health
curl -s localhost:3000 | head -20                            # must serve the dev HTML, not a bundle
```

In the preview: the wallet starts on the onboarding screen. Create a wallet (no secret needed), then
the Home screen shows the USDC balance, the live balance chart and the recent-activity list. Settings
carries the RPC endpoint, the price endpoint, Passkey/PIN, auto-lock and the encrypted cloud backup.
