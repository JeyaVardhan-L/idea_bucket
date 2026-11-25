import { detailTokens, fallbackItemsForEmptyResult, linkPair, planMerge, shouldRefineText, type MergeContext } from '../src/core/merge';
import type { LlmItem } from '../src/core/llmParse';
import { aliasCandidates } from '../src/core/prompt';
import type { Item } from '../src/core/types';

const mk = (id: string, text: string, extra: Partial<Item> = {}): Item => ({
  id, type: 'task', text, person: null, due_date: null, status: 'open', count: 1, created_at: 1, updated_at: 1, last_seen_at: 1, ...extra,
});
const li = (text: string, kind: 'new' | 'duplicate' | 'related' = 'new', id: string | null = null, extra: Partial<LlmItem> = {}): LlmItem => ({
  type: 'task', text, person: null, due_date: null, excerpt: null, match: { kind, id }, ...extra,
});

function ctx(existing: Item[]): MergeContext {
  const a = aliasCandidates(existing.map(({ id, type, text }) => ({ id, type, text })));
  let n = 0;
  return { captureId: 'c1', transcript: 'raw words', now: 100, aliasToId: a.aliasToId, existing: new Map(existing.map((e) => [e.id, e])), newId: () => `new${++n}` };
}

describe('planMerge', () => {
  it('inserts new items with the transcript as excerpt fallback', () => {
    const ops = planMerge([li('Buy milk')], ctx([]));
    expect(ops).toEqual([expect.objectContaining({ op: 'insert', excerpt: 'raw words', linkTo: null })]);
    const ins = ops[0]!;
    if (ins.op === 'insert') expect(ins.item).toMatchObject({ id: 'new1', count: 1, status: 'open', created_at: 100, last_seen_at: 100 });
  });
  it('maps duplicate aliases back to real ids', () => {
    const ops = planMerge([li('Call mum', 'duplicate', 'e2', { excerpt: 'ring mum' })], ctx([mk('A', 'x'), mk('B', 'Call mum')]));
    expect(ops).toEqual([expect.objectContaining({ op: 'duplicate', itemId: 'B', excerpt: 'ring mum', newText: null })]);
  });
  it('refines text only when it adds detail', () => {
    const ops = planMerge([li('Call Mum about Sunday lunch at 1pm', 'duplicate', 'e1')], ctx([mk('A', 'Call Mum about Sunday lunch')]));
    expect(ops[0]).toMatchObject({ op: 'duplicate', newText: 'Call Mum about Sunday lunch at 1pm' });
    const ops2 = planMerge([li('Call Mum', 'duplicate', 'e1')], ctx([mk('A', 'Call Mum about Sunday lunch')]));
    expect(ops2[0]).toMatchObject({ newText: null });
  });
  it('fills person/due date only when previously empty', () => {
    const ops = planMerge([li('x', 'duplicate', 'e1', { person: 'Raj', due_date: '2026-12-01' })], ctx([mk('A', 'x', { person: 'Ravi' })]));
    expect(ops[0]).toMatchObject({ newPerson: null, newDueDate: '2026-12-01' });
  });
  it('treats duplicate of unknown id as new', () => {
    const ops = planMerge([li('x', 'duplicate', 'e9')], ctx([mk('A', 'y')]));
    expect(ops[0]).toMatchObject({ op: 'insert', linkTo: null });
  });
  it('inserts related items and links them', () => {
    const ops = planMerge([li('Book venue for party', 'related', 'e1')], ctx([mk('A', 'Plan party')]));
    expect(ops[0]).toMatchObject({ op: 'insert', linkTo: 'A' });
  });
  it('accepts real ids too', () => {
    const ops = planMerge([li('x', 'duplicate', 'A')], ctx([mk('A', 'x')]));
    expect(ops[0]).toMatchObject({ op: 'duplicate', itemId: 'A' });
  });
  it('counts a thought repeated within one capture once, keeping both excerpts', () => {
    const ops = planMerge([li('x', 'duplicate', 'e1', { excerpt: 'one' }), li('x', 'duplicate', 'e1', { excerpt: 'two' })], ctx([mk('A', 'x')]));
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ excerpt: 'one … two' });
  });
});

describe('helpers', () => {
  it('detailTokens picks names, numbers and long words', () => {
    expect([...detailTokens('call Ravi at 5pm regarding invoice')]).toEqual(expect.arrayContaining(['ravi', '5pm', 'regarding']));
  });
  it('shouldRefineText rejects identical or lossy rewrites', () => {
    expect(shouldRefineText('Email Raj', 'email raj')).toBe(false);
    expect(shouldRefineText('Email Raj the Q3 report', 'Email Raj the report')).toBe(false);
  });
  it('fallback keeps meaningful transcripts and ignores noise', () => {
    expect(fallbackItemsForEmptyResult('test test')).toEqual([]);
    expect(fallbackItemsForEmptyResult('the blue door code is 4471')[0]).toMatchObject({ type: 'remember' });
  });
  it('linkPair is order independent', () => {
    expect(linkPair('b', 'a')).toEqual(['a', 'b']);
  });
});
