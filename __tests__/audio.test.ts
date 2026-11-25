import { cleanTranscript, int16Dbfs, parseWavHeader, resampleTo16k, SilenceDetector } from '../src/core/audio';

function wav(sampleRate: number, samples: number[], dataSize?: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const dv = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data');
  dv.setUint32(40, dataSize ?? samples.length * 2, true);
  samples.forEach((s, i) => dv.setInt16(44 + i * 2, s, true));
  return new Uint8Array(buf);
}

describe('audio helpers', () => {
  it('measures dBFS', () => {
    expect(int16Dbfs(new Int16Array(100).buffer)).toBe(-100);
    expect(int16Dbfs(new Int16Array(100).fill(32767).buffer)).toBeCloseTo(0, 0);
    expect(int16Dbfs(new Int16Array(100).fill(328).buffer)).toBeCloseTo(-40, 0);
  });
  it('parses WAV headers, including unfinalised ones', () => {
    expect(parseWavHeader(wav(16000, [1, 2, 3]))).toMatchObject({ sampleRate: 16000, channels: 1, bitsPerSample: 16, dataOffset: 44, dataLength: 6 });
    expect(parseWavHeader(wav(48000, [1, 2, 3, 4], 0))).toMatchObject({ dataLength: 8 });
    expect(parseWavHeader(new Uint8Array([1, 2, 3]))).toBeNull();
  });
  it('resamples 48k → 16k and downmixes stereo', () => {
    expect(resampleTo16k(new Int16Array(48000), 48000)).toHaveLength(16000);
    expect(Array.from(resampleTo16k(new Int16Array([100, 300, 100, 300]), 16000, 2))).toEqual([200, 200]);
  });
  it('cleans whisper markers', () => {
    expect(cleanTranscript(' [BLANK_AUDIO] hello (music)  world [Silence]')).toBe('hello world');
    expect(cleanTranscript('[BLANK_AUDIO]')).toBe('');
  });
});

describe('SilenceDetector', () => {
  const cfg = { silenceMs: 4000, initialSilenceMs: 8000, maxMs: 600_000 };
  it('stops ~4s after speech ends', () => {
    const d = new SilenceDetector(cfg);
    let t = 0;
    for (; t < 1000; t += 100) expect(d.update(-70, t)).toBe(false);
    for (; t < 3000; t += 100) expect(d.update(-20, t)).toBe(false);
    let stopAt = -1;
    for (; t < 10000; t += 100) if (d.update(-70, t)) { stopAt = t; break; }
    expect(stopAt).toBeGreaterThanOrEqual(6900);
    expect(stopAt).toBeLessThanOrEqual(7100);
  });
  it('keeps going through short pauses', () => {
    const d = new SilenceDetector(cfg);
    let t = 0;
    const seq = [[-20, 2000], [-70, 2500], [-20, 1000]] as const;
    for (const [db, dur] of seq) for (let e = 0; e < dur; e += 100, t += 100) expect(d.update(db, t)).toBe(false);
  });
  it('gives up after the initial silence window if no speech', () => {
    const d = new SilenceDetector(cfg);
    let stopped = -1;
    for (let t = 0; t < 20000; t += 100) if (d.update(-70, t)) { stopped = t; break; }
    expect(stopped).toBe(8000);
  });
  it('enforces the max length', () => {
    const d = new SilenceDetector({ ...cfg, maxMs: 1000 });
    expect(d.update(-10, 0)).toBe(false);
    expect(d.update(-10, 1000)).toBe(true);
  });
});
