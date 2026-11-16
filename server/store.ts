import { DatabaseSync } from 'node:sqlite';
import type { PushSubscriptionData } from './webpush.ts';

export interface SubscriptionStore {
  upsert(sub: PushSubscriptionData): void;
  remove(endpoint: string): boolean;
  list(): PushSubscriptionData[];
  count(): number;
  close(): void;
}

export function createSubscriptionStore(
  dbPath = process.env.DB_PATH ?? './subscriptions.sqlite',
): SubscriptionStore {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS subscriptions (
      endpoint TEXT PRIMARY KEY,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO subscriptions (endpoint, p256dh, auth, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth
  `);
  const removeStmt = db.prepare('DELETE FROM subscriptions WHERE endpoint = ?');
  const listStmt = db.prepare('SELECT endpoint, p256dh, auth FROM subscriptions');
  const countStmt = db.prepare('SELECT COUNT(*) AS total FROM subscriptions');

  return {
    upsert(sub) {
      upsertStmt.run(sub.endpoint, sub.keys.p256dh, sub.keys.auth, Date.now());
    },
    remove(endpoint) {
      const result = removeStmt.run(endpoint);
      return Number(result.changes) > 0;
    },
    list() {
      const rows = listStmt.all() as Array<{ endpoint: string; p256dh: string; auth: string }>;
      return rows.map((row) => ({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      }));
    },
    count() {
      const row = countStmt.get() as { total: number };
      return Number(row.total);
    },
    close() {
      db.close();
    },
  };
}
