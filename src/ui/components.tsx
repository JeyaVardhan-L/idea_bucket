import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { describeDueDate, localDateString } from '../core/dates';
import type { Item } from '../core/types';
import * as repo from '../db/repo';
import { useQuery } from './hooks';
import { TYPE_META, usePalette } from './theme';

export function TypeIcon({ type, size = 18 }: { type: Item['type']; size?: number }) {
  const m = TYPE_META[type];
  return <Ionicons name={m.icon as keyof typeof Ionicons.glyphMap} size={size} color={m.color} />;
}

export function ItemRow({ item, compact = false }: { item: Item; compact?: boolean }) {
  const p = usePalette();
  const done = item.status === 'done';
  const toggle = () => void repo.updateItem(item.id, { status: done ? 'open' : 'done' });
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? p.cardAlt : p.card, borderColor: p.border }]}
      accessibilityRole="button"
      accessibilityLabel={`${TYPE_META[item.type].label}: ${item.text}`}
    >
      <Pressable onPress={toggle} hitSlop={12} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel="Mark done">
        <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={done ? p.ok : p.textFaint} />
      </Pressable>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text
          style={[styles.text, { color: done ? p.textFaint : p.text, textDecorationLine: done ? 'line-through' : 'none' }]}
          numberOfLines={compact ? 2 : 4}
        >
          {item.text}
        </Text>
        <View style={styles.meta}>
          <TypeIcon type={item.type} size={13} />
          {item.person ? <Text style={[styles.metaText, { color: p.textDim }]}>{item.person}</Text> : null}
          {item.due_date ? (
            <Text style={[styles.metaText, { color: item.due_date < localDateString(new Date()) && !done ? p.danger : p.textDim }]}>
              ⏰ {describeDueDate(item.due_date, new Date())}
            </Text>
          ) : null}
        </View>
      </View>
      {item.count > 1 ? (
        <View style={[styles.badge, { backgroundColor: p.accent }]}>
          <Text style={styles.badgeText}>×{item.count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function QueuePill() {
  const p = usePalette();
  const q = useQuery(repo.queueCounts, { pending: 0, failed: 0 });
  if (!q.pending && !q.failed) return null;
  const failed = q.failed > 0;
  return (
    <Pressable
      onPress={() => router.push('/queue')}
      style={[styles.pill, { backgroundColor: failed ? `${p.danger}22` : p.cardAlt, borderColor: failed ? p.danger : p.border }]}
      accessibilityRole="button"
      accessibilityLabel="Open processing queue"
    >
      <Ionicons name={failed ? 'alert-circle' : 'sync'} size={14} color={failed ? p.danger : p.textDim} />
      <Text style={[styles.pillText, { color: failed ? p.danger : p.textDim }]}>
        {q.pending ? `${q.pending} processing` : ''}
        {q.pending && q.failed ? ' · ' : ''}
        {q.failed ? `${q.failed} failed` : ''}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon?: React.ReactNode }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? p.accent : p.card, borderColor: active ? p.accent : p.border }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {icon}
      <Text style={{ color: active ? '#fff' : p.textDim, fontSize: 13, fontWeight: '600', marginLeft: icon ? 4 : 0 }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  const p = usePalette();
  return <Text style={{ color: p.textFaint, textAlign: 'center', marginTop: 32, paddingHorizontal: 24 }}>{text}</Text>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 8 },
  text: { fontSize: 15, lineHeight: 21 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  metaText: { fontSize: 12 },
  badge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  pillText: { fontSize: 12, fontWeight: '600' },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, marginRight: 8 },
});
