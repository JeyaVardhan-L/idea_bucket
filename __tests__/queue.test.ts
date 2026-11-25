import { BACKOFF_MAX_MS, backoffDelay, nextStep, retryTransition, transition } from '../src/core/queue';

const half = () => 0.5;

describe('backoff', () => {
  it('grows exponentially and caps', () => {
    expect(backoffDelay(1, null, half)).toBe(30_000);
    expect(backoffDelay(2, null, half)).toBe(60_000);
    expect(backoffDelay(4, null, half)).toBe(240_000);
    expect(backoffDelay(30, null, half)).toBe(BACKOFF_MAX_MS);
  });
  it('applies jitter within ±20%', () => {
    expect(backoffDelay(1, null, () => 0)).toBe(24_000);
    expect(backoffDelay(1, null, () => 1)).toBe(36_000);
  });
  it('honours Retry-After when longer', () => {
    expect(backoffDelay(1, 120_000, half)).toBe(120_000);
    expect(backoffDelay(3, 1_000, half)).toBe(120_000);
  });
});

describe('state machine', () => {
  const base = { status: 'recorded' as const, attempts: 0, next_attempt_at: null, transcript: null };
  it('chooses the next step', () => {
    expect(nextStep(base, 0)).toBe('transcribe');
    expect(nextStep({ ...base, status: 'transcribed' }, 0)).toBe('extract');
    expect(nextStep({ ...base, status: 'processed' }, 0)).toBeNull();
    expect(nextStep({ ...base, status: 'failed' }, 0)).toBeNull();
    expect(nextStep({ ...base, status: 'recording' }, 0)).toBeNull();
    expect(nextStep({ ...base, next_attempt_at: 10 }, 5)).toBeNull();
    expect(nextStep({ ...base, next_attempt_at: 10 }, 10)).toBe('transcribe');
  });
  it('ok resets attempts', () => {
    expect(transition({ status: 'recorded', attempts: 3 }, { kind: 'ok', status: 'transcribed' }, 0)).toEqual({ status: 'transcribed', error: null, attempts: 0, next_attempt_at: null });
  });
  it('transient keeps status and schedules retry', () => {
    const t = transition({ status: 'transcribed', attempts: 1 }, { kind: 'transient', error: 'offline' }, 1000, half);
    expect(t).toEqual({ status: 'transcribed', error: 'offline', attempts: 2, next_attempt_at: 61_000 });
  });
  it('blocked waits without counting attempts', () => {
    const t = transition({ status: 'recorded', attempts: 0 }, { kind: 'blocked', error: 'no model' }, 0);
    expect(t).toMatchObject({ status: 'recorded', attempts: 0, next_attempt_at: BACKOFF_MAX_MS });
  });
  it('fatal marks failed', () => {
    expect(transition({ status: 'transcribed', attempts: 0 }, { kind: 'fatal', error: 'bad json' }, 0)).toMatchObject({ status: 'failed', error: 'bad json' });
  });
  it('manual retry returns failed captures to the right stage', () => {
    expect(retryTransition({ status: 'failed', transcript: 'hi', audio_path: 'a' })).toMatchObject({ status: 'transcribed' });
    expect(retryTransition({ status: 'failed', transcript: null, audio_path: 'a' })).toMatchObject({ status: 'recorded' });
    expect(retryTransition({ status: 'failed', transcript: null, audio_path: null })).toBeNull();
    expect(retryTransition({ status: 'transcribed', transcript: 'x', audio_path: null })).toMatchObject({ next_attempt_at: null });
    expect(retryTransition({ status: 'processed', transcript: 'x', audio_path: null })).toBeNull();
  });
});
