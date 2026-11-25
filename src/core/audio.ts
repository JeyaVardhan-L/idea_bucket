/** Level of a 16-bit PCM buffer in dBFS (−100 for digital silence). */
export function int16Dbfs(buf: ArrayBuffer): number {
  const s = new Int16Array(buf, 0, Math.floor(buf.byteLength / 2));
  if (s.length === 0) return -100;
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const v = s[i]! / 32768;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / s.length);
  return rms <= 0 ? -100 : Math.max(-100, 20 * Math.log10(rms));
}

export interface SilenceConfig {
  /** stop after this much silence once speech has been heard */
  silenceMs: number;
  /** stop after this much silence if no speech was ever heard */
  initialSilenceMs: number;
  /** hard cap on a single capture */
  maxMs: number;
}

/**
 * Adaptive voice-activity detector: tracks the noise floor and treats anything
 * clearly above it (and above an absolute floor) as speech.
 */
export class SilenceDetector {
  private noiseFloor = -60;
  private lastSpeechAt: number | null = null;
  private startedAt: number | null = null;
  speechHeard = false;

  constructor(private cfg: SilenceConfig) {}

  /** Feed a level reading; returns true when recording should auto-stop. */
  update(db: number, t: number): boolean {
    if (this.startedAt == null) this.startedAt = t;
    // slow rise, fast fall: the floor follows quiet periods, not speech
    this.noiseFloor = db < this.noiseFloor ? db * 0.3 + this.noiseFloor * 0.7 : db * 0.02 + this.noiseFloor * 0.98;
    const threshold = Math.max(this.noiseFloor + 12, -50);
    if (db > threshold) {
      this.speechHeard = true;
      this.lastSpeechAt = t;
    }
    const elapsed = t - this.startedAt;
    if (elapsed >= this.cfg.maxMs) return true;
    if (this.speechHeard && this.lastSpeechAt != null) return t - this.lastSpeechAt >= this.cfg.silenceMs;
    return elapsed >= this.cfg.initialSilenceMs;
  }
}

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

export function parseWavHeader(bytes: Uint8Array): WavInfo | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let off = 12;
  let fmt: { channels: number; sampleRate: number; bits: number } | null = null;
  while (off + 8 <= bytes.length) {
    const id = tag(off);
    const size = dv.getUint32(off + 4, true);
    if (id === 'fmt ') {
      fmt = { channels: dv.getUint16(off + 10, true), sampleRate: dv.getUint32(off + 12, true), bits: dv.getUint16(off + 22, true) };
    } else if (id === 'data' && fmt) {
      // header may not be finalised if the app died mid-recording: trust the file length
      const available = bytes.length - (off + 8);
      const dataLength = size === 0 || size > available ? available : size;
      return { sampleRate: fmt.sampleRate, channels: fmt.channels, bitsPerSample: fmt.bits, dataOffset: off + 8, dataLength };
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

/** Mono 16-bit PCM at any rate → 16 kHz mono (linear interpolation). */
export function resampleTo16k(pcm: Int16Array, fromRate: number, channels = 1): Int16Array {
  const frames = Math.floor(pcm.length / channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += pcm[i * channels + c]!;
    mono[i] = s / channels;
  }
  if (fromRate === 16000) return Int16Array.from(mono, (v) => Math.round(v));
  const ratio = fromRate / 16000;
  const outLen = Math.floor(frames / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, frames - 1);
    const f = pos - i0;
    out[i] = Math.round(mono[i0]! * (1 - f) + mono[i1]! * f);
  }
  return out;
}

/** whisper.cpp marks non-speech as [BLANK_AUDIO], (music), [Silence] … — strip them. */
export function cleanTranscript(t: string): string {
  return t
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\((?:music|silence|noise|inaudible|blank_audio|background[^)]*)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
