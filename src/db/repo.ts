import { randomUUID } from 'expo-crypto';
import type { Backup } from '../core/backup';
import { linkPair, type MergeOp } from '../core/merge';
import type { Capture, CaptureStatus, Item, ItemLink, ItemSource } from '../core/types';
import { getDb, notifyChange, type Exec } from './database';

export const newId = () => randomUUID();

// ---------- captures ----------

export async function insertCapture(c: Capture): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO captures(id, audio_path, transcript, status, error, created_at, attempts, next_attempt_at, duration_ms) VALUES (?,?,?,?,?,?,?,?,?)',
    c.id, c.audio_path, c.transcript, c.status, c.error, c.created_at, c.attempts, c.next_attempt_at, c.duration_ms,
  );
  notifyChange();
}

export async function updateCapture(id: string, patch: Partial<Omit<Capture, 'id'>>, exec?: Exec): Promise<void> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  const db = exec ?? (await getDb());
  await db.runAsync(
    `UPDATE captures SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    ...keys.map((k) => (patch[k] ?? null) as string | number | null),
    id,
  );
  if (!exec) notifyChange();
}

export async function getCapture(id: string): Promise<Capture | null> {
  const db = await getDb();
  return db.getFirstAsync<Capture>('SELECT * FROM captures WHERE id = ?', id);
}

export async function listCaptures(statuses?: CaptureStatus[], limit = 500): Promise<Capture[]> {
  const db = await getDb();
  if (statuses?.length) {
    return db.getAllAsync<Capture>(
      `SELECT * FROM captures WHERE status IN (${statuses.map(() => '?').join(',')}) ORDER BY created_at DESC LIMIT ?`,
      ...statuses,
      limit,
    );
  }
  return db.getAllAsync<Capture>('SELECT * FROM captures ORDER BY created_at DESC LIMIT ?', limit);
}

export async function allCaptures(): Promise<Capture[]> {
  const db = await getDb();
  return db.getAllAsync<Capture>('SELECT * FROM captures ORDER BY created_at');
}

export async function capturesWithAudio(): Promise<Capture[]> {
  const db = await getDb();
  return db.getAllAsync<Capture>('SELECT * FROM captures WHERE audio_path IS NOT NULL');
}

export async function queueCounts(): Promise<{ pending: number; failed: number }> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ pending: number; failed: number }>(
    "SELECT SUM(CASE WHEN status IN ('recorded','transcribed') THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed FROM captures",
  );
  return { pending: r?.pending ?? 0, failed: r?.failed ?? 0 };
}

// ---------- items ----------

export async function listItems(): Promise<Item[]> {
  const db = await getDb();
  return db.getAllAsync<Item>('SELECT * FROM items ORDER BY last_seen_at DESC');
}

export async function openItems(): Promise<Item[]> {
  const db = await getDb();
  return db.getAllAsync<Item>("SELECT * FROM items WHERE status = 'open' ORDER BY last_seen_at DESC");
}

export async function itemsSince(ts: number): Promise<Item[]> {
  const db = await getDb();
  return db.getAllAsync<Item>('SELECT * FROM items WHERE last_seen_at >= ? OR created_at >= ? ORDER BY last_seen_at DESC', ts, ts);
}

export async function getItem(id: string): Promise<Item | null> {
  const db = await getDb();
  return db.getFirstAsync<Item>('SELECT * FROM items WHERE id = ?', id);
}

export async function updateItem(id: string, patch: Partial<Pick<Item, 'text' | 'status' | 'type' | 'person' | 'due_date'>>): Promise<void> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE items SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    ...keys.map((k) => (patch[k] ?? null) as string | null),
    Date.now(),
    id,
  );
  notifyChange();
}

/** Deletes the item only. Its source captures and transcripts are kept. */
export async function deleteItem(id: string): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM item_sources WHERE item_id = ?', id);
    await tx.runAsync('DELETE FROM item_links WHERE item_id_a = ? OR item_id_b = ?', id, id);
    await tx.runAsync('DELETE FROM items WHERE id = ?', id);
  });
  notifyChange();
}

export interface SourceWithCapture extends ItemSource {
  capture_created_at: number | null;
  transcript: string | null;
}

export async function sourcesForItem(id: string): Promise<SourceWithCapture[]> {
  const db = await getDb();
  return db.getAllAsync<SourceWithCapture>(
    `SELECT s.*, c.created_at AS capture_created_at, c.transcript AS transcript
     FROM item_sources s LEFT JOIN captures c ON c.id = s.capture_id
     WHERE s.item_id = ? ORDER BY s.created_at DESC`,
    id,
  );
}

export async function linkedItems(id: string): Promise<Item[]> {
  const db = await getDb();
  return db.getAllAsync<Item>(
    `SELECT i.* FROM item_links l JOIN items i ON i.id = CASE WHEN l.item_id_a = ? THEN l.item_id_b ELSE l.item_id_a END
     WHERE l.item_id_a = ? OR l.item_id_b = ?`,
    id, id, id,
  );
}

/** Applies a merge plan and marks the capture processed in ONE transaction. */
export async function applyMergeOps(captureId: string, ops: MergeOp[], now: number): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const op of ops) {
      if (op.op === 'insert') {
        const it = op.item;
        await tx.runAsync(
          'INSERT INTO items(id, type, text, person, due_date, status, count, created_at, updated_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          it.id, it.type, it.text, it.person, it.due_date, it.status, it.count, it.created_at, it.updated_at, it.last_seen_at,
        );
        await tx.runAsync('INSERT INTO item_sources(item_id, capture_id, excerpt, created_at) VALUES (?,?,?,?)', it.id, captureId, op.excerpt, now);
        if (op.linkTo) {
          const [a, b] = linkPair(it.id, op.linkTo);
          await tx.runAsync('INSERT OR IGNORE INTO item_links(item_id_a, item_id_b) VALUES (?,?)', a, b);
        }
      } else {
        await tx.runAsync(
          `UPDATE items SET count = count + 1, last_seen_at = ?, updated_at = ?,
             text = COALESCE(?, text), person = COALESCE(person, ?), due_date = COALESCE(due_date, ?)
           WHERE id = ?`,
          now, now, op.newText, op.newPerson, op.newDueDate, op.itemId,
        );
        await tx.runAsync('INSERT INTO item_sources(item_id, capture_id, excerpt, created_at) VALUES (?,?,?,?)', op.itemId, captureId, op.excerpt, now);
      }
    }
    await updateCapture(captureId, { status: 'processed', error: null, attempts: 0, next_attempt_at: null }, tx);
  });
  notifyChange();
}

// ---------- backup ----------

export async function exportAll(): Promise<{ captures: Capture[]; items: Item[]; sources: ItemSource[]; links: ItemLink[] }> {
  const db = await getDb();
  return {
    captures: await db.getAllAsync<Capture>('SELECT * FROM captures ORDER BY created_at'),
    items: await db.getAllAsync<Item>('SELECT * FROM items ORDER BY created_at'),
    sources: await db.getAllAsync<ItemSource>('SELECT * FROM item_sources'),
    links: await db.getAllAsync<ItemLink>('SELECT * FROM item_links'),
  };
}

/** Merge-import: rows with ids already on this device are left untouched. Returns counts added. */
export async function importBackup(b: Backup): Promise<{ captures: number; items: number }> {
  const db = await getDb();
  let captures = 0;
  let items = 0;
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const c of b.captures) {
      const r = await tx.runAsync(
        'INSERT OR IGNORE INTO captures(id, audio_path, transcript, status, error, created_at, attempts, next_attempt_at, duration_ms) VALUES (?,?,?,?,?,?,?,?,?)',
        c.id, null, c.transcript, c.status, c.error, c.created_at, 0, null, c.duration_ms,
      );
      captures += r.changes;
    }
    const newItemIds = new Set<string>();
    for (const it of b.items) {
      const r = await tx.runAsync(
        'INSERT OR IGNORE INTO items(id, type, text, person, due_date, status, count, created_at, updated_at, last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        it.id, it.type, it.text, it.person, it.due_date, it.status, it.count, it.created_at, it.updated_at, it.last_seen_at,
      );
      if (r.changes) newItemIds.add(it.id);
      items += r.changes;
    }
    for (const s of b.item_sources) {
      if (!newItemIds.has(s.item_id)) continue; // avoid duplicating sources of items we already had
      await tx.runAsync('INSERT INTO item_sources(item_id, capture_id, excerpt, created_at) VALUES (?,?,?,?)', s.item_id, s.capture_id, s.excerpt, s.created_at);
    }
    for (const l of b.item_links) {
      const [a, c] = linkPair(l.item_id_a, l.item_id_b);
      await tx.runAsync('INSERT OR IGNORE INTO item_links(item_id_a, item_id_b) VALUES (?,?)', a, c);
    }
  });
  notifyChange();
  return { captures, items };
}
