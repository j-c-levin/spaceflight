# Offline support + installable PWA — design

## Goal

Make the web build (Vite + Three.js, deployed to GitHub Pages) work fully
offline after a first visit, and installable as a standalone PWA (the
`index.html` already ships iOS home-screen meta tags but no manifest/icons/SW).

## Constraints

- Hand-written service worker — no `vite-plugin-pwa`/workbox dependency.
- Must work under a GitHub Pages *subpath* deploy (`vite.config.js` uses
  `base: './'` for exactly this reason).
- Build output is currently just 3 files: `dist/index.html` + one
  content-hashed JS bundle + one content-hashed CSS file. No binary assets,
  no runtime `fetch`/dynamic-import calls anywhere in `src/*.js` (verified).

## Service worker (`public/sw.js`)

Copied unprocessed by Vite to `dist/sw.js`, so it's served from the site
root/subpath alongside `index.html`.

**Precache — install-time, atomic:**
`install` fetches `./`, regex-extracts the hashed `assets/*` URLs referenced
in that HTML, and `cache.addAll([shell, ...assets])` as a single atomic
operation. This avoids two races a naive "cache lazily on first fetch"
strategy has: a client that never finishes warming its asset cache before
going offline, and a deploy landing mid-session leaving a new shell paired
with not-yet-cached new-hash assets.

**Per-deploy cache versioning — no manual bump:**
`CACHE_NAME` contains a placeholder token (`__BUILD_ID__`) that a
dependency-free postbuild step (plain `node -e`, appended to the existing
`build` npm script) replaces with a build identifier in `dist/sw.js` after
`vite build` runs. Every deploy therefore precaches into a fresh,
uniquely-named cache. `activate` deletes any cache whose name doesn't match
the current one — this also garbage-collects orphaned hashed assets from
prior deploys as a side effect, so no separate purge logic is needed.

**Fetch handling:**
- Navigations (HTML): network-first, falling back to cache on failure.
- Same-origin GET requests under the SW's own scope (`self.registration.scope`,
  not a hardcoded `/assets/` prefix — required for correctness under a GH
  Pages subpath): cache-first, falling back to network + caching the result
  (covers anything not swept by the install-time precache).
- Everything else (non-GET, cross-origin): pass through untouched.

`self.skipWaiting()` in `install` and `clients.claim()` in `activate` so
updates take effect on already-open tabs without requiring a manual reload.

## Registration (`src/main.js`)

```js
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}
```

Gated to production builds so `vite dev` (including LAN/Tailscale testing,
per the existing `server` config) is never intercepted by the SW.

## PWA installability

- `public/manifest.webmanifest`: `name: "SPACEFLIGHT"`, `short_name`,
  `id: "./"`, `start_url: "./"`, `scope: "./"`, `display: "standalone"`,
  `background_color: "#07071a"`, `theme_color: "#3ee6ff"` (matching the
  existing HUD palette in `style.css`).
- Icons: vectorize the existing inline-SVG favicon (yellow sun circle + cyan
  ring) into `public/icons/icon.svg`, rasterize to 192×192 and 512×512 PNGs
  locally (macOS `qlmanage -t`, no new npm dependency) for the manifest
  `icons` array and `apple-touch-icon`. A second, separately-padded
  **maskable** variant is generated too — the ring in the current design
  touches the viewBox edge, which Android's 80%-safe-zone circular crop
  would clip on the plain icon.
- `index.html` gains `<link rel="manifest">`, `<link rel="apple-touch-icon">`,
  and `<meta name="theme-color">`.

## Out of scope

- Push notifications, background sync — not applicable to this game.
- Update-available UI prompt (e.g. "new version ready, reload") — the
  network-first shell + `clients.claim()` combination means the next
  navigation just picks up the new version; no UX beyond that is needed for
  a v1.

## Verification

`npm run build && npm run preview`, then in DevTools Application tab confirm
the SW installs and the precache lists the shell + both hashed assets, then
throttle to offline and reload to confirm the game still loads and plays.
Also verify install/standalone launch behavior via the browser's install
prompt.
