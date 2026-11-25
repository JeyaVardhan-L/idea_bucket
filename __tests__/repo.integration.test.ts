/**
 * Runs the real repository SQL (migrations, merge application, import) against SQLite.
 */
import { planMerge } from '../src/core/merge';
import { aliasCandidates } from '../src/core/prompt';
import type { LlmItem } from '../src/core/llmParse';
import type { Capture } from '../src/core/types';

jest.mock('expo-sqlite', () => {
  const { createFakeDb } = jest.requireActual('./helpers/nodeSqlite');
  return { openDatabaseAsync: async () => createFakeDb() };
});
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${++mockUuid}` }));

// eslint-disable-next-line import/first
import * as repo from '../src/db/repo';
// eslint-disable-next-line import/first
import { getDb } from '../src/db/database';

const cap = (id: string, transcript: string): Capture => ({
  id, audio_path: `/r/${id}.wav`, transcript, status: 'transcribed', error: null, created_at: 1000, attempts: 0, next_attempt_at: null, duration_ms: 3000,
});
const li = (text: string, kind: 'new' | 'duplicate' | 'related' = 'new', id: string | null = null, excerpt: string | null = null): LlmItem => ({
  type: 'task', text, person: null, due_date: null, excerpt, match: { kind, id },
});

async function run(captureId: string, transcript: string, items: LlmItem[], now: number) {
  const open = await repo.openItems();
  const a = aliasCandidates(open.map(({ id, type, text }) => ({ id, type, text })));
  const ops = planMerge(items, { captureId, transcript, now, aliasToId: a.aliasToId, existing: new Map(open.map((i) => [i.id, i])), newId: repo.newId });
  await repo.applyMergeOps(captureId, ops, now);
}

describe('repository + merge (SQLite)', () => {
  it('migrates, inserts, merges duplicates, links related, keeps every excerpt', async () => {
    const db = await getDb();
    expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version).toBe(1);

    await repo.insertCapture(cap('c1', 'call mum about sunday lunch'));
    await run('c1', 'call mum about sunday lunch', [li('Call Mum about Sunday lunch', 'new', null, 'call mum about sunday lunch')], 2000);
    let items = await repo.listItems();
    expect(items).toHaveLength(1);
    const mumId = items[0]!.id;
    expect((await repo.getCapture('c1'))!.status).toBe('processed');

    // duplicate with extra detail → count 2, text refined, second source
    await repo.insertCapture(cap('c2', 'ring mum re sunday lunch at 1pm'));
    await run('c2', 'ring mum re sunday lunch at 1pm', [li('Call Mum about Sunday lunch at 1pm', 'duplicate', 'e1', 'ring mum re sunday lunch at 1pm')], 3000);
    items = await repo.listItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: mumId, count: 2, last_seen_at: 3000, text: 'Call Mum about Sunday lunch at 1pm' });
    const sources = await repo.sourcesForItem(mumId);
    expect(sources.map((s) => s.excerpt).sort()).toEqual(['call mum about sunday lunch', 'ring mum re sunday lunch at 1pm']);
    expect(sources.every((s) => s.transcript)).toBe(true);

    // related → new item + link
    await repo.insertCapture(cap('c3', 'buy flowers for mum'));
    await run('c3', 'buy flowers for mum', [li('Buy flowers for Mum for Sunday lunch', 'related', 'e1')], 4000);
    items = await repo.listItems();
    expect(items).toHaveLength(2);
    const linked = await repo.linkedItems(mumId);
    expect(linked.map((i) => i.text)).toEqual(['Buy flowers for Mum for Sunday lunch']);

    // done items are not offered as duplicates; deleting keeps captures
    await repo.updateItem(mumId, { status: 'done' });
    expect((await repo.openItems()).map((i) => i.id)).not.toContain(mumId);
    await repo.deleteItem(mumId);
    expect(await repo.getItem(mumId)).toBeNull();
    expect(await repo.linkedItems(items.find((i) => i.id !== mumId)!.id)).toEqual([]);
    expect((await repo.allCaptures()).length).toBe(3);
    expect(await repo.queueCounts()).toEqual({ pending: 0, failed: 0 });
  });

  it('rolls back a failed merge so the capture stays queued', async () => {
    await repo.insertCapture(cap('c9', 'x'));
    const bad = [{ op: 'insert' as const, item: { id: null as unknown as string, type: 'task' as const, text: 'x', person: null, due_date: null, status: 'open' as const, count: 1, created_at: 1, updated_at: 1, last_seen_at: 1 }, excerpt: 'x', linkTo: null }];
    await expect(repo.applyMergeOps('c9', bad, 5)).rejects.toBeTruthy();
    expect((await repo.getCapture('c9'))!.status).toBe('transcribed');
  });

  it('import adds missing rows and never overwrites', async () => {
    const before = (await repo.listItems()).length;
    const existing = (await repo.listItems())[0]!;
    const r = await repo.importBackup({
      format: 'idea-bucket-backup', version: 1, exported_at: 1,
      captures: [cap('imp1', 'hello there')].map((c) => ({ ...c, audio_path: null, status: 'processed' as const })),
      items: [
        { ...existing, text: 'SHOULD NOT OVERWRITE' },
        { id: 'imp-item', type: 'idea', text: 'Imported idea', person: null, due_date: null, status: 'open', count: 1, created_at: 1, updated_at: 1, last_seen_at: 1 },
      ],
      item_sources: [{ item_id: 'imp-item', capture_id: 'imp1', excerpt: 'hello there', created_at: 1 }, { item_id: existing.id, capture_id: 'imp1', excerpt: 'dup', created_at: 1 }],
      item_links: [],
    });
    expect(r).toEqual({ captures: 1, items: 1 });
    expect((await repo.listItems()).length).toBe(before + 1);
    expect((await repo.getItem(existing.id))!.text).not.toBe('SHOULD NOT OVERWRITE');
    expect((await repo.sourcesForItem(existing.id)).map((s) => s.excerpt)).not.toContain('dup');
  });
});
