import { AppState } from 'react-native';
import { getDb, kvStore, subscribe } from '../db/database';
import { registerBackgroundQueue } from './backgroundTask';
import { ensureNotificationPermission, rescheduleDigest } from './digest';
import { getSettings } from './settingsService';
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
  void (async () => {
    // ask once for notification permission (evening digest is on by default)
    if ((await getSettings()).digestEnabled && !(await kvStore.get('asked.notifications'))) {
      await kvStore.set('asked.notifications', '1');
      await ensureNotificationPermission().catch(() => false);
    }
    await rescheduleDigest();
  })();
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
