import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CACHE_NAME,
  PRECACHE_ASSETS,
  cleanupOldCaches,
  handleFetchRequest,
  parsePushPayload,
  precacheAppShell,
} from '../src/sw.ts';

function createMockCacheStorage(initial: Record<string, Record<string, Response>> = {}): CacheStorage {
  const stores = new Map<string, Map<string, Response>>();
  for (const [name, entries] of Object.entries(initial)) {
    stores.set(name, new Map(Object.entries(entries)));
  }

  const getStore = (name: string) => {
    let store = stores.get(name);
    if (!store) {
      store = new Map();
      stores.set(name, store);
    }
    return store;
  };

  return {
    async open(name: string) {
      const store = getStore(name);
      return {
        async addAll(urls: string[]) {
          for (const url of urls) {
            store.set(url, new Response(`cached:${url}`, { status: 200 }));
          }
        },
        async match(req: RequestInfo | URL) {
          const key = typeof req === 'string' ? req : req instanceof URL ? req.pathname : new URL(req.url).pathname;
          return store.get(key)?.clone();
        },
        async put(req: RequestInfo | URL, res: Response) {
          const key = typeof req === 'string' ? req : req instanceof URL ? req.pathname : new URL(req.url).pathname;
          store.set(key, res);
        },
      } as unknown as Cache;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  } as unknown as CacheStorage;
}

describe('parsePushPayload', () => {
  it('parses valid JSON payload with defaults', () => {
    const payload = parsePushPayload(JSON.stringify({ title: 'Alert', body: 'Deploy done' }));
    assert.equal(payload.title, 'Alert');
    assert.equal(payload.body, 'Deploy done');
    assert.equal(payload.url, '/');
  });

  it('falls back to plain text body when payload is not JSON', () => {
    const payload = parsePushPayload('Plain text message');
    assert.equal(payload.title, 'PWA Template');
    assert.equal(payload.body, 'Plain text message');
  });

  it('returns defaults for empty payload', () => {
    const payload = parsePushPayload(null);
    assert.equal(payload.title, 'PWA Template');
  });
});

describe('Service Worker caching', () => {
  it('precaches all app shell assets', async () => {
    const caches = createMockCacheStorage();
    await precacheAppShell(caches);
    const cache = await caches.open(CACHE_NAME);
    for (const asset of PRECACHE_ASSETS) {
      const hit = await cache.match(asset);
      assert.ok(hit, `Expected ${asset} to be precached`);
    }
  });

  it('deletes old caches on activate', async () => {
    const caches = createMockCacheStorage({
      'pwa-template-v0': {},
      [CACHE_NAME]: {},
    });
    await cleanupOldCaches(caches);
    assert.deepEqual(await caches.keys(), [CACHE_NAME]);
  });

  it('serves cached index.html for offline navigation requests', async () => {
    const caches = createMockCacheStorage({
      [CACHE_NAME]: {
        '/index.html': new Response('<html>offline-shell</html>', { status: 200 }),
      },
    });
    const navRequest = new Request('https://example.com/some-route');
    Object.defineProperty(navRequest, 'mode', { value: 'navigate' });

    const failingFetch = (async () => {
      throw new TypeError('NetworkError');
    }) as unknown as typeof fetch;

    const res = await handleFetchRequest(navRequest, caches, failingFetch);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '<html>offline-shell</html>');
  });

  it('serves static assets cache-first', async () => {
    const caches = createMockCacheStorage({
      [CACHE_NAME]: {
        '/icons/icon-192.png': new Response('png-bytes', { status: 200 }),
      },
    });
    let fetchCalled = false;
    const spyFetch = (async () => {
      fetchCalled = true;
      return new Response('network');
    }) as unknown as typeof fetch;

    const req = new Request('https://example.com/icons/icon-192.png');
    const res = await handleFetchRequest(req, caches, spyFetch);
    assert.equal(fetchCalled, false);
    assert.equal(await res.text(), 'png-bytes');
  });
});
