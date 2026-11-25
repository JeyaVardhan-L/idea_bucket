import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDateTime, formatTime } from '../core/dates';
import type { Capture } from '../core/types';
import * as repo from '../db/repo';
import { retryAll, retryOne } from '../services/pipeline';
import { Empty } from '../ui/components';
import { useQuery } from '../ui/hooks';
import { usePalette } from '../ui/theme';

const LABEL: Record<Capture['status'], string> = {
  recording: 'Recording',
  recorded: 'Waiting to transcribe',
  transcribed: 'Waiting for AI',
  processed: 'Done',
  failed: 'Failed',
};

export default function QueueScreen() {
  const p = usePalette();
  const [showDone, setShowDone] = useState(false);
  const caps = useQuery(() => repo.listCaptures(showDone ? undefined : ['recording', 'recorded', 'transcribed', 'failed'], 200), [], [showDone]);
  const [busy, setBusy] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={styles.bar}>
        <Pressable
          onPress={async () => {
            setBusy(true);
            await retryAll().finally(() => setBusy(false));
          }}
          style={[styles.btn, { backgroundColor: p.accent, opacity: busy ? 0.6 : 1 }]}
          disabled={busy}
          accessibilityRole="button"
        >
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 6 }}>{busy ? 'Working…' : 'Retry all now'}</Text>
        </Pressable>
        <Pressable onPress={() => setShowDone((v) => !v)} style={[styles.btn, { borderColor: p.border, borderWidth: 1 }]}>
          <Text style={{ color: p.textDim }}>{showDone ? 'Hide processed' : 'Show history'}</Text>
        </Pressable>
      </View>
      <FlatList
        data={caps}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingTop: 0 }}
        ListEmptyComponent={<Empty text="Nothing waiting. Every recording has been processed." />}
        renderItem={({ item: c }) => {
          const color = c.status === 'failed' ? p.danger : c.status === 'processed' ? p.ok : p.warn;
          return (
            <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }]}>
              <View style={styles.rowBetween}>
                <Text style={{ color, fontWeight: '700' }}>{LABEL[c.status]}</Text>
                <Text style={{ color: p.textFaint, fontSize: 12 }}>{formatDateTime(c.created_at)}</Text>
              </View>
              {c.transcript ? (
                <Text style={{ color: p.text, marginTop: 6 }} numberOfLines={4}>
                  {c.transcript || '(silence)'}
                </Text>
              ) : null}
              {c.error ? <Text style={{ color: c.status === 'failed' ? p.danger : p.textDim, marginTop: 6, fontSize: 13 }}>{c.error}</Text> : null}
              {c.next_attempt_at && c.status !== 'failed' ? (
                <Text style={{ color: p.textFaint, marginTop: 4, fontSize: 12 }}>Next try at {formatTime(c.next_attempt_at)}</Text>
              ) : null}
              {c.status === 'failed' || c.status === 'recorded' || c.status === 'transcribed' ? (
                <Pressable onPress={() => void retryOne(c.id)} style={[styles.small, { borderColor: p.border }]}>
                  <Text style={{ color: p.accent, fontWeight: '600' }}>Retry</Text>
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 10, padding: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  small: { alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
});
