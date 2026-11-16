/// <reference lib="webworker" />

import {
  LAST_LAUNCH_KEY,
  PREF_CACHE_NAME,
  PRIVACY_PREF_KEY,
  buildNotificationLaunchUrl,
  formatNotificationForPrivacy,
  parsePushPayload,
  type NotificationPrivacyMode,
} from './notifications.ts';

const SW_CONFIG_RAW = '__PWA_SW_CONFIG__';
const SW_CONFIG: { basePath: string; cacheVersion: string; assets: string[] } =
  SW_CONFIG_RAW.startsWith('__PWA_')
    ? { basePath: '/', cacheVersion: 'dev', assets: [] }
    : (JSON.parse(SW_CONFIG_RAW) as { basePath: string; cacheVersion: string; assets: string[] });

const BASE_PATH = SW_CONFIG.basePath;
export const CACHE_NAME = `pwa-template-${SW_CONFIG.cacheVersion}`;

export const PRECACHE_ASSETS: readonly string[] = [
  BASE_PATH,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}manifest.webmanifest`,
  `${BASE_PATH}icons/apple-touch-icon.png`,
  `${BASE_PATH}icons/icon-192.png`,
  `${BASE_PATH}icons/icon-512.png`,
  ...SW_CONFIG.assets,
];

export async function readPrivacyMode(cacheStorage: CacheStorage): Promise<NotificationPrivacyMode> {
  try {
    const cache = await cacheStorage.open(PREF_CACHE_NAME);
    const res = await cache.match(PRIVACY_PREF_KEY);
    const value = (await res?.text())?.trim();
    if (value === 'sender' || value === 'generic' || value === 'full') {
      return value;
    }
  } catch {
    // Fall back to full if CacheStorage is unavailable
  }
  return 'full';
}

export async function precacheAppShell(cacheStorage: CacheStorage): Promise<void> {
  const cache = await cacheStorage.open(CACHE_NAME);
  await cache.addAll([...PRECACHE_ASSETS]);
}

export async function cleanupOldCaches(cacheStorage: CacheStorage): Promise<void> {
  const keys = await cacheStorage.keys();
  await Promise.all(
    keys
      .filter((key) => key !== CACHE_NAME && key !== PREF_CACHE_NAME)
      .map((key) => cacheStorage.delete(key)),
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
      const cached =
        (await cache.match(request)) ??
        (await cache.match(`${BASE_PATH}index.html`)) ??
        (await cache.match(BASE_PATH));
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
    event.waitUntil(precacheAppShell(sw.caches));
  });

  sw.addEventListener('message', (event) => {
    const payload = event.data as { type?: string } | undefined;
    if (payload?.type === 'SKIP_WAITING') {
      void sw.skipWaiting();
    }
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
    const payload = parsePushPayload(event.data?.text(), BASE_PATH);
    event.waitUntil(
      readPrivacyMode(sw.caches).then((mode) => {
        const display = formatNotificationForPrivacy(payload, mode);
        return sw.registration.showNotification(display.title, {
          body: display.body,
          icon: payload.icon,
          badge: `${BASE_PATH}icons/icon-192.png`,
          data: { url: payload.url, title: payload.title, body: payload.body },
        });
      }),
    );
  });

  sw.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const rawData =
      (event.notification.data as { url?: string; title?: string; body?: string } | undefined) ??
      {};
    const data = {
      url: rawData.url ?? BASE_PATH,
      title: rawData.title ?? event.notification.title,
      body: rawData.body ?? event.notification.body,
    };
    const launchUrl = buildNotificationLaunchUrl(data.url, sw.location.origin, data);

    event.waitUntil(
      sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
        for (const client of clients) {
          if ('focus' in client && client.url.includes(data.url)) {
            await client.focus();
            client.postMessage({ type: 'NOTIFICATION_CLICK', data });
            return client;
          }
        }
        try {
          const cache = await sw.caches.open(PREF_CACHE_NAME);
          await cache.put(
            LAST_LAUNCH_KEY,
            new Response(JSON.stringify({ title: data.title, body: data.body })),
          );
        } catch {
          // Fall back to hash params if CacheStorage write fails
        }
        return sw.clients.openWindow(launchUrl);
      }),
    );
  });
}
