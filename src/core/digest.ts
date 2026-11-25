import type { Item, ItemType } from './types';

export interface DigestContent {
  title: string;
  body: string;
}

const PLURAL: Record<ItemType, [string, string]> = {
  task: ['task', 'tasks'],
  call: ['call', 'calls'],
  delegate: ['delegation', 'delegations'],
  idea: ['idea', 'ideas'],
  learn: ['thing to learn', 'things to learn'],
  remember: ['note', 'notes'],
};

/**
 * Evening digest. `todayItems` = items created or seen today; `openItems` = all open items
 * (used for the top recurring thought).
 */
export function buildDigest(todayItems: Item[], openItems: Item[]): DigestContent {
  const counts = new Map<ItemType, number>();
  for (const it of todayItems) counts.set(it.type, (counts.get(it.type) ?? 0) + 1);
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${n} ${PLURAL[t][n === 1 ? 0 : 1]}`);
  const top = [...openItems].filter((i) => i.count > 1).sort((a, b) => b.count - a.count || b.last_seen_at - a.last_seen_at)[0];
  const title = todayItems.length ? `Today: ${todayItems.length} thought${todayItems.length === 1 ? '' : 's'} captured` : 'Idea Bucket — evening digest';
  const lines: string[] = [];
  lines.push(parts.length ? parts.join(' · ') : 'No new thoughts today.');
  if (top) lines.push(`Keeps coming back (×${top.count}): ${top.text}`);
  return { title, body: lines.join('\n') };
}
