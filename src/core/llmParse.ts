import { z } from 'zod';
import { normaliseDueDate } from './dates';
import { ITEM_TYPES, type ItemType } from './types';

const TYPE_SYNONYMS: Record<string, ItemType> = {
  todo: 'task',
  'to-do': 'task',
  action: 'task',
  contact: 'call',
  message: 'call',
  email: 'call',
  phone: 'call',
  assign: 'delegate',
  delegation: 'delegate',
  study: 'learn',
  research: 'learn',
  note: 'remember',
  fact: 'remember',
  insight: 'remember',
  reminder: 'remember',
};

const itemTypeSchema = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  const s = v.trim().toLowerCase();
  return (ITEM_TYPES as readonly string[]).includes(s) ? s : (TYPE_SYNONYMS[s] ?? s);
}, z.enum(ITEM_TYPES));

const nullableString = z.preprocess((v) => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return v;
  const s = v.trim();
  return s === '' || /^(null|none|n\/a|unknown)$/i.test(s) ? null : s;
}, z.string().nullable());

const matchSchema = z.preprocess(
  (v) => (v === undefined || v === null ? { kind: 'new', id: null } : v),
  z.object({
    kind: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim().toLowerCase() : 'new'),
      z.enum(['new', 'duplicate', 'related']),
    ),
    id: z.preprocess((v) => (v === undefined ? null : typeof v === 'number' ? String(v) : v), nullableString),
  }),
);

export const llmItemSchema = z.object({
  type: itemTypeSchema,
  text: z.string().trim().min(1),
  person: nullableString.optional().transform((v) => v ?? null),
  due_date: z.unknown().optional().transform(normaliseDueDate),
  excerpt: nullableString.optional().transform((v) => v ?? null),
  match: matchSchema,
});

export const llmResultSchema = z.object({ items: z.array(llmItemSchema) });

export type LlmItem = z.infer<typeof llmItemSchema>;
export type LlmResult = z.infer<typeof llmResultSchema>;

/** Removes reasoning blocks and markdown fences, then isolates the outermost JSON value. */
export function extractJsonText(raw: string): string {
  let s = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // unterminated think block: drop everything up to the closing tag if present elsewhere
  s = s.replace(/^[\s\S]*<\/think>/i, '').trim();
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence?.[1]) s = fence[1].trim();
  const firstObj = s.indexOf('{');
  const firstArr = s.indexOf('[');
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);
  if (start === -1) return s;
  const close = s[start] === '{' ? '}' : ']';
  const end = s.lastIndexOf(close);
  return end > start ? s.slice(start, end + 1) : s.slice(start);
}

/** Light repairs for common model slips: trailing commas, smart quotes, single-line comments. */
export function repairJson(s: string): string {
  return s
    .replace(/[“”]/g, '"')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');
}

export type ParseOutcome = { ok: true; value: LlmResult } | { ok: false; error: string };

export function parseLlmOutput(raw: string): ParseOutcome {
  const text = extractJsonText(raw);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    try {
      data = JSON.parse(repairJson(text));
    } catch (e) {
      return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
    }
  }
  // tolerate a bare array or a single item object
  if (Array.isArray(data)) data = { items: data };
  else if (data && typeof data === 'object' && !('items' in data) && 'text' in data) data = { items: [data] };
  const parsed = llmResultSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Schema mismatch at ${first?.path.join('.') || '(root)'}: ${first?.message ?? 'invalid'}` };
  }
  return { ok: true, value: parsed.data };
}
