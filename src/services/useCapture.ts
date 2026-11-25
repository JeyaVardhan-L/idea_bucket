import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream, type AudioStreamBuffer } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { int16Dbfs, SilenceDetector } from '../core/audio';
import * as repo from '../db/repo';
import { fileExists, recordingFile } from './files';
import { kick, setPipelinePaused } from './pipeline';
import { getSettings } from './settingsService';

export type CapturePhase = 'idle' | 'starting' | 'recording' | 'saving';

export interface CaptureState {
  phase: CapturePhase;
  level: number; // 0..1 for the UI meter
  elapsedMs: number;
  savedAt: number | null;
  error: string | null;
}

/**
 * Microphone → WAV file on disk (16 kHz mono PCM, written natively while recording) with
 * live level metering for silence auto-stop. A capture row is created *before* the mic starts,
 * so even a crash mid-recording leaves a recoverable capture.
 */
export function useCapture() {
  const [state, setState] = useState<CaptureState>({ phase: 'idle', level: 0, elapsedMs: 0, savedAt: null, error: null });
  const phaseRef = useRef<CapturePhase>('idle');
  const detector = useRef<SilenceDetector | null>(null);
  const captureId = useRef<string | null>(null);
  const startedAt = useRef(0);
  const stopRef = useRef<() => Promise<void>>(async () => undefined);
  const lastUiUpdate = useRef(0);

  const setPhase = (phase: CapturePhase, extra: Partial<CaptureState> = {}) => {
    phaseRef.current = phase;
    setState((s) => ({ ...s, phase, ...extra }));
  };

  const onBuffer = useCallback((buf: AudioStreamBuffer) => {
    if (phaseRef.current !== 'recording' || !detector.current) return;
    const db = int16Dbfs(buf.data);
    const t = Date.now() - startedAt.current;
    const shouldStop = detector.current.update(db, t);
    if (t - lastUiUpdate.current > 80) {
      lastUiUpdate.current = t;
      setState((s) => ({ ...s, level: Math.max(0, Math.min(1, (db + 60) / 50)), elapsedMs: t }));
    }
    if (shouldStop) void stopRef.current();
  }, []);

  const { stream } = useAudioStream({ sampleRate: 16000, channels: 1, encoding: 'int16', onBuffer });

  const stop = useCallback(async () => {
    if (phaseRef.current !== 'recording') return;
    setPhase('saving');
    const id = captureId.current;
    let durationMs: number | null = Date.now() - startedAt.current;
    try {
      const res = await stream.stopFileRecordingAsync();
      durationMs = Math.round(res.duration * 1000);
    } catch (e) {
      console.warn('stopFileRecording failed', e);
    }
    try {
      stream.stop();
    } catch {
      /* already stopped */
    }
    if (id) {
      const audio = recordingFile(id).uri;
      if (fileExists(audio)) {
        await repo.updateCapture(id, { status: 'recorded', duration_ms: durationMs, error: null });
      } else {
        await repo.updateCapture(id, { status: 'failed', error: 'No audio was saved.' });
      }
    }
    captureId.current = null;
    detector.current = null;
    setPhase('idle', { savedAt: Date.now(), level: 0 });
    setPipelinePaused(false);
    void kick();
  }, [stream]);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;
    setPhase('starting', { error: null, elapsedMs: 0, level: 0 });
    let id: string | null = null;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) throw new Error('Microphone permission is needed to record.');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const settings = await getSettings();
      id = repo.newId();
      setPipelinePaused(true, id);
      const file = recordingFile(id);
      await repo.insertCapture({
        id, audio_path: file.uri, transcript: null, status: 'recording', error: null,
        created_at: Date.now(), attempts: 0, next_attempt_at: null, duration_ms: null,
      });
      captureId.current = id;
      await stream.start();
      await stream.startFileRecordingAsync({ uri: file.uri, format: 'wav' });
      detector.current = new SilenceDetector({
        silenceMs: settings.silenceSeconds * 1000,
        initialSilenceMs: Math.max(8000, settings.silenceSeconds * 2000),
        maxMs: 15 * 60_000,
      });
      startedAt.current = Date.now();
      lastUiUpdate.current = 0;
      setPhase('recording');
    } catch (e) {
      try {
        stream.stop();
      } catch {
        /* ignore */
      }
      if (id) {
        const hasAudio = fileExists(recordingFile(id).uri);
        await repo.updateCapture(id, hasAudio ? { status: 'recorded' } : { status: 'failed', error: `Could not start recording: ${(e as Error).message}` });
      }
      captureId.current = null;
      setPipelinePaused(false);
      setPhase('idle', { error: (e as Error).message });
    }
  }, [stream]);

  // Leaving the app mid-recording: save what we have rather than lose it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && phaseRef.current === 'recording') void stopRef.current();
    });
    return () => sub.remove();
  }, []);

  // Unmount safety net.
  useEffect(() => () => void stopRef.current(), []);

  return { state, start, stop };
}
