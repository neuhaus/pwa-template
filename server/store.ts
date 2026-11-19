import { DatabaseSync } from 'node:sqlite';
import type { PushSubscriptionData } from './webpush.ts';

export interface SubscriptionStore {
  upsert(sub: PushSubscriptionData, userId?: string | null): void;
  remove(endpoint: string): boolean;
  list(userId?: string): PushSubscriptionData[];
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
      user_id TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  const columns = db.prepare('PRAGMA table_info(subscriptions)').all() as Array<{ name: string }>;
  if (!columns.some((col) => col.name === 'user_id')) {
    db.exec('ALTER TABLE subscriptions ADD COLUMN user_id TEXT;');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);');

  const upsertStmt = db.prepare(`
    INSERT INTO subscriptions (endpoint, p256dh, auth, user_id, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_id = excluded.user_id
  `);
  const removeStmt = db.prepare('DELETE FROM subscriptions WHERE endpoint = ?');
  const listAllStmt = db.prepare('SELECT endpoint, p256dh, auth FROM subscriptions');
  const listByUserStmt = db.prepare(
    'SELECT endpoint, p256dh, auth FROM subscriptions WHERE user_id = ?',
  );
  const countStmt = db.prepare('SELECT COUNT(*) AS total FROM subscriptions');

  return {
    upsert(sub, userId = null) {
      upsertStmt.run(sub.endpoint, sub.keys.p256dh, sub.keys.auth, userId, Date.now());
    },
    remove(endpoint) {
      const result = removeStmt.run(endpoint);
      return Number(result.changes) > 0;
    },
    list(userId) {
      const rows = (userId ? listByUserStmt.all(userId) : listAllStmt.all()) as Array<{
        endpoint: string;
        p256dh: string;
        auth: string;
      }>;
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
