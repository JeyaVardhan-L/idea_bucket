import { Directory, File, Paths } from 'expo-file-system';

export function recordingsDir(): Directory {
  const d = new Directory(Paths.document, 'recordings');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export function modelsDir(): Directory {
  const d = new Directory(Paths.document, 'models');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export function recordingFile(captureId: string): File {
  return new File(recordingsDir(), `${captureId}.wav`);
}

export function fileExists(uri: string | null): boolean {
  if (!uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export function deleteFileQuietly(uri: string | null): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* already gone */
  }
}

/** whisper.rn wants a plain filesystem path. */
export function toPath(uri: string): string {
  return uri.startsWith('file://') ? decodeURI(uri.slice('file://'.length)) : uri;
}
