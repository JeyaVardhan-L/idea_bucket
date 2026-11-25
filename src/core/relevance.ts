import type { Item } from './types';

const STOP = new Set(
  'a an the and or but so to of in on at for with about from by is are was were be been it this that i me my we our you your he she they them his her their do does did have has had will would should could can need needs want also just really like um uh okay ok yeah maybe some thing things get got go going call ask tell'.split(
    ' ',
  ),
);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t));
}

/**
 * Picks up to `limit` open items most likely to match the transcript:
 * word overlap first, then recurring items, then recently seen ones.
 */
export function selectRelevantItems(transcript: string, openItems: Item[], limit = 200): Item[] {
  if (openItems.length <= limit) return [...openItems].sort((a, b) => b.last_seen_at - a.last_seen_at);
  const t = new Set(tokens(transcript));
  const scored = openItems.map((it) => {
    const its = new Set([...tokens(it.text), ...tokens(it.person ?? '')]);
    let overlap = 0;
    its.forEach((w) => {
      if (t.has(w)) overlap++;
    });
    return { it, score: overlap * 10 + Math.min(it.count, 10) };
  });
  scored.sort((a, b) => b.score - a.score || b.it.last_seen_at - a.it.last_seen_at);
  return scored.slice(0, limit).map((s) => s.it);
}
