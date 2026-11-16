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

## 5. End-to-End Usage Example

1. **Fetch the VAPID public key:**
   ```bash
   curl http://localhost:3000/api/vapid-public-key
   ```
2. **Subscribe in the PWA UI:**
   - Paste the `publicKey` into the **VAPID Public Key** input in the PWA and click **Enable Push**.
   - Copy the printed `PushSubscription` JSON.
3. **Register the subscription on the server:**
   ```bash
   curl -X POST http://localhost:3000/api/subscriptions \
     -H "Content-Type: application/json" \
     -d '<PASTE_SUBSCRIPTION_JSON>'
   ```
4. **Send a push notification to all subscribers:**
   ```bash
   curl -X POST http://localhost:3000/api/send \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer change-me" \
     -d '{"title":"Hello","body":"Push from server!","url":"/"}'
   ```
   - Expired subscriptions (`404` / `410`) are automatically removed.
5. **Unsubscribe / remove a subscription:**
   ```bash
   curl -X DELETE http://localhost:3000/api/subscriptions \
     -H "Content-Type: application/json" \
     -d '{"endpoint":"<SUBSCRIPTION_ENDPOINT>"}'
   ```

---

## 6. Proxying Behind NGINX

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

> **Note:** Subscriptions are stored in memory in this minimal example. Replace the `subscriptions` `Map` in [`index.ts`](index.ts) with SQLite/Postgres/Redis for persistence across restarts.
