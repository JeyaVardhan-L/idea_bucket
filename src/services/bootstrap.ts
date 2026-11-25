import { AppState } from 'react-native';
import { getDb, subscribe } from '../db/database';
import { registerBackgroundQueue } from './backgroundTask';
import { rescheduleDigest } from './digest';
import { listRecordingFiles, runAudioRetention } from './maintenance';
import { kick, recoverInterrupted, watchNetwork } from './pipeline';

let started = false;

export async function bootstrap(): Promise<void> {
  if (started) return;
  started = true;
  await getDb();
  await recoverInterrupted(listRecordingFiles).catch((e) => console.warn('recovery failed', e));
  void runAudioRetention().catch((e) => console.warn('retention failed', e));
  watchNetwork();
  void kick();
  void rescheduleDigest();
  void registerBackgroundQueue();

  let digestTimer: ReturnType<typeof setTimeout> | null = null;
  subscribe(() => {
    if (digestTimer) clearTimeout(digestTimer);
    digestTimer = setTimeout(() => void rescheduleDigest(), 3000);
  });

  AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      void kick();
      void rescheduleDigest();
    }
  });
}
