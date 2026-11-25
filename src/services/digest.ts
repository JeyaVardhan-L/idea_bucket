import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { nextOccurrence, startOfLocalDay } from '../core/dates';
import { buildDigest } from '../core/digest';
import * as repo from '../db/repo';
import { getSettings } from './settingsService';

const CHANNEL = 'digest';
const DIGEST_ID = 'evening-digest';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Evening digest',
      importance: AndroidImportance.DEFAULT,
    });
  }
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/**
 * Local notifications carry fixed text, so the digest is (re)scheduled for the next evening
 * slot whenever the data changes or the app starts. The text reflects the state at that moment;
 * items captured later the same day trigger another reschedule.
 */
export async function rescheduleDigest(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(DIGEST_ID).catch(() => undefined);
    const s = await getSettings();
    if (!s.digestEnabled) return;
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const now = new Date();
    const when = nextOccurrence(now, s.digestHour, s.digestMinute);
    // If the slot is tomorrow, "today" in the digest is tomorrow's (still empty) day.
    const dayStart = startOfLocalDay(when.getTime());
    const today = (await repo.itemsSince(dayStart)).filter((i) => i.last_seen_at < when.getTime());
    const open = await repo.openItems();
    const d = buildDigest(today, open);
    await Notifications.scheduleNotificationAsync({
      identifier: DIGEST_ID,
      content: { title: d.title, body: d.body, data: { url: 'ideabucket://items' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
    });
  } catch (e) {
    console.warn('digest scheduling failed', e);
  }
}
