import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { testConnection } from '../../core/llmClient';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, WHISPER_MODELS, type WhisperModelId } from '../../core/settings';
import { retryAll } from '../../services/pipeline';
import { getApiKey, setApiKey, updateSettings, useSettings } from '../../services/settingsService';
import { deleteModel, downloadModel, getDownloadState, isModelDownloaded, onDownloadState, type DownloadState } from '../../services/whisper';
import { Chip } from '../../ui/components';
import { usePalette } from '../../ui/theme';

const PRESETS = [
  { label: 'NVIDIA NIM', url: DEFAULT_BASE_URL, model: DEFAULT_MODEL },
  { label: 'Groq', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct' },
  { label: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
];

export default function SettingsScreen() {
  const p = usePalette();
  const s = useSettings();
  const [baseUrl, setBaseUrl] = useState(s.baseUrl);
  const [model, setModel] = useState(s.model);
  const [keyInput, setKeyInput] = useState('');
  const [savedKeyHint, setSavedKeyHint] = useState<string | null>(null);
  const [test, setTest] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: false });
  const [dl, setDl] = useState<DownloadState>(getDownloadState());
  const [, force] = useState(0);
  const [retention, setRetention] = useState(String(s.audioRetentionDays));

  // keep the form in sync when saved settings change (adjust-state-during-render pattern)
  const [synced, setSynced] = useState(s);
  if (synced !== s) {
    setSynced(s);
    setBaseUrl(s.baseUrl);
    setModel(s.model);
    setRetention(String(s.audioRetentionDays));
  }

  useEffect(() => {
    getApiKey().then((k) => setSavedKeyHint(k ? `••••${k.slice(-4)}` : null));
    return onDownloadState((d) => {
      setDl(d);
      if (!d.active) force((n) => n + 1);
    });
  }, []);

  const aiDirty = baseUrl.trim() !== s.baseUrl || model.trim() !== s.model || keyInput.trim().length > 0;

  const saveAi = async () => {
    await updateSettings({ baseUrl: baseUrl.trim() || DEFAULT_BASE_URL, model: model.trim() || DEFAULT_MODEL });
    if (keyInput.trim()) {
      await setApiKey(keyInput);
      setSavedKeyHint(`••••${keyInput.trim().slice(-4)}`);
      setKeyInput('');
    }
    setTest({ busy: false, msg: 'Saved. Re-trying anything that was waiting…', ok: true });
    void retryAll();
  };

  const runTest = async () => {
    setTest({ busy: true, msg: null, ok: false });
    try {
      const key = keyInput.trim() || (await getApiKey());
      const reply = await testConnection({ baseUrl: baseUrl.trim(), model: model.trim(), apiKey: key });
      setTest({ busy: false, msg: `Connected ✓ (model replied “${reply}”)`, ok: true });
    } catch (e) {
      setTest({ busy: false, msg: (e as Error).message, ok: false });
    }
  };

  const input = [styles.input, { color: p.text, backgroundColor: p.card, borderColor: p.border }];
  const card = [styles.card, { backgroundColor: p.card, borderColor: p.border }];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: p.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 64 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.h, { color: p.text }]}>AI provider</Text>
      <View style={card}>
        <Text style={[styles.hint, { color: p.textDim }]}>Any OpenAI-compatible chat completions endpoint.</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {PRESETS.map((pr) => (
            <Chip
              key={pr.label}
              label={pr.label}
              active={baseUrl.trim() === pr.url}
              onPress={() => {
                setBaseUrl(pr.url);
                setModel(pr.model);
              }}
            />
          ))}
        </ScrollView>
        <Text style={[styles.label, { color: p.textDim }]}>Base URL</Text>
        <TextInput value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input} />
        <Text style={[styles.label, { color: p.textDim }]}>API key {savedKeyHint ? `(saved ${savedKeyHint})` : '(not set)'}</Text>
        <TextInput
          value={keyInput}
          onChangeText={setKeyInput}
          placeholder={savedKeyHint ? 'Enter a new key to replace' : 'Paste your API key'}
          placeholderTextColor={p.textFaint}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={input}
        />
        <Text style={[styles.label, { color: p.textDim }]}>Model</Text>
        <TextInput value={model} onChangeText={setModel} autoCapitalize="none" autoCorrect={false} style={input} />
        <View style={styles.row}>
          <Pressable onPress={runTest} style={[styles.btn, { borderColor: p.border, borderWidth: 1 }]} disabled={test.busy}>
            {test.busy ? <ActivityIndicator size="small" color={p.accent} /> : <Ionicons name="pulse" size={16} color={p.accent} />}
            <Text style={{ color: p.accent, marginLeft: 6, fontWeight: '600' }}>Test connection</Text>
          </Pressable>
          <Pressable onPress={saveAi} disabled={!aiDirty} style={[styles.btn, { backgroundColor: aiDirty ? p.accent : p.cardAlt }]}>
            <Text style={{ color: aiDirty ? '#fff' : p.textFaint, fontWeight: '600' }}>Save</Text>
          </Pressable>
        </View>
        {test.msg ? <Text style={{ color: test.ok ? p.ok : p.danger, marginTop: 8 }}>{test.msg}</Text> : null}
        {savedKeyHint ? (
          <Pressable
            onPress={async () => {
              await setApiKey('');
              setSavedKeyHint(null);
            }}
            style={{ marginTop: 10 }}
          >
            <Text style={{ color: p.danger, fontSize: 13 }}>Remove saved key</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.h, { color: p.text }]}>Speech model (on device)</Text>
      <View style={card}>
        <Text style={[styles.hint, { color: p.textDim }]}>
          Speech is transcribed on your phone by Whisper. The model is downloaded once from Hugging Face — Wi-Fi recommended.
        </Text>
        {(Object.keys(WHISPER_MODELS) as WhisperModelId[]).map((id) => {
          const have = isModelDownloaded(id);
          const selected = s.whisperModel === id;
          const downloading = dl.active && dl.model === id;
          return (
            <View key={id} style={[styles.modelRow, { borderColor: selected ? p.accent : p.border }]}>
              <Pressable onPress={() => void updateSettings({ whisperModel: id })} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? p.accent : p.textFaint} />
                <View style={{ marginLeft: 8, flex: 1 }}>
                  <Text style={{ color: p.text, fontWeight: '600' }}>{WHISPER_MODELS[id].label}</Text>
                  <Text style={{ color: have ? p.ok : p.textDim, fontSize: 12 }}>
                    {downloading ? `Downloading… ${Math.round(dl.progress * 100)}%` : have ? 'Downloaded' : 'Not downloaded'}
                  </Text>
                  {downloading ? (
                    <View style={[styles.progress, { backgroundColor: p.cardAlt }]}>
                      <View style={{ width: `${Math.round(dl.progress * 100)}%`, height: '100%', backgroundColor: p.accent, borderRadius: 3 }} />
                    </View>
                  ) : null}
                </View>
              </Pressable>
              {have ? (
                <Pressable
                  onPress={() => {
                    deleteModel(id);
                    force((n) => n + 1);
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color={p.textFaint} />
                </Pressable>
              ) : (
                <Pressable
                  onPress={async () => {
                    await updateSettings({ whisperModel: id });
                    if (await downloadModel(id)) void retryAll();
                  }}
                  disabled={dl.active}
                  hitSlop={8}
                >
                  <Ionicons name="cloud-download-outline" size={22} color={dl.active ? p.textFaint : p.accent} />
                </Pressable>
              )}
            </View>
          );
        })}
        {dl.error ? <Text style={{ color: p.danger, marginTop: 6 }}>{dl.error}</Text> : null}
      </View>

      <Text style={[styles.h, { color: p.text }]}>Recording</Text>
      <View style={card}>
        <Text style={[styles.label, { color: p.textDim }]}>Stop after this many seconds of silence</Text>
        <View style={styles.row}>
          {[2, 3, 4, 6, 8].map((n) => (
            <Chip key={n} label={`${n}s`} active={s.silenceSeconds === n} onPress={() => void updateSettings({ silenceSeconds: n })} />
          ))}
        </View>
        <Text style={[styles.label, { color: p.textDim }]}>Delete audio after (days, 0 = never). Transcripts are kept forever.</Text>
        <TextInput
          value={retention}
          onChangeText={setRetention}
          onEndEditing={() => {
            const n = Math.max(0, Math.min(3650, parseInt(retention, 10) || 0));
            setRetention(String(n));
            void updateSettings({ audioRetentionDays: n });
          }}
          keyboardType="number-pad"
          style={[...input, { width: 100 }]}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14 },
  hint: { fontSize: 13, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  btn: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  modelRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 8 },
  progress: { height: 6, borderRadius: 3, marginTop: 6, overflow: 'hidden' },
});
