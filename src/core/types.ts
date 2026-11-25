export const ITEM_TYPES = ['task', 'call', 'delegate', 'idea', 'learn', 'remember'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/**
 * Capture lifecycle.
 * - recording: the microphone is still writing the WAV file (row exists so a crash never loses it)
 * - recorded: audio saved, waiting for on-device transcription
 * - transcribed: transcript saved, waiting for the AI step
 * - processed: items created/merged
 * - failed: needs attention (bad API key, unparsable AI output, ...). Manual retry re-queues it.
 */
export const CAPTURE_STATUSES = ['recording', 'recorded', 'transcribed', 'processed', 'failed'] as const;
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

export interface Capture {
  id: string;
  audio_path: string | null;
  transcript: string | null;
  status: CaptureStatus;
  error: string | null;
  created_at: number;
  attempts: number;
  next_attempt_at: number | null;
  duration_ms: number | null;
}

export interface Item {
  id: string;
  type: ItemType;
  text: string;
  person: string | null;
  due_date: string | null;
  status: 'open' | 'done';
  count: number;
  created_at: number;
  updated_at: number;
  last_seen_at: number;
}

export interface ItemSource {
  item_id: string;
  capture_id: string;
  excerpt: string;
  created_at: number;
}

export interface ItemLink {
  item_id_a: string;
  item_id_b: string;
}

/** Compact representation sent to the LLM. */
export interface CandidateItem {
  id: string;
  type: ItemType;
  text: string;
}
