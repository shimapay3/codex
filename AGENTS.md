# AGENTS.md

## What this repo is

A Chrome Manifest V3 extension with **no build step**: `manifest.json` at the repo root is the
extension entry point and every file is loaded as-is. There is no package.json, bundler, test
runner or server-side code.

## Running it here

- `docker-compose.base44.yml` starts a single `nginx:alpine` service on host port 3000 and mounts
  only `preview/`, `popup/`, `injected/` and `icons/` into its web root — the checkout root is mode
  0700, so nginx cannot traverse a whole-repo mount. `/` resolves to `preview/index.html` (see
  `docker/nginx.conf`). Add a new top-level directory to the compose `volumes:` list if the preview
  must serve it.
- The preview page is **not part of the extension**: it fetches `popup/popup.html` and renders it
  in an iframe via `srcdoc`, with `<base href="../popup/">` and `preview/chrome-mock.js` injected
  before the popup's own scripts. That mock implements the `chrome.*` APIs the popup uses
  (`storage.local`, `tabs.query/get/update`, `windows.update`, `runtime.getURL/sendMessage`).
- If the popup starts calling a new `chrome.*` API, add it to `preview/chrome-mock.js` or the
  preview breaks (the real extension still works).

## What cannot be verified automatically

The sandbox browser cannot load an unpacked extension, so `background/service-worker.js`,
`content/content.js` and real `chrome.scripting` injection are only verifiable by hand in Chrome
(`chrome://extensions` → Developer mode → Load unpacked). The preview proves the popup's markup,
styling and UI flow only.

## Editing conventions

- Keep injected code out of the popup: JS lives in `injected/scripts/*.js`, CSS in
  `injected/styles/*.css`, and every new file must be registered in `injected/catalog.json` or it
  will not appear in the popup's selects.
- Injected JS runs in the page's MAIN world and may execute repeatedly (apply / reload / tab
  reload), so it must be idempotent — reuse nodes by `id` instead of appending duplicates.
- Records are stored under the `records` key in `chrome.storage.local`; the shape is
  `{ id, name, tabId, jsFile, cssFile, createdAt }` and one record exists per tab id.
- The popup is 384px wide with `max-height: 600px`; keep it scrollable rather than growing taller.
