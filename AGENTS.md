# AGENTS.md

## What this is

A single Cloudflare Worker (`src/index.js`) that reverse-proxies `/wt_prod-15374/*`
to `https://example.org/*`. There is no framework and no build step — `wrangler`
serves the source directly.

## Running it

- Base44 / Docker: `docker compose -f docker-compose.base44.yml up -d --build`.
  The `web` service is `node:22`, bind-mounts the repo at `/app`, runs
  `npm install` on startup and then `wrangler dev --ip 0.0.0.0 --port 3000`.
  `node_modules` lives in the `dependencies` named volume, so the host checkout
  stays clean.
- Without Docker: `npm install && npm run dev`.
- Port 3000 serves the workerd dev server; source edits reload it
  (`CHOKIDAR_USEPOLLING=1` is set because the repo is a bind mount).

## How to verify it works

- `curl -s http://localhost:3000/` → `200` HTML landing page naming the
  `/wt_prod-15374/ -> https://example.org/` mapping (worker-local, no upstream call).
- `curl -si http://localhost:3000/wt_prod-15374/` → real `example.org` HTML (`Example Domain`).
- `curl -si -X POST http://localhost:3000/wt_prod-15374/` → upstream's own status, not a worker error.
- `curl -si http://localhost:3000/nope` → `404 Not Found`.

Healthcheck hits `/` (worker-local, no upstream call) so it stays fast and does
not depend on the internet. The preview bridge needs an HTML document at `/`,
which is why the worker answers `/` with the landing page instead of a 404.

## Gotchas

- The prefix is a plain string match, not a Cloudflare route. When deployed to
  `example.com`, mount it with `routes = ["example.com/wt_prod-15374/*"]`
  (commented example in `wrangler.toml`); requests outside the prefix are
  answered with 404 by the worker.
- Requests are forwarded with `redirect: "manual"` so upstream redirects reach
  the client, with `Location` rewritten back into the proxied prefix.
- Hop-by-hop headers and `host` are stripped before forwarding; everything else
  (including `Authorization`, `Cookie`, `Content-Type`) passes through as-is.
- `compatibility_date` is set to a date supported by the pinned `wrangler`; bump
  both together.
