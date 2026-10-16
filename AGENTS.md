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
- **SOL is gas-only** — it has no USD value and is shown with the Solana explorer icon
  (`https://explorer.solana.com/icon-144.png`) in the format `◎500,999,998.994414 SOL`. The
  balance hero and the assets list both display it; the Send button stays disabled while the wallet
  has no fee budget.
- **Payserver airdrops 1 SOL** to new wallets that have no gas. The server loads a keypair from
  `SOLANA_KEYPAIR_PATH` (default `/root/.config/solana/id.json`, falling back to a generated
  keypair in the data dir). `POST /api/airdrop/init` registers an address; a cron
  (`AIRDROP_CRON_MS`, default 15 s) checks the payserver's balance and sends 1 SOL per wallet.
  Security: one airdrop per address, max 3 requests per IP per hour, a daily cap
  (`AIRDROP_DAILY_LIMIT`, default 100), and the cron re-checks the recipient's balance before
  sending. The client polls `GET /api/airdrop/status/:address` and shows a toast when SOL arrives.
- **USDC price** is fixed at 1 USD / 30,000 VND unless a price endpoint is configured in Settings
  (blank by default). A failing endpoint falls back to the fixed rate and flags `fallback: true`.
- Icons are pre-rendered PNGs in `web/public/icons/` (iOS ignores SVG for `apple-touch-icon`). The
  source mark is `web/public/logo.svg`; regenerate with sharp if the mark changes.

## Reset and verified file backups

- Device reset must remove `cloudpay.vault.v1`, not just the PIN. `clearDeviceData` removes all app-prefixed local/session storage except the stable device ID, so clearing a vault does not bypass server wallet/airdrop limits. It does not delete cloud contacts or on-chain funds. The same confirmation is available from Settings and the locked screen; reset clears decrypted state and returns directly to onboarding.
- New/imported wallets carry `backupRequired: true` inside the encrypted vault. `App` gates onboarding/Home until `WalletBackupGate` completes a verified file export and the user accepts the loss-of-funds warning. Legacy wallets without this flag are unchanged. Reload/unlock must retain the pending gate. Do not mark a backup complete just because an anchor was clicked or a share sheet closed.
- `downloadTextFile` now returns `Promise<boolean>` via an in-memory export request and `FileExportDialog`. True means matching file contents were read back (native save picker or the user's selected saved file). Share Sheet sends a real `File`; on iOS use **Save to Files**, never a Telegram bot/public download URL for secrets. Browser downloads are only requests until verified; cancellation/copying is not backup proof. No plaintext backup is sent to the API or persisted by this exporter.
- Verification covered real downloaded files for backups (including a passphrase-derived wallet), contacts and address text in isolated Chromium and WebKit/iPhone-layout contexts. Those tests stub peripheral wallet-registration/RPC responses to avoid real airdrops, transfers or server records, but use the real forms, encrypted local vault, download manager and file picker inputs. Native OS save/share dialogs still require a physical-device check; WebKit emulation is not actual iOS Safari. Long chained WebKit tests with multiple downloads crashed on same-tab reload after Settings reset; opening a new tab passed, and a focused locked-screen reset + reload passed in both engines. Do not claim this anomaly is resolved.
- `npm run build` passes. `npx tsc --noEmit` has existing `BufferSource`/typed-array errors in crypto/passkey code; the build does not run the type checker.
- `deploy-vps.sh` runs frontend/server installs from lockfiles and uses remote `pipefail` so a failed build cannot be hidden by `tail`. Production is the existing VPS deployment, separate from the Base44 sandbox.

## Sandbox-only overrides

- `web/vite.config.ts` appends `.${BASE44_SANDBOX_HOST_DOMAIN}` to Vite's `allowedHosts` **only when
  `BASE44_PREVIEW_MODE === '1'`**. With the flag unset or any other value the allow-list is exactly
  what Vite ships, so a real deployment is unaffected.
- `docker-compose.base44.yml` passes `BASE44_PREVIEW_MODE`, `BASE44_SANDBOX_HOST_DOMAIN` and
  `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` through as bare environment entries. None of them is ever
  hardcoded; `API_PROXY_TARGET` is what makes the SPA single-origin behind the dev server proxy.
- No application behaviour is disabled in preview mode, and no authentication check is bypassed.

## Transaction-history invariants (October 2026)

- `server/tx-history.mjs` owns wallet-relative projection and RPC parsing. A cloud record's direction is relative to `walletAddress`; viewing it from `counterparty` inverts in/out and swaps the displayed partner. Always return copies: reads must never flip the canonical stored sender record.
- `/api/sync` merges user history, the public transaction index, AND RPC even when cloud history is nonempty. RPC discovery unions the owner, Token-2022 ATA and other USDC accounts, follows `before` pages, and computes deltas from raw BigInt base units. `PublicKey` comes from `@solana/web3.js`, not `@solana/spl-token`.
- Updating `/api/user/data` must preserve `txHistory`. Startup `repairTransactionIndex` rebuilds both address indexes without changing amounts and recovers user histories only for explicitly registered `tg-<id>` device wallet addresses. Take a VPS store backup before deploying repair changes; data pruned from the validator and absent from every backup cannot be reconstructed.
- Frontend history is cached inside the encrypted local vault under `historyByWallet`, keyed by RPC URL + wallet address. Confirmed USDC send results are recorded locally with or without Telegram; unconfirmed sends keep the existing pending/sync flow. Polling/manual refresh merge by signature; stale pending results must not undo a confirmed result. Reject late responses after a wallet/network switch. Incoming USDC uses `+`, outgoing uses `−`.
- Run backend regressions with `docker compose -f docker-compose.base44.yml exec -T api npm test`. The integration suite creates its own temporary store and mock validator and deletes both; it must never use the application data volume. Browser history QA covered real import/verified-backup/PIN/send/switch/reload gestures in a fresh isolated browser with mocked network responses (no real funds or Telegram messages). A real Telegram WebView remains a physical-session check.
- Compose installs now use `npm ci` at startup. Wait for the web healthcheck after recreating containers before running build/tests against the dependency volume.

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
