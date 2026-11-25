import * as Network from 'expo-network';
import { todayForPrompt } from '../core/dates';
import { extractItems, LlmError } from '../core/llmClient';
import { fallbackItemsForEmptyResult, planMerge } from '../core/merge';
import { aliasCandidates, buildUserMessage } from '../core/prompt';
import { nextStep, retryTransition, transition, type StepResult } from '../core/queue';
import { selectRelevantItems } from '../core/relevance';
import type { Capture } from '../core/types';
import { getDb, notifyChange } from '../db/database';
import * as repo from '../db/repo';
import { fileExists } from './files';
import { getApiKey, getSettings } from './settingsService';
import { BadAudioError, ModelMissingError, transcribe } from './whisper';

let running: Promise<void> | null = null;
let rerun = false;
let paused = false;
let timer: ReturnType<typeof setTimeout> | null = null;

let activeRecordingId: string | null = null;

/** Pause heavy work while the microphone is recording, and protect that capture from recovery. */
export function setPipelinePaused(p: boolean, recordingId: string | null = null) {
  paused = p;
  activeRecordingId = p ? recordingId : null;
  if (!p) void kick();
}

/** Starts processing the queue unless already running (then it runs again afterwards). */
export function kick(): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        rerun = false;
        await processDue();
      } while (rerun && !paused);
    } finally {
      running = null;
      await scheduleNextWake();
    }
  })();
  return running;
}

async function scheduleNextWake() {
  if (timer) clearTimeout(timer);
  timer = null;
  try {
    const db = await getDb();
    const r = await db.getFirstAsync<{ t: number | null }>(
      "SELECT MIN(next_attempt_at) AS t FROM captures WHERE status IN ('recorded','transcribed') AND next_attempt_at IS NOT NULL",
    );
    if (r?.t != null) {
      const delay = Math.max(1000, Math.min(r.t - Date.now(), 2 ** 31 - 1));
      timer = setTimeout(() => void kick(), delay);
    }
  } catch {
    /* ignore */
  }
}

async function isOnline(): Promise<boolean> {
  try {
    const s = await Network.getNetworkStateAsync();
    return s.isConnected !== false && s.isInternetReachable !== false;
  } catch {
    return true; // unknown: let the request decide
  }
}

/** Processes every capture that is due, oldest first. Each capture runs to completion or its next wait. */
async function processDue(): Promise<void> {
  const pending = (await repo.listCaptures(['recorded', 'transcribed'], 1000)).reverse();
  for (const c of pending) {
    if (paused) return;
    if (c.id === activeRecordingId) continue;
    let cur: Capture | null = c;
    // a capture may go recorded → transcribed → processed in one pass
    for (let guard = 0; cur && guard < 3; guard++) {
      const step = nextStep(cur, Date.now());
      if (!step) break;
      if (step === 'extract' && !(await isOnline())) {
        await applyResult(cur, { kind: 'transient', error: 'Offline — will retry when the network is back' });
        break;
      }
      const result = step === 'transcribe' ? await doTranscribe(cur) : await doExtract(cur);
      if (result) await applyResult(cur, result);
      cur = await repo.getCapture(cur.id);
    }
  }
}

async function applyResult(c: Capture, r: StepResult) {
  if (r.kind === 'ok' && r.status === 'processed') return; // already written transactionally
  const t = transition(c, r, Date.now());
  await repo.updateCapture(c.id, t);
}

async function doTranscribe(c: Capture): Promise<StepResult | null> {
  if (!c.audio_path || !fileExists(c.audio_path)) {
    return { kind: 'fatal', error: 'Audio file is missing; cannot transcribe.' };
  }
  const settings = await getSettings();
  try {
    const text = await transcribe(c.audio_path, settings.whisperModel);
    await repo.updateCapture(c.id, { transcript: text });
    if (!text.trim()) {
      // nothing was said: done, no items
      await repo.updateCapture(c.id, { status: 'processed', error: null, attempts: 0, next_attempt_at: null });
      return null;
    }
    return { kind: 'ok', status: 'transcribed' };
  } catch (e) {
    if (e instanceof ModelMissingError) return { kind: 'blocked', error: e.message };
    if (e instanceof BadAudioError) return { kind: 'fatal', error: e.message };
    if (c.attempts >= 4) return { kind: 'fatal', error: `Transcription failed: ${(e as Error).message}` };
    return { kind: 'transient', error: `Transcription failed: ${(e as Error).message}` };
  }
}

async function doExtract(c: Capture): Promise<StepResult | null> {
  const transcript = (c.transcript ?? '').trim();
  if (!transcript) {
    await repo.updateCapture(c.id, { status: 'processed', error: null, next_attempt_at: null });
    return null;
  }
  const settings = await getSettings();
  const apiKey = await getApiKey();
  if (!apiKey) return { kind: 'fatal', error: 'No API key set. Add it in Settings, then tap Retry.' };

  const now = Date.now();
  const open = await repo.openItems();
  const candidates = selectRelevantItems(transcript, open, 200);
  const aliased = aliasCandidates(candidates.map(({ id, type, text }) => ({ id, type, text })));
  const message = buildUserMessage(todayForPrompt(new Date(now)), transcript, aliased);
  try {
    const out = await extractItems({ baseUrl: settings.baseUrl, apiKey, model: settings.model }, message);
    const llmItems = out.result.items.length ? out.result.items : fallbackItemsForEmptyResult(transcript);
    const ops = planMerge(llmItems, {
      captureId: c.id,
      transcript,
      now,
      aliasToId: aliased.aliasToId,
      existing: new Map(candidates.map((i) => [i.id, i])),
      newId: repo.newId,
    });
    await repo.applyMergeOps(c.id, ops, now);
    return { kind: 'ok', status: 'processed' };
  } catch (e) {
    if (e instanceof LlmError) {
      if (e.kind === 'transient') return { kind: 'transient', error: e.message, retryAfterMs: e.retryAfterMs };
      return { kind: 'fatal', error: e.message };
    }
    return { kind: 'transient', error: `Unexpected error: ${(e as Error).message}` };
  }
}

/** Manual "Retry": failed → back into the queue, waiting ones → due now. */
export async function retryAll(): Promise<void> {
  const list = await repo.listCaptures(['failed', 'recorded', 'transcribed'], 1000);
  for (const c of list) {
    const t = retryTransition(c);
    if (t) await repo.updateCapture(c.id, { ...t, error: c.status === 'failed' ? null : c.error });
  }
  notifyChange();
  await kick();
}

export async function retryOne(id: string): Promise<void> {
  const c = await repo.getCapture(id);
  if (!c) return;
  const t = retryTransition(c);
  if (t) await repo.updateCapture(id, { ...t, error: null });
  await kick();
}

/**
 * Called once at start-up: captures left in "recording" (app killed mid-recording) are recovered
 * as long as their audio exists, and orphan WAV files without a row are re-attached.
 */
export async function recoverInterrupted(listOrphans: () => { uri: string; id: string; mtime: number }[]): Promise<void> {
  const stuck = await repo.listCaptures(['recording'], 100);
  for (const c of stuck) {
    if (c.id === activeRecordingId) continue; // being recorded right now
    if (c.audio_path && fileExists(c.audio_path)) {
      await repo.updateCapture(c.id, { status: 'recorded', error: null, next_attempt_at: null });
    } else {
      await repo.updateCapture(c.id, { status: 'failed', error: 'Recording was interrupted before any audio was saved.' });
    }
  }
  const known = new Set((await repo.capturesWithAudio()).map((c) => c.id));
  for (const o of listOrphans()) {
    if (known.has(o.id) || o.id === activeRecordingId) continue;
    const exists = await repo.getCapture(o.id);
    if (exists) {
      if (!exists.audio_path) await repo.updateCapture(o.id, { audio_path: o.uri });
      continue;
    }
    await repo.insertCapture({
      id: o.id, audio_path: o.uri, transcript: null, status: 'recorded', error: null,
      created_at: o.mtime, attempts: 0, next_attempt_at: null, duration_ms: null,
    });
  }
}

let netSub: { remove: () => void } | null = null;
export function watchNetwork() {
  if (netSub) return;
  let wasOnline = true;
  netSub = Network.addNetworkStateListener((s) => {
    const online = s.isConnected !== false && s.isInternetReachable !== false;
    if (online && !wasOnline) {
      // network is back: everything waiting on the AI step becomes due now
      void (async () => {
        const db = await getDb();
        await db.runAsync("UPDATE captures SET next_attempt_at = NULL WHERE status = 'transcribed'");
        notifyChange();
        await kick();
      })();
    }
    wasOnline = online;
  });
}
