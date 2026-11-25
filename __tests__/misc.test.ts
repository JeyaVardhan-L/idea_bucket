import { buildBackup, parseBackup } from '../src/core/backup';
import { buildDigest } from '../src/core/digest';
import { applyFilter, DEFAULT_FILTER, distinctPeople, groupByPerson, groupByType } from '../src/core/filters';
import { aliasCandidates, buildUserMessage } from '../src/core/prompt';
import { selectRelevantItems, tokens } from '../src/core/relevance';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import type { Capture, Item } from '../src/core/types';

const now = new Date(2026, 10, 25, 18).getTime();
const day = 86_400_000;
const mk = (id: string, text: string, extra: Partial<Item> = {}): Item => ({
  id, type: 'task', text, person: null, due_date: null, status: 'open', count: 1, created_at: now, updated_at: now, last_seen_at: now, ...extra,
});

describe('prompt', () => {
  it('aliases candidates and builds the message', () => {
    const a = aliasCandidates([{ id: 'uuid-1', type: 'call', text: 'Call Ana' }]);
    expect(a.aliasToId.get('e1')).toBe('uuid-1');
    const m = buildUserMessage('2026-11-25 (Wednesday)', ' hello ', a);
    expect(m).toContain('{"id":"e1","type":"call","text":"Call Ana"}');
    expect(m).toContain('"""hello"""');
    expect(buildUserMessage('d', 't', aliasCandidates([]))).toContain('(none)');
  });
});

describe('relevance', () => {
  it('tokenises without stopwords', () => {
    expect(tokens('Um, I need to call Ravi about the invoices')).toEqual(['ravi', 'invoice']);
  });
  it('returns everything when under the limit', () => {
    expect(selectRelevantItems('x', [mk('a', 'a'), mk('b', 'b')])).toHaveLength(2);
  });
  it('ranks overlapping items first when over the limit', () => {
    const items = Array.from({ length: 300 }, (_, i) => mk(`i${i}`, `unrelated ${i}`));
    items.push(mk('hit', 'Pay the electricity bill'));
    const sel = selectRelevantItems('remember the electricity bill', items, 200);
    expect(sel).toHaveLength(200);
    expect(sel[0]!.id).toBe('hit');
  });
});

describe('digest', () => {
  it('summarises counts and the top recurring item', () => {
    const d = buildDigest([mk('a', 'x'), mk('b', 'y'), mk('c', 'z', { type: 'idea' })], [mk('r', 'Fix the gate', { count: 4 }), mk('s', 'other', { count: 2 })]);
    expect(d.title).toBe('Today: 3 thoughts captured');
    expect(d.body).toContain('2 tasks · 1 idea');
    expect(d.body).toContain('×4): Fix the gate');
  });
  it('handles an empty day', () => {
    expect(buildDigest([], []).body).toBe('No new thoughts today.');
  });
});

describe('filters', () => {
  const items = [
    mk('a', 'Call Ravi', { type: 'call', person: 'Ravi', count: 3 }),
    mk('b', 'Old idea', { type: 'idea', created_at: now - 30 * day, last_seen_at: now - 30 * day }),
    mk('c', 'Done thing', { status: 'done' }),
    mk('d', 'ask ravi about keys', { person: 'ravi', created_at: now - 3 * day, last_seen_at: now - 3 * day }),
  ];
  it('defaults to open items', () => {
    expect(applyFilter(items, DEFAULT_FILTER, now).map((i) => i.id)).toEqual(['a', 'd', 'b']);
  });
  it('filters by view, type, person, search', () => {
    expect(applyFilter(items, { ...DEFAULT_FILTER, view: 'today' }, now).map((i) => i.id)).toEqual(['a']);
    expect(applyFilter(items, { ...DEFAULT_FILTER, view: 'recurring' }, now).map((i) => i.id)).toEqual(['a']);
    expect(applyFilter(items, { ...DEFAULT_FILTER, types: ['idea'] }, now).map((i) => i.id)).toEqual(['b']);
    expect(applyFilter(items, { ...DEFAULT_FILTER, person: 'RAVI' }, now).map((i) => i.id)).toEqual(['a', 'd']);
    expect(applyFilter(items, { ...DEFAULT_FILTER, query: 'keys' }, now).map((i) => i.id)).toEqual(['d']);
    expect(applyFilter(items, { ...DEFAULT_FILTER, status: 'done' }, now).map((i) => i.id)).toEqual(['c']);
  });
  it('groups', () => {
    expect(groupByType(items).map((s) => s.key)).toEqual(['task', 'call', 'idea']);
    expect(groupByPerson(items)[0]).toMatchObject({ title: 'Ravi' });
    expect(distinctPeople(items)).toEqual(['ravi']);
  });
});

describe('backup', () => {
  const cap: Capture = { id: 'c', audio_path: '/x.wav', transcript: 'hi', status: 'processed', error: null, created_at: 1, attempts: 0, next_attempt_at: null, duration_ms: 1000 };
  it('round-trips', () => {
    const b = buildBackup({ captures: [cap], items: [mk('a', 'x')], sources: [{ item_id: 'a', capture_id: 'c', excerpt: 'x', created_at: 1 }], links: [], settings: DEFAULT_SETTINGS, now });
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.backup.items).toHaveLength(1);
      expect(r.backup.captures[0]!.audio_path).toBeNull();
    }
  });
  it('marks untranscribed imports as failed', () => {
    const b = buildBackup({ captures: [{ ...cap, transcript: null, status: 'recorded' }], items: [], sources: [], links: [], settings: DEFAULT_SETTINGS, now });
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok && r.backup.captures[0]!.status).toBe('failed');
  });
  it('rejects foreign files', () => {
    expect(parseBackup('{"hello":1}').ok).toBe(false);
    expect(parseBackup('not json').ok).toBe(false);
  });
});
