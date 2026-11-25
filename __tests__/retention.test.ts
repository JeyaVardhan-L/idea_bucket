import { capturesWithExpiredAudio } from '../src/core/retention';

const DAY = 86_400_000;
const now = 100 * DAY;
const c = (id: string, ageDays: number, transcript: string | null, status = 'processed' as const) => ({
  id, audio_path: `/a/${id}.wav`, transcript, created_at: now - ageDays * DAY, status,
});

describe('audio retention', () => {
  it('deletes only old audio that has a transcript', () => {
    const ids = capturesWithExpiredAudio([c('old', 8, 'hi'), c('new', 2, 'hi'), c('untranscribed', 30, null)], now, 7);
    expect(ids).toEqual(['old']);
  });
  it('skips captures whose audio is already gone', () => {
    expect(capturesWithExpiredAudio([{ ...c('x', 30, 'hi'), audio_path: null }], now, 7)).toEqual([]);
  });
  it('0 days means keep forever', () => {
    expect(capturesWithExpiredAudio([c('old', 300, 'hi')], now, 0)).toEqual([]);
  });
});
