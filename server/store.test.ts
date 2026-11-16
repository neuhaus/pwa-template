import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSubscriptionStore } from './store.ts';

describe('server/store (node:sqlite)', () => {
  it('upserts, lists, counts, and removes subscriptions', () => {
    const store = createSubscriptionStore(':memory:');
    try {
      assert.equal(store.count(), 0);

      store.upsert({
        endpoint: 'https://push.example/1',
        keys: { p256dh: 'pub1', auth: 'auth1' },
      });
      assert.equal(store.count(), 1);

      // Upsert same endpoint updates keys without duplicating
      store.upsert({
        endpoint: 'https://push.example/1',
        keys: { p256dh: 'pub2', auth: 'auth2' },
      });
      assert.equal(store.count(), 1);
      assert.deepEqual(store.list(), [
        { endpoint: 'https://push.example/1', keys: { p256dh: 'pub2', auth: 'auth2' } },
      ]);

      assert.equal(store.remove('https://push.example/1'), true);
      assert.equal(store.remove('https://push.example/1'), false);
      assert.equal(store.count(), 0);
    } finally {
      store.close();
    }
  });
});
