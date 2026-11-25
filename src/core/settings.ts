import { z } from 'zod';

export const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

export const WHISPER_MODELS = {
  'base.en': { file: 'ggml-base.en.bin', sizeMb: 142, label: 'base.en (better, ~142 MB)' },
  'tiny.en': { file: 'ggml-tiny.en.bin', sizeMb: 75, label: 'tiny.en (faster, ~75 MB)' },
} as const;
export type WhisperModelId = keyof typeof WHISPER_MODELS;

export const settingsSchema = z.object({
  baseUrl: z.string().trim().min(1).catch(DEFAULT_BASE_URL),
  model: z.string().trim().min(1).catch(DEFAULT_MODEL),
  whisperModel: z.enum(['base.en', 'tiny.en']).catch('base.en'),
  audioRetentionDays: z.coerce.number().int().min(0).max(3650).catch(7),
  digestEnabled: z.boolean().catch(true),
  digestHour: z.coerce.number().int().min(0).max(23).catch(21),
  digestMinute: z.coerce.number().int().min(0).max(59).catch(0),
  silenceSeconds: z.coerce.number().min(1).max(30).catch(4),
});

export type Settings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/** Key/value persistence: SQLite in the app, an in-memory map in tests. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

const SETTINGS_KEY = 'settings.v1';

export async function loadSettings(store: KeyValueStore): Promise<Settings> {
  const raw = await store.get(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    return settingsSchema.parse(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(store: KeyValueStore, patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings(store);
  const next = settingsSchema.parse({ ...current, ...patch });
  await store.set(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function whisperModelUrl(id: WhisperModelId): string {
  return `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODELS[id].file}`;
}
