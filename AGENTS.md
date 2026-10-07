# AGENTS.md

## What this repo is

A single, self-contained landing page: `index.html` (HTML + CSS + JS in one file,
no framework, no build step, no package manager). There is nothing to compile — the
file the server returns *is* the source, so editing `index.html` is the whole loop.

## Running it

`docker compose -f docker-compose.base44.yml up -d` serves the repository with
`nginx:alpine` on host port 3000 (`previewPort` in `.base44/environment.json`), the
checkout bind-mounted read-only into the web root. Because the mount is live and
there is no bundler, an edit shows up on the next page load; there is no dev-server
hot reload, so force a preview refresh after changing the file.

Verification: `curl -sS http://localhost:3000/ | head` should return the page markup,
and `docker compose -f docker-compose.base44.yml ps` should show `web` as healthy
(busybox `wget` against `/`, configured only in the compose file — the page needs no
health endpoint of its own).

## Design constraints that are easy to break

The page is content-locked by the brief. Only one figure may be written in numerals
anywhere in the copy: **1 USD Xanh = 30.000 USD Mỹ**. Do not add troop counts, totals,
GDP, ratios, comparisons, or any other rate. The tier names (`Kỳ Tôn Nữ 8Sky+`,
`Ngọc Tôn Nữ 9Sky+`, `Hoá Tôn Nữ 9th`, `Thảo Tôn Chúng 9nm`, `Mộc Tôn Nữ (9th)*`,
`Hải Tôn Nữ 9ss`) are fixed names — their alphanumeric suffixes are part of the name,
not statistics — and each carries a badge, never a number. For this reason the origin
list uses a `✦` glyph instead of `01–04` markers.

Design language: deep-water cosmos background (`#031018` → `#062033`), frosted glass
surfaces, ice-blue `#7ee7ff` / emerald `#3dffc8` neon, champagne gold `#f0d575`
reserved for the badges only. No stock photos of real people, and no repeating
checkerboard patterns — the starfield is layered radial gradients, not a tile grid.

Interactions are limited on purpose: JS only counts the 30.000 rate and toggles the
mobile menu. Anything added must stay under `prefers-reduced-motion` (count, parallax
via `background-attachment`, twinkle and the value ticker all stop there).
