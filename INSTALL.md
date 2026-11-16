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
npm run test:e2e
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
   - `themeColor`, `themeColorLight`, and `statusBarStyle`: Device-aware dark/light theme colors (`prefers-color-scheme`) and iOS status-bar appearance.
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
  - [`src/templates/partials/head-meta.eta`](src/templates/partials/head-meta.eta) (Mobile Safari meta tags, icons, manifest, production CSP)
  - [`src/templates/partials/sw-update.eta`](src/templates/partials/sw-update.eta) (Service Worker update/reload prompt)
  - [`src/templates/partials/app-install.eta`](src/templates/partials/app-install.eta) (Android/Desktop `beforeinstallprompt` banner)
  - [`src/templates/partials/ios-install.eta`](src/templates/partials/ios-install.eta) (iOS Home Screen instruction banner)
- Use `<%= it.value %>` for HTML-escaped values and `<%~ include('partials/name', it) %>` for partials.

### D. Offline Caching (Service Worker)

Edit [`src/sw.ts`](src/sw.ts):

- In production builds (`npm run build`), [`vite.config.ts`](vite.config.ts) automatically injects a content-hashed `CACHE_VERSION` and all emitted `dist/assets/*` files into `dist/sw.js` so `activate` purges stale caches and users see the update banner.
- Add any extra static routes/files in `public/` to `PRECACHE_ASSETS`.
- Navigation requests (`request.mode === 'navigate'`) use **network-first** with fallback to cached `/index.html`. Other same-origin `GET` requests use **cache-first**.

### E. Web Push & VAPID Keys

1. Generate a VAPID key pair once for your backend (keep the private key secret):
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Paste the **Public Key** into the UI input (or wire it into `src/main.ts` / environment config via `import.meta.env.VITE_VAPID_PUBLIC_KEY`).
3. When a user taps **Enable Push**, [`subscribeToPush`](src/push.ts) returns a `PushSubscription` JSON object (`endpoint`, `keys.p256dh`, `keys.auth`). Send that JSON to your backend to store and deliver push messages (see [`server/README.md`](server/README.md) for the included zero-dependency push backend).

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

---

## 6. Production Deployment (NGINX & Apache Best Practices)

When serving `dist/` behind NGINX or Apache over HTTPS:

- **Never long-cache `sw.js` or `index.html`:** Set `Cache-Control: no-cache` so browsers always revalidate for Service Worker updates.
- **Long-cache hashed `/assets/`:** Vite content-hashes JS/CSS filenames, so `/assets/` can safely use `Cache-Control: public, max-age=31536000, immutable`.
- **Serve `.webmanifest` with `application/manifest+json`** (and keep `try_files $uri $uri/ /index.html;` for SPA routes).
- **Set security headers:**

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name example.com;

    root /var/www/pwa-template/dist;
    index index.html;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self';" always;

    location = /sw.js {
        add_header Cache-Control "no-cache";
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location = /manifest.webmanifest {
        types { application/manifest+json webmanifest; }
        add_header Cache-Control "no-cache";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

> **NGINX gotcha:** `add_header` inside a `location` block overrides server-level `add_header` directives. Put the security headers in a shared snippet (e.g., `include snippets/security-headers.conf;`) and include it in any `location` that sets `Cache-Control`.

### Apache (`mod_headers`, `mod_mime`, `mod_dir`)

```apache
<VirtualHost *:443>
    ServerName example.com
    DocumentRoot /var/www/pwa-template/dist

    SSLEngine on
    # SSLCertificateFile /path/to/fullchain.pem
    # SSLCertificateKeyFile /path/to/privkey.pem

    AddType application/manifest+json .webmanifest
    FallbackResource /index.html

    Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "no-referrer"
    Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
    Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self';"

    <LocationMatch "^/(sw\.js|index\.html|manifest\.webmanifest)$">
        Header set Cache-Control "no-cache"
    </LocationMatch>

    <Location "/assets/">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </Location>
</VirtualHost>
```
