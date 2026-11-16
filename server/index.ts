import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createSubscriptionStore } from './store.ts';
import {
  generateVapidKeys,
  sendPushNotification,
  type PushSubscriptionData,
  type VapidKeys,
} from './webpush.ts';

const PORT = Number(process.env.PORT ?? 3000);
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';
const ADMIN_TOKEN = process.env.PUSH_ADMIN_TOKEN;
const CORS_ORIGIN = process.env.CORS_ORIGIN;
const MAX_BODY_BYTES = 64 * 1024;

const vapidKeys: VapidKeys =
  process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      }
    : (() => {
        const generated = generateVapidKeys();
        console.warn('No VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY set; generated ephemeral keys.');
        console.warn(`VAPID_PUBLIC_KEY=${generated.publicKey}`);
        return generated;
      })();

const subscriptions = createSubscriptionStore();

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
  if (CORS_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = CORS_ORIGIN;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error('Request body too large');
    }
    chunks.push(buf);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function isValidSubscription(sub: unknown): sub is PushSubscriptionData {
  if (!sub || typeof sub !== 'object') return false;
  const candidate = sub as Partial<PushSubscriptionData>;
  return (
    typeof candidate.endpoint === 'string' &&
    candidate.endpoint.startsWith('https://') &&
    typeof candidate.keys?.p256dh === 'string' &&
    typeof candidate.keys?.auth === 'string'
  );
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'OPTIONS' && CORS_ORIGIN) {
    sendJson(res, 204, null);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true, subscriptions: subscriptions.count() });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/vapid-public-key') {
    sendJson(res, 200, { publicKey: vapidKeys.publicKey });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/subscriptions') {
    try {
      const body = await readJsonBody<unknown>(req);
      if (!isValidSubscription(body)) {
        sendJson(res, 400, { error: 'Invalid PushSubscription payload' });
        return;
      }
      subscriptions.upsert(body);
      sendJson(res, 201, { ok: true, count: subscriptions.count() });
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid JSON' });
    }
    return;
  }

  if (req.method === 'DELETE' && url.pathname === '/api/subscriptions') {
    try {
      const body = await readJsonBody<{ endpoint?: string }>(req);
      if (!body.endpoint) {
        sendJson(res, 400, { error: 'Missing endpoint' });
        return;
      }
      const deleted = subscriptions.remove(body.endpoint);
      sendJson(res, 200, { ok: true, deleted });
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Invalid JSON' });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/send') {
    if (ADMIN_TOKEN && req.headers.authorization !== `Bearer ${ADMIN_TOKEN}`) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    try {
      const payload = await readJsonBody<Record<string, unknown>>(req);
      const results = await Promise.all(
        subscriptions.list().map(async (sub) => {
          const response = await sendPushNotification(sub, payload, vapidKeys, VAPID_SUBJECT);
          if (response.status === 404 || response.status === 410) {
            subscriptions.remove(sub.endpoint);
          }
          return { endpoint: sub.endpoint, status: response.status };
        }),
      );
      sendJson(res, 200, { sent: results.length, results });
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : 'Send failed' });
    }
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Push backend listening on http://localhost:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    subscriptions.close();
    server.close(() => process.exit(0));
  });
}
