import type { Capture } from './types';

const DAY = 24 * 60 * 60_000;

/**
 * Audio may only be deleted when it is old AND its words are safely stored as a transcript.
 * A capture that was never transcribed keeps its audio forever, so a thought is never lost.
 */
export function capturesWithExpiredAudio(
  captures: Pick<Capture, 'id' | 'audio_path' | 'transcript' | 'created_at' | 'status'>[],
  now: number,
  retentionDays: number,
): string[] {
  if (retentionDays <= 0) return []; // 0 = keep forever
  const cutoff = now - retentionDays * DAY;
  return captures
    .filter((c) => c.audio_path && c.transcript != null && c.status !== 'recording' && c.created_at < cutoff)
    .map((c) => c.id);
}
