import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { startOfLocalDay } from '../../core/dates';
import * as repo from '../../db/repo';
import { getApiKey, useSettings } from '../../services/settingsService';
import { useCapture } from '../../services/useCapture';
import { isModelDownloaded } from '../../services/whisper';
import { Empty, ItemRow, QueuePill } from '../../ui/components';
import { useQuery } from '../../ui/hooks';
import { usePalette } from '../../ui/theme';

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function CaptureScreen() {
  const p = usePalette();
  const { state, start, stop } = useCapture();
  const params = useLocalSearchParams<{ autostart?: string }>();
  const handled = useRef<string | null>(null);
  const settings = useSettings();
  const today = useQuery(() => repo.itemsSince(startOfLocalDay(Date.now())), []);
  const [setup, setSetup] = useState<{ model: boolean; key: boolean }>({ model: true, key: true });
  const [hiddenSavedAt, setHiddenSavedAt] = useState<number | null>(null);
  const showSaved = state.savedAt != null && hiddenSavedAt !== state.savedAt;

  // deep link / app shortcut / widget → start recording immediately
  useEffect(() => {
    if (params.autostart && handled.current !== params.autostart) {
      handled.current = params.autostart;
      void start();
    }
  }, [params.autostart, start]);

  useEffect(() => {
    let alive = true;
    getApiKey().then((k) => alive && setSetup({ model: isModelDownloaded(settings.whisperModel), key: !!k }));
    return () => {
      alive = false;
    };
  }, [settings.whisperModel, state.phase]);

  useEffect(() => {
    if (!state.savedAt) return;
    const at = state.savedAt;
    const t = setTimeout(() => setHiddenSavedAt(at), 2000);
    return () => clearTimeout(t);
  }, [state.savedAt]);

  const recording = state.phase === 'recording';
  const busy = state.phase === 'starting' || state.phase === 'saving';
  const ring = recording ? 1 + state.level * 0.35 : 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: p.text }]}>Idea Bucket</Text>
        <QueuePill />
      </View>

      {!setup.model || !setup.key ? (
        <Pressable onPress={() => router.push('/settings')} style={[styles.banner, { backgroundColor: p.cardAlt, borderColor: p.warn }]}>
          <Ionicons name="information-circle" size={18} color={p.warn} />
          <Text style={{ color: p.text, flex: 1, marginLeft: 8, fontSize: 13 }}>
            {!setup.model ? 'Download the speech model' : ''}
            {!setup.model && !setup.key ? ' and ' : ''}
            {!setup.key ? 'add your AI API key' : ''} in Settings. Recordings are kept safely until then.
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.recordArea}>
        <View style={[styles.ring, { borderColor: recording ? p.record : 'transparent', transform: [{ scale: ring }] }]} />
        <Pressable
          onPress={() => (recording ? void stop() : void start())}
          disabled={busy}
          style={({ pressed }) => [styles.recordBtn, { backgroundColor: p.record, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop recording' : 'Record a thought'}
          testID="record-button"
        >
          <Ionicons name={recording ? 'stop' : 'mic'} size={64} color="#fff" />
        </Pressable>
        <Text style={[styles.status, { color: recording ? p.record : showSaved ? p.ok : p.textDim }]}>
          {recording
            ? `Listening… ${fmt(state.elapsedMs)}  ·  tap to stop`
            : state.phase === 'starting'
              ? 'Starting…'
              : state.phase === 'saving'
                ? 'Saving…'
                : showSaved
                  ? 'saved ✓'
                  : 'Tap and speak. Stops after a pause.'}
        </Text>
        {state.error ? <Text style={[styles.error, { color: p.danger }]}>{state.error}</Text> : null}
      </View>

      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <Text style={[styles.section, { color: p.textDim }]}>Today</Text>
        <FlatList
          data={today}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <ItemRow item={item} compact />}
          ListEmptyComponent={<Empty text="Nothing yet today. Your thoughts will appear here after processing." />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  banner: { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 0, padding: 10, borderRadius: 10, borderWidth: 1 },
  recordArea: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
  ring: { position: 'absolute', top: 18, width: 180, height: 180, borderRadius: 90, borderWidth: 3, opacity: 0.5 },
  recordBtn: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  status: { marginTop: 18, fontSize: 15, fontWeight: '600' },
  error: { marginTop: 8, fontSize: 13, paddingHorizontal: 24, textAlign: 'center' },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
});
