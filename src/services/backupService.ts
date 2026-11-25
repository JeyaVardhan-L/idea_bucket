import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { buildBackup, parseBackup } from '../core/backup';
import { localDateString } from '../core/dates';
import * as repo from '../db/repo';
import { getSettings } from './settingsService';

export async function exportBackup(): Promise<string> {
  const data = await repo.exportAll();
  const settings = await getSettings();
  const backup = buildBackup({ ...data, settings, now: Date.now() });
  const file = new File(Paths.cache, `idea-bucket-backup-${localDateString(new Date())}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup, null, 1));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save Idea Bucket backup' });
  }
  return `${data.items.length} items, ${data.captures.length} captures`;
}

export async function importBackupFromPicker(): Promise<string | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const text = await new File(res.assets[0].uri).text();
  const parsed = parseBackup(text);
  if (!parsed.ok) throw new Error(parsed.error);
  const r = await repo.importBackup(parsed.backup);
  return `Imported ${r.items} new items and ${r.captures} captures.`;
}
