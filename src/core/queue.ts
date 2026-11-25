import type { Capture, CaptureStatus } from './types';

export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 60 * 60_000;

/** Exponential backoff with ±20% jitter: 30s, 60s, 2m, 4m … capped at 1h. Honours Retry-After. */
export function backoffDelay(attempts: number, retryAfterMs: number | null = null, rand: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  const jittered = Math.round(exp * (0.8 + 0.4 * rand()));
  const delay = Math.min(BACKOFF_MAX_MS, jittered);
  return retryAfterMs != null ? Math.max(delay, Math.min(retryAfterMs, BACKOFF_MAX_MS)) : delay;
}

export type QueueStep = 'transcribe' | 'extract' | null;

/** What the pipeline should do next with this capture (null = nothing right now). */
export function nextStep(c: Pick<Capture, 'status' | 'next_attempt_at' | 'transcript'>, now: number): QueueStep {
  if (c.next_attempt_at != null && c.next_attempt_at > now) return null;
  if (c.status === 'recorded') return 'transcribe';
  if (c.status === 'transcribed') return 'extract';
  return null;
}

export function isPending(status: CaptureStatus): boolean {
  return status === 'recorded' || status === 'transcribed';
}

export interface Transition {
  status: CaptureStatus;
  error: string | null;
  attempts: number;
  next_attempt_at: number | null;
}

export type StepResult =
  | { kind: 'ok'; status: 'transcribed' | 'processed' }
  | { kind: 'transient'; error: string; retryAfterMs?: number | null }
  | { kind: 'blocked'; error: string } // waiting on the user (no model downloaded); no retry storm
  | { kind: 'fatal'; error: string };

export function transition(c: Pick<Capture, 'status' | 'attempts'>, r: StepResult, now: number, rand?: () => number): Transition {
  switch (r.kind) {
    case 'ok':
      return { status: r.status, error: null, attempts: 0, next_attempt_at: null };
    case 'transient': {
      const attempts = c.attempts + 1;
      return { status: c.status, error: r.error, attempts, next_attempt_at: now + backoffDelay(attempts, r.retryAfterMs ?? null, rand) };
    }
    case 'blocked':
      return { status: c.status, error: r.error, attempts: c.attempts, next_attempt_at: now + BACKOFF_MAX_MS };
    case 'fatal':
      return { status: 'failed', error: r.error, attempts: c.attempts + 1, next_attempt_at: null };
  }
}

/** Manual retry: failed captures go back to the right stage; everything pending becomes due now. */
export function retryTransition(c: Pick<Capture, 'status' | 'transcript' | 'audio_path'>): Pick<Transition, 'status' | 'next_attempt_at' | 'attempts'> | null {
  if (c.status === 'failed') {
    if (c.transcript != null) return { status: 'transcribed', next_attempt_at: null, attempts: 0 };
    if (c.audio_path) return { status: 'recorded', next_attempt_at: null, attempts: 0 };
    return null;
  }
  if (isPending(c.status)) return { status: c.status, next_attempt_at: null, attempts: 0 };
  return null;
}
