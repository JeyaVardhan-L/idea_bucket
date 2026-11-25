import { DEFAULT_SETTINGS, loadSettings, saveSettings, whisperModelUrl, type KeyValueStore } from '../src/core/settings';

function memStore(init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...init };
  return { data, get: async (k) => data[k] ?? null, set: async (k, v) => void (data[k] = v) };
}

describe('settings persistence', () => {
  it('returns defaults when empty', async () => {
    expect(await loadSettings(memStore())).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ baseUrl: 'https://integrate.api.nvidia.com/v1', whisperModel: 'base.en', audioRetentionDays: 7, digestHour: 21 });
  });
  it('round-trips and merges patches', async () => {
    const s = memStore();
    await saveSettings(s, { model: 'x/y', digestHour: 20 });
    await saveSettings(s, { whisperModel: 'tiny.en' });
    expect(await loadSettings(s)).toMatchObject({ model: 'x/y', digestHour: 20, whisperModel: 'tiny.en' });
  });
  it('repairs invalid values field by field', async () => {
    const s = memStore({ 'settings.v1': JSON.stringify({ model: 'ok', digestHour: 99, whisperModel: 'large', digestEnabled: 'yes' }) });
    expect(await loadSettings(s)).toMatchObject({ model: 'ok', digestHour: 21, whisperModel: 'base.en', digestEnabled: true });
  });
  it('survives corrupt JSON', async () => {
    expect(await loadSettings(memStore({ 'settings.v1': '{oops' }))).toEqual(DEFAULT_SETTINGS);
  });
  it('never stores an API key', async () => {
    const s = memStore();
    await saveSettings(s, { apiKey: 'sk-very-secret' } as never);
    expect(s.data['settings.v1']).not.toContain('very-secret');
  });
  it('builds Hugging Face URLs', () => {
    expect(whisperModelUrl('tiny.en')).toBe('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin');
  });
});
