/// <reference lib="webworker" />

export const CACHE_NAME = 'pwa-template-v1';

export const PRECACHE_ASSETS: readonly string[] = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  icon: string;
}

export function parsePushPayload(rawText: string | null | undefined): PushPayload {
  const defaults: PushPayload = {
    title: 'PWA Template',
    body: 'You have a new notification.',
    url: '/',
    icon: '/icons/icon-192.png',
  };

  if (!rawText) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(rawText) as Partial<PushPayload>;
    return {
      title: typeof parsed.title === 'string' && parsed.title ? parsed.title : defaults.title,
      body: typeof parsed.body === 'string' ? parsed.body : defaults.body,
      url: typeof parsed.url === 'string' && parsed.url ? parsed.url : defaults.url,
      icon: typeof parsed.icon === 'string' && parsed.icon ? parsed.icon : defaults.icon,
    };
  } catch {
    return { ...defaults, body: rawText };
  }
}

export async function precacheAppShell(cacheStorage: CacheStorage): Promise<void> {
  const cache = await cacheStorage.open(CACHE_NAME);
  await cache.addAll([...PRECACHE_ASSETS]);
}

export async function cleanupOldCaches(cacheStorage: CacheStorage): Promise<void> {
  const keys = await cacheStorage.keys();
  await Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => cacheStorage.delete(key)),
  );
}

export async function handleFetchRequest(
  request: Request,
  cacheStorage: CacheStorage,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const cache = await cacheStorage.open(CACHE_NAME);

  if (request.mode === 'navigate') {
    try {
      const networkResponse = await fetcher(request);
      if (networkResponse.ok) {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch {
      const cached = (await cache.match(request)) ?? (await cache.match('/index.html')) ?? (await cache.match('/'));
      if (cached) {
        return cached;
      }
      return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
  }

  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  try {
    const networkResponse = await fetcher(request);
    if (networkResponse.ok && networkResponse.type === 'basic') {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

const isServiceWorkerScope =
  typeof self !== 'undefined' && 'skipWaiting' in self && 'clients' in self;

if (isServiceWorkerScope) {
  const sw = self as unknown as ServiceWorkerGlobalScope;

  sw.addEventListener('install', (event) => {
    event.waitUntil(
      precacheAppShell(sw.caches).then(() => sw.skipWaiting()),
    );
  });

  sw.addEventListener('activate', (event) => {
    event.waitUntil(
      cleanupOldCaches(sw.caches).then(() => sw.clients.claim()),
    );
  });

  sw.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== sw.location.origin) return;

    event.respondWith(handleFetchRequest(request, sw.caches));
  });

  sw.addEventListener('push', (event) => {
    const payload = parsePushPayload(event.data?.text());
    event.waitUntil(
      sw.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        badge: '/icons/icon-192.png',
        data: { url: payload.url },
      }),
    );
  });

  sw.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl =
      (event.notification.data as { url?: string } | undefined)?.url ?? '/';

    event.waitUntil(
      sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          if ('focus' in client && client.url.includes(targetUrl)) {
            return client.focus();
          }
        }
        return sw.clients.openWindow(targetUrl);
      }),
    );
  });
}
