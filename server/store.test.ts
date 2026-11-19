import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSubscriptionStore } from './store.ts';

describe('server/store (node:sqlite)', () => {
  it('upserts, lists, counts, and removes subscriptions', () => {
    const store = createSubscriptionStore(':memory:');
    try {
      assert.equal(store.count(), 0);

      store.upsert(
        {
          endpoint: 'https://push.example/1',
          keys: { p256dh: 'pub1', auth: 'auth1' },
        },
        'user-a',
      );
      store.upsert(
        {
          endpoint: 'https://push.example/2',
          keys: { p256dh: 'pub2', auth: 'auth2' },
        },
        'user-b',
      );
      assert.equal(store.count(), 2);

      assert.deepEqual(store.list('user-a'), [
        { endpoint: 'https://push.example/1', keys: { p256dh: 'pub1', auth: 'auth1' } },
      ]);
      assert.equal(store.list().length, 2);

      // Upsert same endpoint updates keys without duplicating
      store.upsert(
        {
          endpoint: 'https://push.example/1',
          keys: { p256dh: 'pub1-new', auth: 'auth1-new' },
        },
        'user-a',
      );
      assert.equal(store.count(), 2);
      assert.deepEqual(store.list('user-a'), [
        { endpoint: 'https://push.example/1', keys: { p256dh: 'pub1-new', auth: 'auth1-new' } },
      ]);

      assert.equal(store.remove('https://push.example/1'), true);
      assert.equal(store.remove('https://push.example/1'), false);
      assert.equal(store.count(), 1);
    } finally {
      store.close();
    }
  });

  it('migrates legacy subscriptions table without user_id column', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pwa-store-'));
    const dbPath = join(dir, 'legacy.sqlite');
    try {
      const legacyDb = new DatabaseSync(dbPath);
      legacyDb.exec(`
        CREATE TABLE subscriptions (
          endpoint TEXT PRIMARY KEY,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);
      legacyDb.close();

      const store = createSubscriptionStore(dbPath);
      store.upsert(
        { endpoint: 'https://push.example/9', keys: { p256dh: 'p', auth: 'a' } },
        'user-9',
      );
      assert.equal(store.list('user-9').length, 1);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
