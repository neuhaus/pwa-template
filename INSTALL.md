# Installation & Customization Guide

Step-by-step instructions for setting up, testing, and customizing this PWA template for a new project.

---

## 1. Prerequisites

- **Node.js** 26+ (uses native TypeScript execution for scripts/tests and `node:test`).
- **npm** 10+ (for `npm audit --json` CVE checks).
- **HTTPS** when testing on a physical iOS/Android device (Service Workers and Web Push require HTTPS outside `localhost`).

---

## 2. Installation & Verification

Clone or copy the template into your project directory, then install dependencies and run the verification suite:

```bash
npm install
npm run typecheck
npm test
npm run check:cve
npm run build
```

If all commands exit with `0`, your environment is ready.

---

## 3. Running Locally

### Desktop Development

```bash
npm run dev
```

Open the printed `http://localhost:5173` URL. In dev mode, Vite renders Eta templates on the fly and serves `/sw.js` directly from `src/sw.ts`.

### Production Preview

```bash
npm run build
npm run preview
```

### Testing on Mobile Safari (iOS / iPadOS)

1. Expose your local server over **HTTPS** with a trusted certificate (e.g., a TLS reverse proxy, Cloudflare Tunnel, ngrok, or `mkcert`).
2. Open the `https://...` URL in Mobile Safari.
3. Tap **Share** → **Add to Home Screen** → **Add**.
4. Launch the app from your Home Screen (standalone mode).
   - Web Push (`PushManager` and `Notification`) is only available in standalone mode on iOS/iPadOS 16.4+.
   - Always trigger permission requests from a button tap (user gesture).

---

## 4. Customizing the Template

### A. App Name, Colors & Meta Tags

1. Edit [`src/templates/app-config.ts`](src/templates/app-config.ts):
   - `appName`: Page `<title>` and main `<h1>` heading.
   - `shortName`: Used for `apple-mobile-web-app-title` on iOS Home Screen.
   - `description`: Meta description and subtitle.
   - `themeColor` and `statusBarStyle`: Browser/status-bar appearance.
2. Update [`public/manifest.webmanifest`](public/manifest.webmanifest) to match `name`, `short_name`, `description`, `theme_color`, and `background_color`.

### B. App Icons

Mobile Safari requires a real PNG for `apple-touch-icon` (`180x180`).

- Replace the PNGs in `public/icons/` with your own artwork:
  - `public/icons/apple-touch-icon.png` (`180x180`)
  - `public/icons/icon-192.png` (`192x192`)
  - `public/icons/icon-512.png` (`512x512`)
- Or edit [`scripts/generate-icons.ts`](scripts/generate-icons.ts) and run:
  ```bash
  npm run generate:icons
  ```

### C. HTML Templates & Partials (Eta)

- [`index.html`](index.html) is rendered through Eta (`eta` `^4.6.0`) before Vite bundles assets.
- Add or edit partials in `src/templates/partials/`:
  - [`src/templates/partials/head-meta.eta`](src/templates/partials/head-meta.eta)
  - [`src/templates/partials/ios-install.eta`](src/templates/partials/ios-install.eta)
- Use `<%= it.value %>` for HTML-escaped values and `<%~ include('partials/name', it) %>` for partials.

### D. Offline Caching (Service Worker)

Edit [`src/sw.ts`](src/sw.ts):

- Bump `CACHE_NAME` (e.g., `'my-app-v1'` → `'my-app-v2'`) whenever you deploy breaking asset changes so `activate` purges old caches.
- Add any extra static routes/files to `PRECACHE_ASSETS`.
- Navigation requests (`request.mode === 'navigate'`) use **network-first** with fallback to cached `/index.html`. Other same-origin `GET` requests use **cache-first**.

### E. Web Push & VAPID Keys

1. Generate a VAPID key pair once for your backend (keep the private key secret):
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Paste the **Public Key** into the UI input (or wire it into `src/main.ts` / environment config via `import.meta.env.VITE_VAPID_PUBLIC_KEY`).
3. When a user taps **Enable Push**, [`subscribeToPush`](src/push.ts) returns a `PushSubscription` JSON object (`endpoint`, `keys.p256dh`, `keys.auth`). Send that JSON to your backend to store and deliver push messages.

---

## 5. Upstream CVE Checks

- Run manually at any time:
  ```bash
  npm run check:cve
  ```
- Fail only on `high` or `critical`:
  ```bash
  node scripts/check-cve.ts --level=high
  ```
- Automated CI checks run on every push, pull request, and every Monday at 09:00 UTC via [`.github/workflows/security.yml`](.github/workflows/security.yml).
