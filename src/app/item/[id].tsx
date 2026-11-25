import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatDateTime, isValidIsoDate } from '../../core/dates';
import { ITEM_TYPES, type Item } from '../../core/types';
import * as repo from '../../db/repo';
import { Chip, ItemRow, TypeIcon } from '../../ui/components';
import { useQuery } from '../../ui/hooks';
import { TYPE_META, usePalette } from '../../ui/theme';

export default function ItemDetail() {
  const p = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useQuery(() => repo.getItem(id), null as Item | null, [id]);
  const sources = useQuery(() => repo.sourcesForItem(id), [], [id]);
  const related = useQuery(() => repo.linkedItems(id), [], [id]);
  const [text, setText] = useState('');
  const [person, setPerson] = useState('');
  const [due, setDue] = useState('');

  const [synced, setSynced] = useState<Item | null>(null);
  if (item && synced !== item) {
    setSynced(item);
    setText(item.text);
    setPerson(item.person ?? '');
    setDue(item.due_date ?? '');
  }

  if (!item) return <View style={{ flex: 1, backgroundColor: p.bg }} />;

  const dirty = text.trim() !== item.text || (person.trim() || null) !== item.person || (due.trim() || null) !== item.due_date;
  const save = async () => {
    const d = due.trim();
    if (d && !isValidIsoDate(d)) {
      Alert.alert('Due date', 'Use the format YYYY-MM-DD, or leave it empty.');
      return;
    }
    if (!text.trim()) return;
    await repo.updateItem(item.id, { text: text.trim(), person: person.trim() || null, due_date: d || null });
  };
  const remove = () =>
    Alert.alert('Delete item?', 'The original recording transcript is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await repo.deleteItem(item.id);
          router.back();
        },
      },
    ]);

  const input = [styles.input, { color: p.text, backgroundColor: p.card, borderColor: p.border }];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: p.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: TYPE_META[item.type].label }} />
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TypeIcon type={item.type} />
          <Text style={{ color: p.textDim }}>
            {item.count > 1 ? `Came up ${item.count} times · ` : ''}last {formatDateTime(item.last_seen_at)}
          </Text>
        </View>
        <Pressable
          onPress={() => void repo.updateItem(item.id, { status: item.status === 'done' ? 'open' : 'done' })}
          style={[styles.doneBtn, { borderColor: item.status === 'done' ? p.ok : p.border }]}
        >
          <Ionicons name={item.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={item.status === 'done' ? p.ok : p.textDim} />
          <Text style={{ color: p.text, marginLeft: 6 }}>{item.status === 'done' ? 'Done' : 'Mark done'}</Text>
        </Pressable>
      </View>

      <Text style={[styles.label, { color: p.textDim }]}>Text</Text>
      <TextInput value={text} onChangeText={setText} multiline style={[...input, { minHeight: 72 }]} placeholderTextColor={p.textFaint} />

      <Text style={[styles.label, { color: p.textDim }]}>Type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {ITEM_TYPES.map((t) => (
          <Chip key={t} label={TYPE_META[t].label} active={item.type === t} onPress={() => void repo.updateItem(item.id, { type: t })} />
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: p.textDim }]}>Person</Text>
          <TextInput value={person} onChangeText={setPerson} placeholder="—" style={input} placeholderTextColor={p.textFaint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: p.textDim }]}>Due (YYYY-MM-DD)</Text>
          <TextInput value={due} onChangeText={setDue} placeholder="—" style={input} placeholderTextColor={p.textFaint} autoCapitalize="none" />
        </View>
      </View>

      <View style={[styles.rowBetween, { marginTop: 16 }]}>
        <Pressable onPress={remove} style={[styles.btn, { borderColor: p.danger }]}>
          <Ionicons name="trash-outline" size={16} color={p.danger} />
          <Text style={{ color: p.danger, marginLeft: 6 }}>Delete</Text>
        </Pressable>
        <Pressable onPress={save} disabled={!dirty} style={[styles.btn, { backgroundColor: dirty ? p.accent : p.cardAlt, borderColor: 'transparent' }]}>
          <Text style={{ color: dirty ? '#fff' : p.textFaint, fontWeight: '600' }}>Save changes</Text>
        </Pressable>
      </View>

      <Text style={[styles.h2, { color: p.text }]}>What you said</Text>
      {sources.length === 0 ? <Text style={{ color: p.textFaint }}>No source recorded.</Text> : null}
      {sources.map((s, i) => (
        <View key={`${s.capture_id}-${i}`} style={[styles.source, { backgroundColor: p.card, borderColor: p.border }]}>
          <Text style={{ color: p.textDim, fontSize: 12, marginBottom: 4 }}>{formatDateTime(s.capture_created_at ?? s.created_at)}</Text>
          <Text style={{ color: p.text, fontStyle: 'italic' }}>“{s.excerpt}”</Text>
          {s.transcript && s.transcript.trim() !== s.excerpt.trim() ? (
            <Text style={{ color: p.textFaint, fontSize: 12, marginTop: 6 }}>Full transcript: {s.transcript}</Text>
          ) : null}
        </View>
      ))}

      {related.length ? (
        <>
          <Text style={[styles.h2, { color: p.text }]}>Related</Text>
          {related.map((r) => (
            <ItemRow key={r.id} item={r} compact />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 15 },
  doneBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  btn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  h2: { fontSize: 16, fontWeight: '700', marginTop: 28, marginBottom: 10 },
  source: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
});
