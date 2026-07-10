# Offline Support + Installable PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the built game (`npm run build` output) work fully offline after a first visit, and installable as a standalone PWA.

**Architecture:** A hand-written service worker (`public/sw.js`, copied unprocessed by Vite into `dist/`) atomically precaches the HTML shell + its hashed JS/CSS at `install` time by fetching the shell and regex-extracting the asset URLs it references — no build-time manifest generation needed. A dependency-free postbuild Node script stamps a unique build ID into the service worker's cache name after every `vite build`, so `activate` naturally garbage-collects the previous deploy's cache with no manual version bump. A web app manifest + generated icons make the game installable.

**Tech Stack:** Vite 6, vanilla JS (no frameworks), Service Worker / Cache Storage / Web App Manifest APIs, Node.js (postbuild script, no new npm dependency), macOS `qlmanage`/`sips` for one-time icon rasterization.

## Global Constraints

- No new npm dependency (no `vite-plugin-pwa`, no workbox) — spec: `docs/superpowers/specs/2026-07-10-offline-pwa-design.md`.
- Must work correctly when deployed under a GitHub Pages *subpath*, not just domain root (`vite.config.js` already uses `base: './'` for this reason) — match requests against `self.registration.scope`, never a hardcoded path prefix.
- Service worker must not intercept `vite dev` (including LAN/Tailscale testing) — registration gated to production builds only.
- Manifest colors must match the existing HUD palette: `#3ee6ff` (cyan) / `#07071a` (near-black), from `src/style.css`.
- Manifest must include a maskable icon variant distinct from the plain icon (the sun+ring emblem's ring touches the edge of the existing favicon's viewBox, which Android's safe-zone crop would clip).

---

## File Structure

- `public/sw.js` — **create.** The service worker: install-time atomic precache, activate-time old-cache cleanup, fetch handler (network-first for navigations, cache-first for in-scope GETs).
- `public/manifest.webmanifest` — **create.** Web app manifest.
- `public/icons/icon.svg` — **create.** Master vector icon (sun + ring, full-bleed dark background), source for the plain PNG icons.
- `public/icons/icon-maskable.svg` — **create.** Padded variant of the same icon, source for the maskable PNG icon.
- `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png` — **create** (generated binaries, committed to git like any other static asset).
- `scripts/stamp-sw.mjs` — **create.** Postbuild script: replaces a placeholder token in `dist/sw.js` with a fresh build ID.
- `index.html` — **modify.** Add `<link rel="manifest">`, `<link rel="apple-touch-icon">`, `<meta name="theme-color">`.
- `src/main.js` — **modify.** Register the service worker (production builds only).
- `package.json` — **modify.** `build` script runs the stamping step after `vite build`.

---

### Task 1: Service worker core

**Files:**
- Create: `public/sw.js`
- Test: verified via `node --check` (syntax) and a standalone regex check against the real build output (both below — no test framework exists in this repo)

**Interfaces:**
- Produces: a service worker at scope root exposing the cache name pattern `spaceflight-__BUILD_ID__` (the `__BUILD_ID__` token is replaced by Task 5's postbuild script; until that task runs, the literal token is fine since Task 1 is validated independently of the build).

- [ ] **Step 1: Build the app once so there's a real `dist/index.html` to validate against**

Run: `npm install && npm run build`

Expected: `dist/index.html`, `dist/assets/index-*.js`, and `dist/assets/index-*.css` all exist. Confirm with:

```bash
ls dist/index.html dist/assets/*.js dist/assets/*.css
```

- [ ] **Step 2: Write `public/sw.js`**

```js
const CACHE_NAME = 'spaceflight-__BUILD_ID__';
const ASSET_URL_RE = /(?:src|href)="([^"]*\/assets\/[^"]+)"/g;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shellUrl = self.registration.scope;
      const shellResponse = await fetch(shellUrl, { cache: 'no-store' });
      const html = await shellResponse.clone().text();
      const assetUrls = [...html.matchAll(ASSET_URL_RE)].map(
        (match) => new URL(match[1], shellUrl).href
      );

      const cache = await caches.open(CACHE_NAME);
      await cache.put(shellUrl, shellResponse);
      await cache.addAll(assetUrls);
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.url.startsWith(self.registration.scope)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());
  return response;
}
```

- [ ] **Step 3: Syntax-check it**

Run: `node --check public/sw.js`

Expected: no output, exit code 0 (this only validates JS syntax — `self`/`caches` are browser globals and are not executed by this check).

- [ ] **Step 4: Verify the asset-extraction regex against the real build output**

Run:

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('dist/index.html', 'utf8');
const re = /(?:src|href)=\"([^\"]*\/assets\/[^\"]+)\"/g;
const matches = [...html.matchAll(re)].map((m) => m[1]);
const ok = matches.length === 2 && matches.every((m) => m.startsWith('./assets/'));
console.log(JSON.stringify(matches), ok);
"
```

Expected: prints a JSON array of exactly two `./assets/...` paths (one `.js`, one `.css`) followed by `true`.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js
git commit -m "feat: add service worker for offline precaching"
```

---

### Task 2: Web app manifest

**Files:**
- Create: `public/manifest.webmanifest`

**Interfaces:**
- Produces: a manifest served at `<scope>/manifest.webmanifest`, referencing icon files that Task 3 creates (`icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable-512.png`) — these paths must match exactly.

- [ ] **Step 1: Write `public/manifest.webmanifest`**

```json
{
  "id": "./",
  "name": "SPACEFLIGHT",
  "short_name": "SPACEFLIGHT",
  "description": "A browser space-flight toy — Freelancer-style mouse flight in a stylized solar system.",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#07071a",
  "theme_color": "#3ee6ff",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Verify it's valid JSON with the required fields**

Run:

```bash
node -e "
const m = JSON.parse(require('fs').readFileSync('public/manifest.webmanifest', 'utf8'));
const required = ['id','name','short_name','start_url','scope','display','background_color','theme_color','icons'];
const missing = required.filter((k) => !(k in m));
console.log('missing:', JSON.stringify(missing), 'icons:', m.icons.length);
"
```

Expected: `missing: [] icons: 3`

- [ ] **Step 3: Commit**

```bash
git add public/manifest.webmanifest
git commit -m "feat: add web app manifest"
```

---

### Task 3: App icons

**Files:**
- Create: `public/icons/icon.svg`
- Create: `public/icons/icon-maskable.svg`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/icon-maskable-512.png`

**Interfaces:**
- Produces: PNG files at the exact paths Task 2's manifest already references.

- [ ] **Step 1: Write the plain icon SVG (512×512, full-bleed background, same sun+ring proportions as the existing inline favicon)**

```bash
mkdir -p public/icons
cat > public/icons/icon.svg <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#07071a"/>
  <circle cx="256" cy="256" r="144" fill="#ffd860"/>
  <ellipse cx="256" cy="256" rx="240" ry="64" fill="none" stroke="#3ee6ff" stroke-width="24"/>
</svg>
EOF
```

- [ ] **Step 2: Write the maskable icon SVG (same design, scaled to ~65% so nothing crosses Android's 80%-diameter safe-zone circle)**

```bash
cat > public/icons/icon-maskable.svg <<'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#07071a"/>
  <circle cx="256" cy="256" r="94" fill="#ffd860"/>
  <ellipse cx="256" cy="256" rx="156" ry="42" fill="none" stroke="#3ee6ff" stroke-width="16"/>
</svg>
EOF
```

- [ ] **Step 3: Rasterize both SVGs to PNG using macOS QuickLook (no new dependency), then normalize to exact pixel sizes with `sips`**

```bash
mkdir -p /tmp/spaceflight-icons
qlmanage -t -s 512 -o /tmp/spaceflight-icons public/icons/icon.svg
qlmanage -t -s 512 -o /tmp/spaceflight-icons public/icons/icon-maskable.svg

sips -z 512 512 /tmp/spaceflight-icons/icon.svg.png --out public/icons/icon-512.png
sips -z 192 192 /tmp/spaceflight-icons/icon.svg.png --out public/icons/icon-192.png
sips -z 512 512 /tmp/spaceflight-icons/icon-maskable.svg.png --out public/icons/icon-maskable-512.png
```

- [ ] **Step 4: Verify exact output dimensions**

Run:

```bash
sips -g pixelWidth -g pixelHeight public/icons/icon-192.png public/icons/icon-512.png public/icons/icon-maskable-512.png
```

Expected: `icon-192.png` reports `pixelWidth: 192` / `pixelHeight: 192`; the other two report `512` / `512`.

- [ ] **Step 5: Commit (including the generated PNGs — they're static source assets, not build output)**

```bash
git add public/icons
git commit -m "feat: add app icons (plain + maskable)"
```

---

### Task 4: Wire up HTML and service worker registration

**Files:**
- Modify: `index.html`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `public/sw.js` (Task 1), `public/manifest.webmanifest` (Task 2), `public/icons/icon-192.png` (Task 3).

- [ ] **Step 1: Add manifest/icon/theme-color tags to `index.html`, right after the existing favicon `<link>`**

In `index.html`, the existing favicon line reads:

```html
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='9' fill='%23ffd860'/%3E%3Cellipse cx='16' cy='16' rx='15' ry='4' fill='none' stroke='%233ee6ff' stroke-width='1.5'/%3E%3C/svg%3E" />
```

Add these three lines immediately after it (before `<link rel="stylesheet" href="/src/style.css" />`):

```html
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="apple-touch-icon" href="./icons/icon-192.png" />
    <meta name="theme-color" content="#3ee6ff" />
```

- [ ] **Step 2: Append service worker registration to the end of `src/main.js`**

```js
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}
```

- [ ] **Step 3: Verify the tags and registration snippet are present in source**

Run:

```bash
grep -c 'rel="manifest"' index.html
grep -c 'apple-touch-icon' index.html
grep -c 'theme-color' index.html
grep -c "serviceWorker.register" src/main.js
grep -c "import.meta.env.PROD" src/main.js
```

Expected: every command prints `1`.

- [ ] **Step 4: Commit**

```bash
git add index.html src/main.js
git commit -m "feat: wire up manifest and service worker registration"
```

---

### Task 5: Postbuild cache-version stamping

**Files:**
- Create: `scripts/stamp-sw.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `dist/sw.js` (Vite copies `public/sw.js` here unprocessed as part of `vite build`, containing the literal token `__BUILD_ID__` from Task 1).
- Produces: `dist/sw.js` with `__BUILD_ID__` replaced by a unique build identifier, run automatically as part of `npm run build`.

- [ ] **Step 1: Write `scripts/stamp-sw.mjs`**

```bash
mkdir -p scripts
cat > scripts/stamp-sw.mjs <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const swPath = fileURLToPath(new URL('../dist/sw.js', import.meta.url));
const buildId = Date.now().toString(36);
const source = readFileSync(swPath, 'utf8');

if (!source.includes('__BUILD_ID__')) {
  throw new Error('dist/sw.js is missing the __BUILD_ID__ placeholder — did public/sw.js change?');
}

writeFileSync(swPath, source.replace('__BUILD_ID__', buildId));
console.log(`stamped dist/sw.js with build id ${buildId}`);
EOF
```

- [ ] **Step 2: Point `package.json`'s `build` script at it**

In `package.json`, change:

```json
    "build": "vite build",
```

to:

```json
    "build": "vite build && node scripts/stamp-sw.mjs",
```

- [ ] **Step 3: Run the real build and verify the placeholder is gone and a build id is present**

Run:

```bash
rm -rf dist
npm run build
grep -c "__BUILD_ID__" dist/sw.js; echo "exit:$?"
grep -o "spaceflight-[a-z0-9]*" dist/sw.js | head -1
```

Expected: the first `grep -c` prints `0` (zero occurrences of the placeholder left) with the shell reporting a non-zero grep exit status (grep exits 1 when the count is zero — that's expected here, not a failure); the second command prints a line like `spaceflight-md3x7k2` (some non-empty base-36 suffix after `spaceflight-`).

- [ ] **Step 4: Commit**

```bash
git add scripts/stamp-sw.mjs package.json
git commit -m "feat: stamp a unique cache version into the service worker on build"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only)

**Interfaces:** none — this task exercises the fully assembled app from Tasks 1–5.

- [ ] **Step 1: Clean build and start the preview server**

Run:

```bash
rm -rf dist
npm run build
npm run preview -- --port 4173 &
sleep 1
curl -sI http://localhost:4173/ | head -1
```

Expected: `HTTP/1.1 200 OK` (confirms the preview server is up before driving it with a browser).

- [ ] **Step 2: Load the game in a real browser and confirm the service worker installs and precaches the shell + both hashed assets**

Use the Playwright MCP tool `browser_navigate` to open `http://localhost:4173/`, then `browser_run_code_unsafe` with:

```js
async (page) => {
  await page.waitForFunction(() => navigator.serviceWorker.ready);
  const reg = await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => !!r));
  const cacheKeys = await page.evaluate(() => caches.keys());
  const cacheName = cacheKeys.find((k) => k.startsWith('spaceflight-'));
  const cached = cacheName
    ? await page.evaluate((name) => caches.open(name).then((c) => c.keys()).then((ks) => ks.map((k) => k.url)), cacheName)
    : [];
  return { registered: reg, cacheName, cachedCount: cached.length, cached };
}
```

Expected: `registered: true`, `cacheName` starting with `spaceflight-`, `cachedCount: 3` (the shell URL plus one JS and one CSS asset URL).

- [ ] **Step 3: Simulate offline and confirm the game still loads from cache**

Use `browser_run_code_unsafe` with:

```js
async (page) => {
  const context = page.context();
  await context.setOffline(true);
  await page.reload();
  const canvasVisible = await page.locator('#scene').isVisible();
  const bodyText = await page.locator('#hint').textContent();
  await context.setOffline(false);
  return { canvasVisible, bodyText };
}
```

Expected: `canvasVisible: true` and `bodyText` containing `CLICK TO TAKE CONTROL` — the game shell rendered with no network access.

- [ ] **Step 4: Confirm the manifest is well-formed from the browser's perspective**

Use `browser_run_code_unsafe` with:

```js
async (page) => {
  const res = await page.evaluate(() =>
    fetch('/manifest.webmanifest').then((r) => r.json())
  );
  return { name: res.name, iconCount: res.icons.length, display: res.display };
}
```

Expected: `name: "SPACEFLIGHT"`, `iconCount: 3`, `display: "standalone"`.

- [ ] **Step 5: Stop the preview server**

Run: `kill %1`

- [ ] **Step 6: Commit any fixes found during verification, if none were needed then there is nothing to commit for this task**

---

## Self-Review Notes

- **Spec coverage:** install-time atomic precache (Task 1) ✓, per-deploy cache versioning via postbuild stamp (Task 5) ✓, network-first navigations / scope-relative cache-first assets (Task 1) ✓, `skipWaiting`/`clients.claim()` (Task 1) ✓, dev-server guard via `import.meta.env.PROD` (Task 4) ✓, manifest with `id`/colors/icons (Task 2) ✓, plain + maskable icons (Task 3) ✓, `apple-touch-icon`/`theme-color` (Task 4) ✓, verification via build+preview+browser (Task 6) ✓.
- **Type/name consistency checked:** `CACHE_NAME` prefix `spaceflight-` used identically in Task 1 (`sw.js`) and Task 5's verification grep and Task 6's cache-key assertion; manifest icon paths in Task 2 match the files Task 3 actually creates; `scripts/stamp-sw.mjs` path referenced identically in Task 5 Step 2 and Step 1.
- **No placeholders:** every step has literal file contents or exact commands with concrete expected output.
