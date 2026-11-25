import { z } from 'zod';
import { CAPTURE_STATUSES, ITEM_TYPES } from './types';
import type { Capture, Item, ItemLink, ItemSource } from './types';
import { settingsSchema, type Settings } from './settings';

export const BACKUP_FORMAT = 'idea-bucket-backup';
export const BACKUP_VERSION = 1;

const captureSchema = z.object({
  id: z.string().min(1),
  audio_path: z.string().nullable(),
  transcript: z.string().nullable(),
  status: z.enum(CAPTURE_STATUSES),
  error: z.string().nullable(),
  created_at: z.number(),
  attempts: z.number().int().catch(0),
  next_attempt_at: z.number().nullable().catch(null),
  duration_ms: z.number().nullable().catch(null),
});

const itemSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ITEM_TYPES),
  text: z.string(),
  person: z.string().nullable(),
  due_date: z.string().nullable(),
  status: z.enum(['open', 'done']),
  count: z.number().int().min(1),
  created_at: z.number(),
  updated_at: z.number(),
  last_seen_at: z.number(),
});

const sourceSchema = z.object({
  item_id: z.string(),
  capture_id: z.string(),
  excerpt: z.string(),
  created_at: z.number().catch(0),
});

const linkSchema = z.object({ item_id_a: z.string(), item_id_b: z.string() });

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().max(BACKUP_VERSION),
  exported_at: z.number(),
  settings: settingsSchema.partial().optional(),
  captures: z.array(captureSchema),
  items: z.array(itemSchema),
  item_sources: z.array(sourceSchema),
  item_links: z.array(linkSchema),
});

export type Backup = z.infer<typeof backupSchema>;

export function buildBackup(data: {
  captures: Capture[];
  items: Item[];
  sources: ItemSource[];
  links: ItemLink[];
  settings: Settings;
  now: number;
}): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: data.now,
    settings: data.settings, // the API key lives in secure storage and is never exported
    captures: data.captures,
    items: data.items,
    item_sources: data.sources,
    item_links: data.links,
  };
}

export function parseBackup(text: string): { ok: true; backup: Backup } | { ok: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }
  const r = backupSchema.safeParse(json);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, error: `Not an Idea Bucket backup (${i?.path.join('.') || 'root'}: ${i?.message}).` };
  }
  // Audio files are not part of the backup; imported captures that were never transcribed
  // cannot be re-processed on this device, so mark them clearly.
  const captures = r.data.captures.map((c) =>
    c.transcript == null && c.status !== 'processed'
      ? { ...c, audio_path: null, status: 'failed' as const, error: 'Imported without audio; cannot transcribe.' }
      : { ...c, audio_path: null, status: c.status === 'recording' ? ('transcribed' as const) : c.status },
  );
  return { ok: true, backup: { ...r.data, captures } };
}
