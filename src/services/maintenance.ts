import { File } from 'expo-file-system';
import { capturesWithExpiredAudio } from '../core/retention';
import * as repo from '../db/repo';
import { deleteFileQuietly, recordingsDir } from './files';
import { getSettings } from './settingsService';

/** Deletes old audio whose transcript is safely stored. Transcripts are kept forever. */
export async function runAudioRetention(now = Date.now()): Promise<number> {
  const s = await getSettings();
  const caps = await repo.capturesWithAudio();
  const ids = new Set(capturesWithExpiredAudio(caps, now, s.audioRetentionDays));
  for (const c of caps) {
    if (!ids.has(c.id)) continue;
    deleteFileQuietly(c.audio_path);
    await repo.updateCapture(c.id, { audio_path: null });
  }
  return ids.size;
}

/** WAV files in the recordings folder, for crash recovery. */
export function listRecordingFiles(): { uri: string; id: string; mtime: number }[] {
  try {
    return recordingsDir()
      .list()
      .filter((e): e is File => e instanceof File && e.name.endsWith('.wav'))
      .map((f) => ({ uri: f.uri, id: f.name.replace(/\.wav$/, ''), mtime: f.modificationTime ?? Date.now() }));
  } catch {
    return [];
  }
}
