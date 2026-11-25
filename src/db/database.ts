import * as SQLite from 'expo-sqlite';
import type { KeyValueStore } from '../core/settings';

export type Db = SQLite.SQLiteDatabase;
/** The subset of the API shared by the database and an exclusive transaction. */
export type Exec = Pick<SQLite.SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY NOT NULL,
    audio_path TEXT,
    transcript TEXT,
    status TEXT NOT NULL,
    error TEXT,
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER,
    duration_ms INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_captures_status ON captures(status);
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    person TEXT,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    count INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
  CREATE TABLE IF NOT EXISTS item_sources (
    item_id TEXT NOT NULL,
    capture_id TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sources_item ON item_sources(item_id);
  CREATE INDEX IF NOT EXISTS idx_sources_capture ON item_sources(capture_id);
  CREATE TABLE IF NOT EXISTS item_links (
    item_id_a TEXT NOT NULL,
    item_id_b TEXT NOT NULL,
    PRIMARY KEY (item_id_a, item_id_b)
  );
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

let dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('ideabucket.db');
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = OFF;');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      let v = row?.user_version ?? 0;
      while (v < MIGRATIONS.length) {
        await db.withExclusiveTransactionAsync(async (tx) => {
          await tx.execAsync(MIGRATIONS[v]!);
          await tx.execAsync(`PRAGMA user_version = ${v + 1}`);
        });
        v++;
      }
      return db;
    })().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

export const kvStore: KeyValueStore = {
  async get(key) {
    const db = await getDb();
    const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
    return r?.value ?? null;
  },
  async set(key, value) {
    const db = await getDb();
    await db.runAsync('INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  },
};

// --- change notifications so screens re-query after writes ---
type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;
export function notifyChange() {
  version++;
  listeners.forEach((l) => l());
}
export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function getVersion() {
  return version;
}
