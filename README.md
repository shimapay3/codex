# wt-prod reverse proxy (Cloudflare Worker)

Cloudflare Worker that reverse-proxies **all** traffic under `/wt_prod-15374/` to
`https://example.org/`, keeping every HTTP method, header, query string and body.

```
https://example.com/wt_prod-15374/anything?x=1  ->  https://example.org/anything?x=1
https://example.com/wt_prod-15374               ->  https://example.org/
https://example.com/other/route                 ->  404 from the worker, not proxied
```

`/` on the worker itself answers with a small landing page naming the mapping
(so the sandbox preview has something to render); nothing else outside the
prefix is proxied.

## Local development

```bash
npm install
npm run dev      # wrangler dev on http://localhost:3000
```

Visit <http://localhost:3000/wt_prod-15374/> to see the proxied upstream.
With Base44 the same thing runs in Docker:

```bash
docker compose -f docker-compose.base44.yml up -d --build
```

## Configuration

Set in `[vars]` of `wrangler.toml` (or override with `--var NAME:value`):

| Variable          | Default               | Meaning                                   |
| ----------------- | --------------------- | ----------------------------------------- |
| `UPSTREAM_ORIGIN` | `https://example.org` | Origin every matched request is sent to   |
| `PATH_PREFIX`     | `/wt_prod-15374`      | Path prefix stripped before proxying      |

## Deploy

```bash
npx wrangler deploy
```

To answer `https://example.com/wt_prod-15374/*`, add the zone route in
`wrangler.toml` (there's a commented example) and deploy — the worker only sees
requests for that path, everything else on the domain is unaffected.
