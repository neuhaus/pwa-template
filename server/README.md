# Minimal Web Push Backend

Zero-dependency TypeScript/Node.js 26 backend for storing `PushSubscription` objects and sending encrypted Web Push notifications (RFC 8291 `aes128gcm` + RFC 8292 VAPID JWT).

---

## 1. Prerequisites

- **Node.js 26+** (runs `.ts` files natively; no `npm install` needed in `server/`).

---

## 2. Generate Persistent VAPID Keys

In development, starting the server without `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` generates an ephemeral key pair on each restart. For real deployments, generate a persistent pair once:

```bash
cd server
node -e "import('./webpush.ts').then(m => console.log(JSON.stringify(m.generateVapidKeys(), null, 2)))"
```

Store `publicKey` and `privateKey` in your environment variables. Keep `privateKey` secret.

---

## 3. Configuration (Environment Variables)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port the HTTP server listens on. |
| `BASE_PATH` | `""` | Optional URL prefix (e.g. `/pwa`) so routes are served at `/pwa/api/...`. |
| `API_PREFIX` | `/api` | API route prefix (e.g. `API_PREFIX=/server` serves `/server/vapid-public-key`, `/server/subscriptions`, `/server/send`). |
| `DB_PATH` | `./subscriptions.sqlite` | Path to the SQLite database file (`node:sqlite`). |
| `VAPID_PUBLIC_KEY` | *(ephemeral)* | Base64URL VAPID public key. |
| `VAPID_PRIVATE_KEY` | *(ephemeral)* | Base64URL VAPID private key. |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Contact `mailto:` or `https://` URI required by push services (including Apple). |
| `PUSH_ADMIN_TOKEN` | *(unset)* | Optional Bearer token required in `Authorization: Bearer <token>` for `POST /api/send`. |
| `CORS_ORIGIN` | *(unset)* | Optional allowed origin (e.g. `http://localhost:5173`) when calling from a different port. |

---

## 4. Running & Testing

```bash
cd server

# Run unit tests
npm test

# Start the server
VAPID_SUBJECT="mailto:you@example.com" \
PUSH_ADMIN_TOKEN="change-me" \
npm start
```

Typecheck from the repository root:

```bash
./node_modules/.bin/tsc -p server/tsconfig.json --noEmit
```

---

## 5. End-to-End Usage (Automatic via Browser)

When the server is running alongside `npm run dev` (or behind NGINX `/api/`), the browser UI handles everything automatically:

1. Start the backend (`npm run dev:server` from the repo root) and the frontend (`npm run dev`).
2. Open the PWA—it automatically fetches `/api/vapid-public-key` and fills in the **VAPID Public Key** field.
3. Click **Enable Push**—the browser subscribes and automatically `POST`s the `PushSubscription` to `/api/subscriptions` (persisted in SQLite).
4. Click **Send Server Push** in the UI to trigger `POST /api/send` (if `PUSH_ADMIN_TOKEN` is set, use `curl` below instead).
5. Click **Disable Push**—the browser unsubscribes and automatically sends `DELETE /api/subscriptions`.

### Manual `curl` Examples

```bash
# Send a push notification to all subscribers (when PUSH_ADMIN_TOKEN is enabled)
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer change-me" \
  -d '{"title":"Hello","body":"Push from server!","url":"/"}'

# Or target a single user (associated via userId / X-User-Id on POST /api/subscriptions)
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer change-me" \
  -d '{"userId":"alice","title":"Hello Alice","body":"Private message"}'
```

> **Auth note:** In production, derive `userId` from your authenticated session or reverse-proxy auth header (`X-User-Id`) rather than trusting an unauthenticated client-supplied `userId`.

---

## 6. Proxying Behind NGINX or Apache

### NGINX

Add this block to your NGINX `server` configuration so `/api/` is served on the same HTTPS origin as the PWA:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Apache (`mod_proxy`, `mod_proxy_http`, `mod_headers`)

Add these directives inside your Apache `<VirtualHost *:443>` block (before `FallbackResource /index.html` if using SPA fallback):

```apache
ProxyPreserveHost On
ProxyPass /api/ http://127.0.0.1:3000/api/
ProxyPassReverse /api/ http://127.0.0.1:3000/api/
RequestHeader set X-Forwarded-Proto "https"
```

### Subpath Deployment (`/pwa/api/`)

If the PWA is built with `BASE_PATH=/pwa/`, it calls `/pwa/api/*` while the backend listens at `/api/*`.

- **NGINX:**
  ```nginx
  location /pwa/api/ {
      rewrite ^/pwa(/api/.*)$ $1 break;
      proxy_pass http://127.0.0.1:3000;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-Proto $scheme;
  }
  ```
- **Apache:**
  ```apache
  ProxyPass /pwa/api/ http://127.0.0.1:3000/api/
  ProxyPassReverse /pwa/api/ http://127.0.0.1:3000/api/
  ```

> **Persistence:** Subscriptions are stored in SQLite via Node 26's built-in `node:sqlite` (`DB_PATH`, default `./subscriptions.sqlite`).
