# PWA Template

Minimal, offline-first TypeScript PWA template with Web Push, Mobile Safari support, Eta HTML templating, native Node tests, and upstream CVE auditing.

See [INSTALL.md](INSTALL.md) for step-by-step installation, Mobile Safari testing, customization, and NGINX/Apache deployment instructions.

## Stack

- **Zero runtime browser dependencies** (pure TypeScript + Web APIs)
- **Build**: `vite` (`^8.3.8`), `typescript` (`^7.0.2`)
- **HTML Templating**: `eta` (`^4.6.0`, zero dependencies)
- **Tests**: Node's built-in `node:test` + `node:assert/strict`, plus `playwright-core` (`^1.65.1`) for headless Chromium E2E offline verification

## Scripts

- `npm run dev` — Start Vite dev server (renders Eta templates and serves `/sw.js`)
- `npm run build` — Build production bundle to `dist/` (`dist/index.html`, `dist/sw.js`, `dist/manifest.webmanifest`)
- `npm start` — Build `dist/` and start `vite preview` automatically
- `npm run preview` — Preview the existing `dist/` build locally
- `npm run typecheck` — Typecheck app, tests, scripts, and Service Worker (`tsconfig.sw.json`)
- `npm test` — Run all unit tests
- `npm run test:e2e` — Run headless Chromium E2E test (Service Worker activation + offline reload)
- `npm run check:cve` — Run upstream CVE audit via `npm audit --json` (exits non-zero on `moderate` or higher)
- `npm run generate:icons` — Regenerate PNG icons in `public/icons/`

## Mobile Safari & Web Push Notes

- **HTTPS required**: Service Workers and Web Push require HTTPS (except `localhost`).
- **iOS Home Screen requirement**: On iOS/iPadOS Safari (16.4+), `PushManager` and `Notification` are only exposed when the app is added to the Home Screen (`display: standalone`). The app detects non-standalone iOS Safari and displays `#ios-install-banner`.
- **Safe areas**: `viewport-fit=cover` and CSS `env(safe-area-inset-*)` handle the notch and home indicator.
- **VAPID key**: Paste your server's Base64URL VAPID public key in the UI to test `PushManager.subscribe` and copy the resulting subscription JSON.

## Push Backend (`server/`)

A separate, zero-dependency Node.js 26 Web Push backend (VAPID JWT signing + RFC 8291 `aes128gcm` encryption) lives in [`server/`](server/). See [`server/README.md`](server/README.md) for setup, API endpoints, and NGINX/Apache proxy instructions.

## Upstream CVE Monitoring

- Local: `npm run check:cve` (or `node scripts/check-cve.ts --level=high`)
- CI: `.github/workflows/security.yml` runs typecheck, unit tests, build, `npm run check:cve`, and Playwright E2E offline verification on push, PR, and a weekly Monday cron schedule.
