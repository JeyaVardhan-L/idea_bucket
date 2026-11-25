import { startOfLocalDay, startOfLocalWeek } from './dates';
import { ITEM_TYPES, type Item, type ItemType } from './types';

export type ItemView = 'all' | 'today' | 'week' | 'recurring' | 'person';

export interface ItemFilter {
  view: ItemView;
  types: ItemType[]; // empty = all
  status: 'open' | 'done' | 'all';
  person: string | null;
  query: string;
}

export const DEFAULT_FILTER: ItemFilter = { view: 'all', types: [], status: 'open', person: null, query: '' };

export function applyFilter(items: Item[], f: ItemFilter, now: number): Item[] {
  const q = f.query.trim().toLowerCase();
  const day = startOfLocalDay(now);
  const week = startOfLocalWeek(now);
  let out = items.filter((it) => {
    if (f.status !== 'all' && it.status !== f.status) return false;
    if (f.types.length && !f.types.includes(it.type)) return false;
    if (f.person && (it.person ?? '').toLowerCase() !== f.person.toLowerCase()) return false;
    if (q && !`${it.text} ${it.person ?? ''}`.toLowerCase().includes(q)) return false;
    if (f.view === 'today' && it.last_seen_at < day && it.created_at < day) return false;
    if (f.view === 'week' && it.last_seen_at < week && it.created_at < week) return false;
    if (f.view === 'recurring' && it.count < 2) return false;
    if (f.view === 'person' && !it.person) return false;
    return true;
  });
  if (f.view === 'recurring') out = out.sort((a, b) => b.count - a.count || b.last_seen_at - a.last_seen_at);
  else out = out.sort((a, b) => b.last_seen_at - a.last_seen_at);
  return out;
}

export interface Section {
  key: string;
  title: string;
  type: ItemType | null;
  data: Item[];
}

export function groupByType(items: Item[]): Section[] {
  return ITEM_TYPES.map((t) => ({ key: t, title: TYPE_LABEL[t], type: t, data: items.filter((i) => i.type === t) })).filter(
    (s) => s.data.length > 0,
  );
}

export function groupByPerson(items: Item[]): Section[] {
  const m = new Map<string, Item[]>();
  for (const it of items) {
    const p = it.person?.trim() || 'No one';
    const key = p.toLowerCase();
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(it);
  }
  return [...m.entries()]
    .map(([key, data]) => ({ key, title: data[0]!.person?.trim() || 'No one', type: null, data }))
    .sort((a, b) => Number(a.key === 'no one') - Number(b.key === 'no one') || b.data.length - a.data.length || a.title.localeCompare(b.title));
}

export function distinctPeople(items: Item[]): string[] {
  const m = new Map<string, string>();
  for (const it of items) if (it.person?.trim()) m.set(it.person.trim().toLowerCase(), it.person.trim());
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}

export const TYPE_LABEL: Record<ItemType, string> = {
  task: 'Tasks',
  call: 'Calls',
  delegate: 'Delegate',
  idea: 'Ideas',
  learn: 'Learn',
  remember: 'Remember',
};
