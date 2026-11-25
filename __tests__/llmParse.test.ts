import { extractJsonText, parseLlmOutput, repairJson } from '../src/core/llmParse';

const good = { items: [{ type: 'task', text: 'Buy milk', person: null, due_date: null, match: { kind: 'new', id: null } }] };

describe('extractJsonText', () => {
  it('strips code fences', () => {
    expect(extractJsonText('```json\n{"items":[]}\n```')).toBe('{"items":[]}');
  });
  it('strips think blocks and prose', () => {
    expect(extractJsonText('<think>hmm {"x":1}</think>Sure! {"items":[]} hope that helps')).toBe('{"items":[]}');
  });
  it('handles a bare array', () => {
    expect(extractJsonText('Here: [1,2]')).toBe('[1,2]');
  });
});

describe('repairJson', () => {
  it('removes trailing commas and smart quotes', () => {
    expect(JSON.parse(repairJson('{“a”: [1,2,],}'))).toEqual({ a: [1, 2] });
  });
});

describe('parseLlmOutput', () => {
  it('parses valid output', () => {
    const r = parseLlmOutput(JSON.stringify(good));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.items[0]!.text).toBe('Buy milk');
  });
  it('repairs trailing commas inside fences', () => {
    const r = parseLlmOutput('```\n{"items":[{"type":"idea","text":"x","person":null,"due_date":null,"match":{"kind":"new","id":null}},]}\n```');
    expect(r.ok).toBe(true);
  });
  it('normalises synonyms, case, empty strings and bad dates', () => {
    const r = parseLlmOutput(
      JSON.stringify({ items: [{ type: 'TODO', text: ' Email Raj ', person: '', due_date: 'next friday', match: { kind: 'NEW', id: '' } }] }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const it = r.value.items[0]!;
    expect(it.type).toBe('task');
    expect(it.text).toBe('Email Raj');
    expect(it.person).toBeNull();
    expect(it.due_date).toBeNull();
    expect(it.match).toEqual({ kind: 'new', id: null });
  });
  it('defaults a missing match to new and keeps valid dates', () => {
    const r = parseLlmOutput(JSON.stringify({ items: [{ type: 'call', text: 'Call Ana', person: 'Ana', due_date: '2026-12-01' }] }));
    expect(r.ok && r.value.items[0]!.match.kind).toBe('new');
    expect(r.ok && r.value.items[0]!.due_date).toBe('2026-12-01');
  });
  it('rejects impossible dates', () => {
    const r = parseLlmOutput(JSON.stringify({ items: [{ type: 'task', text: 't', person: null, due_date: '2026-02-30', match: null }] }));
    expect(r.ok && r.value.items[0]!.due_date).toBeNull();
  });
  it('accepts a bare array of items', () => {
    const r = parseLlmOutput(JSON.stringify(good.items));
    expect(r.ok).toBe(true);
  });
  it('fails on unknown type', () => {
    const r = parseLlmOutput(JSON.stringify({ items: [{ type: 'banana', text: 'x', match: null }] }));
    expect(r.ok).toBe(false);
  });
  it('fails on non-JSON', () => {
    expect(parseLlmOutput('I could not do that').ok).toBe(false);
  });
  it('fails on empty text', () => {
    expect(parseLlmOutput(JSON.stringify({ items: [{ type: 'task', text: '  ', match: null }] })).ok).toBe(false);
  });
  it('tolerates missing person and due_date', () => {
    const r = parseLlmOutput(JSON.stringify({ items: [{ type: 'idea', text: 'x' }] }));
    expect(r.ok && r.value.items[0]).toMatchObject({ person: null, due_date: null, excerpt: null });
  });
  it('coerces numeric ids to strings', () => {
    const r = parseLlmOutput(JSON.stringify({ items: [{ type: 'task', text: 'x', match: { kind: 'duplicate', id: 3 } }] }));
    expect(r.ok && r.value.items[0]!.match.id).toBe('3');
  });
});
