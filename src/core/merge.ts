import type { LlmItem } from './llmParse';
import type { Item, ItemType } from './types';

export interface NewItemOp {
  op: 'insert';
  item: Item;
  excerpt: string;
  linkTo: string | null;
}

export interface DuplicateOp {
  op: 'duplicate';
  itemId: string;
  newText: string | null;
  newPerson: string | null;
  newDueDate: string | null;
  excerpt: string;
}

export type MergeOp = NewItemOp | DuplicateOp;

export interface MergeContext {
  captureId: string;
  transcript: string;
  now: number;
  /** alias (e1..) → real item id, from prompt.aliasCandidates */
  aliasToId: Map<string, string>;
  /** the open items that were offered to the model, keyed by real id */
  existing: Map<string, Item>;
  newId: () => string;
}

/** Numbers, capitalised words and long words: the "concrete details" we must not drop. */
export function detailTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.matchAll(/[A-Za-z0-9][A-Za-z0-9'’.-]*/g)) {
    const w = m[0].replace(/[.'’-]+$/, '');
    if (/\d/.test(w) || /^[A-Z]/.test(w) || w.length >= 7) out.add(w.toLowerCase());
  }
  return out;
}

/**
 * The text of a duplicate is only replaced when the new wording keeps every detail of the old
 * one and adds at least one more. That way a recurring thought can only get richer, never vaguer.
 */
export function shouldRefineText(oldText: string, newText: string): boolean {
  const a = detailTokens(oldText);
  const b = detailTokens(newText);
  if (newText.trim().toLowerCase() === oldText.trim().toLowerCase()) return false;
  for (const t of a) if (!b.has(t)) return false;
  for (const t of b) if (!a.has(t)) return true;
  return false;
}

function resolveId(ctx: MergeContext, id: string | null): string | null {
  if (!id) return null;
  const real = ctx.aliasToId.get(id.trim()) ?? (ctx.existing.has(id) ? id : null);
  return real && ctx.existing.has(real) ? real : null;
}

export function planMerge(items: LlmItem[], ctx: MergeContext): MergeOp[] {
  const ops: MergeOp[] = [];
  const dupSeen = new Map<string, DuplicateOp>();
  for (const it of items) {
    const excerpt = (it.excerpt && it.excerpt.trim()) || ctx.transcript.trim();
    const targetId = resolveId(ctx, it.match.id);
    if (it.match.kind === 'duplicate' && targetId) {
      const prev = ctx.existing.get(targetId)!;
      const prior = dupSeen.get(targetId);
      if (prior) {
        // Same capture mentions the thought twice: one count, but keep both excerpts.
        if (!prior.excerpt.includes(excerpt)) prior.excerpt = `${prior.excerpt} … ${excerpt}`;
        continue;
      }
      const op: DuplicateOp = {
        op: 'duplicate',
        itemId: targetId,
        newText: shouldRefineText(prev.text, it.text) ? it.text : null,
        newPerson: prev.person ? null : it.person,
        newDueDate: prev.due_date ? null : it.due_date,
        excerpt,
      };
      dupSeen.set(targetId, op);
      ops.push(op);
      continue;
    }
    const item: Item = {
      id: ctx.newId(),
      type: it.type as ItemType,
      text: it.text.trim(),
      person: it.person,
      due_date: it.due_date,
      status: 'open',
      count: 1,
      created_at: ctx.now,
      updated_at: ctx.now,
      last_seen_at: ctx.now,
    };
    // "related" with an unknown id, or "duplicate" with an unknown id, degrades to a plain new item.
    const linkTo = it.match.kind === 'related' || it.match.kind === 'duplicate' ? targetId : null;
    ops.push({ op: 'insert', item, excerpt, linkTo });
  }
  return ops;
}

/** If the model returned nothing for a real utterance, keep it as a "remember" item so nothing is lost. */
export function fallbackItemsForEmptyResult(transcript: string): LlmItem[] {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (words.length < 4) return [];
  const text = words.length > 40 ? `${words.slice(0, 40).join(' ')}…` : words.join(' ');
  return [
    {
      type: 'remember',
      text,
      person: null,
      due_date: null,
      excerpt: transcript.trim(),
      match: { kind: 'new', id: null },
    },
  ];
}

/** Canonical ordering so a link is stored once regardless of direction. */
export function linkPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
