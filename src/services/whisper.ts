import { File } from 'expo-file-system';
import { initWhisper, type WhisperContext } from 'whisper.rn/index';
import { cleanTranscript, parseWavHeader, resampleTo16k } from '../core/audio';
import { WHISPER_MODELS, whisperModelUrl, type WhisperModelId } from '../core/settings';
import { modelsDir, toPath } from './files';

export function modelFile(id: WhisperModelId): File {
  return new File(modelsDir(), WHISPER_MODELS[id].file);
}

export function isModelDownloaded(id: WhisperModelId): boolean {
  try {
    const f = modelFile(id);
    return f.exists && (f.size ?? 0) > WHISPER_MODELS[id].sizeMb * 0.8 * 1024 * 1024;
  } catch {
    return false;
  }
}

// ---- download (one at a time, observable) ----

export interface DownloadState {
  model: WhisperModelId | null;
  progress: number; // 0..1
  error: string | null;
  active: boolean;
}

let dl: DownloadState = { model: null, progress: 0, error: null, active: false };
const dlListeners = new Set<(s: DownloadState) => void>();
const setDl = (s: Partial<DownloadState>) => {
  dl = { ...dl, ...s };
  dlListeners.forEach((l) => l(dl));
};
export const getDownloadState = () => dl;
export function onDownloadState(l: (s: DownloadState) => void): () => void {
  dlListeners.add(l);
  return () => dlListeners.delete(l);
}

export async function downloadModel(id: WhisperModelId): Promise<boolean> {
  if (dl.active) return false;
  if (isModelDownloaded(id)) return true;
  setDl({ model: id, progress: 0, error: null, active: true });
  const part = new File(modelsDir(), `${WHISPER_MODELS[id].file}.part`);
  try {
    if (part.exists) part.delete();
    await File.downloadFileAsync(whisperModelUrl(id), part, {
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) setDl({ progress: bytesWritten / totalBytes });
      },
    });
    const final = modelFile(id);
    if (final.exists) final.delete();
    part.move(final);
    if (!isModelDownloaded(id)) throw new Error('Downloaded file is incomplete');
    setDl({ progress: 1, active: false });
    return true;
  } catch (e) {
    try {
      if (part.exists) part.delete();
    } catch {
      /* ignore */
    }
    setDl({ active: false, error: `Download failed: ${(e as Error).message}` });
    return false;
  }
}

export function deleteModel(id: WhisperModelId): void {
  if (loaded?.id === id) void releaseContext();
  const f = modelFile(id);
  if (f.exists) f.delete();
}

// ---- transcription ----

let loaded: { id: WhisperModelId; ctx: WhisperContext } | null = null;

async function releaseContext() {
  const l = loaded;
  loaded = null;
  if (l) await l.ctx.release().catch(() => undefined);
}

async function getContext(id: WhisperModelId): Promise<WhisperContext> {
  if (loaded?.id === id) return loaded.ctx;
  await releaseContext();
  const ctx = await initWhisper({ filePath: toPath(modelFile(id).uri), useGpu: false });
  loaded = { id, ctx };
  return ctx;
}

export class ModelMissingError extends Error {}
export class BadAudioError extends Error {}

/** Reads the WAV written by the recorder and returns 16 kHz mono int16 PCM. */
export async function loadPcm16k(uri: string): Promise<ArrayBuffer> {
  const f = new File(uri);
  if (!f.exists) throw new BadAudioError('Audio file is missing');
  const bytes = new Uint8Array(await f.arrayBuffer());
  const info = parseWavHeader(bytes);
  if (!info || info.bitsPerSample !== 16) throw new BadAudioError('Unsupported audio format');
  const usable = info.dataLength - (info.dataLength % 2);
  const pcm = new Int16Array(bytes.buffer.slice(bytes.byteOffset + info.dataOffset, bytes.byteOffset + info.dataOffset + usable));
  if (info.sampleRate === 16000 && info.channels === 1) return pcm.buffer as ArrayBuffer;
  return resampleTo16k(pcm, info.sampleRate, info.channels).buffer as ArrayBuffer;
}

export async function transcribe(uri: string, model: WhisperModelId): Promise<string> {
  if (!isModelDownloaded(model)) throw new ModelMissingError(`Speech model ${model} is not downloaded yet (Settings → Speech model).`);
  const pcm = await loadPcm16k(uri);
  if (pcm.byteLength < 16000 * 2 * 0.3) return ''; // < 0.3 s: nothing to transcribe
  const ctx = await getContext(model);
  const { promise } = ctx.transcribeData(pcm, { language: 'en', maxThreads: 4, temperature: 0 });
  const res = await promise;
  if (res.isAborted) throw new Error('Transcription aborted');
  return cleanTranscript(res.result ?? '');
}
