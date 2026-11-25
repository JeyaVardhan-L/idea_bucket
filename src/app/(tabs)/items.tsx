import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { applyFilter, DEFAULT_FILTER, distinctPeople, groupByPerson, groupByType, type ItemFilter, type ItemView } from '../../core/filters';
import { ITEM_TYPES } from '../../core/types';
import * as repo from '../../db/repo';
import { Chip, Empty, ItemRow, TypeIcon } from '../../ui/components';
import { useQuery } from '../../ui/hooks';
import { TYPE_META, usePalette } from '../../ui/theme';

const VIEWS: { key: ItemView; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'recurring', label: 'Recurring' },
  { key: 'person', label: 'By person' },
];

export default function ItemsScreen() {
  const p = usePalette();
  const all = useQuery(repo.listItems, []);
  const [f, setF] = useState<ItemFilter>(DEFAULT_FILTER);
  const [now, setNow] = useState(() => Date.now());
  const [showFilters, setShowFilters] = useState(false);
  useFocusEffect(useCallback(() => setNow(Date.now()), []));

  const people = useMemo(() => distinctPeople(all), [all]);
  const filtered = useMemo(() => applyFilter(all, f, now), [all, f, now]);
  const sections = useMemo(() => {
    if (f.view === 'person') return groupByPerson(filtered);
    if (f.view === 'recurring') return filtered.length ? [{ key: 'recurring', title: 'Most recurring first', type: null, data: filtered }] : [];
    return groupByType(filtered);
  }, [filtered, f.view]);

  const set = (patch: Partial<ItemFilter>) => setF((cur) => ({ ...cur, ...patch }));
  const toggleType = (t: (typeof ITEM_TYPES)[number]) =>
    set({ types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] });
  const activeFilters = f.types.length + (f.person ? 1 : 0) + (f.status !== 'open' ? 1 : 0);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={[styles.search, { backgroundColor: p.card, borderColor: p.border }]}>
        <Ionicons name="search" size={16} color={p.textFaint} />
        <TextInput
          value={f.query}
          onChangeText={(q) => set({ query: q })}
          placeholder="Search items"
          placeholderTextColor={p.textFaint}
          style={{ flex: 1, color: p.text, marginLeft: 8, paddingVertical: 8 }}
          returnKeyType="search"
          autoCorrect={false}
        />
        {f.query ? <Ionicons name="close-circle" size={16} color={p.textFaint} onPress={() => set({ query: '' })} /> : null}
        <Ionicons
          name={showFilters ? 'options' : 'options-outline'}
          size={20}
          color={activeFilters ? p.accent : p.textDim}
          style={{ marginLeft: 12 }}
          onPress={() => setShowFilters((v) => !v)}
          accessibilityLabel="Filters"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {VIEWS.map((v) => (
          <Chip key={v.key} label={v.label} active={f.view === v.key} onPress={() => set({ view: v.key })} />
        ))}
      </ScrollView>

      {showFilters ? (
        <View style={{ paddingBottom: 4 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {(['open', 'done', 'all'] as const).map((s) => (
              <Chip key={s} label={s === 'all' ? 'Open + done' : s === 'open' ? 'Open' : 'Done'} active={f.status === s} onPress={() => set({ status: s })} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {ITEM_TYPES.map((t) => (
              <Chip key={t} label={TYPE_META[t].label} active={f.types.includes(t)} onPress={() => toggleType(t)} icon={<TypeIcon type={t} size={14} />} />
            ))}
          </ScrollView>
          {people.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {people.map((person) => (
                <Chip
                  key={person}
                  label={person}
                  active={f.person?.toLowerCase() === person.toLowerCase()}
                  onPress={() => set({ person: f.person?.toLowerCase() === person.toLowerCase() ? null : person })}
                  icon={<Ionicons name="person-outline" size={13} color={p.textDim} />}
                />
              ))}
            </ScrollView>
          ) : null}
          {activeFilters || f.query ? (
            <Text onPress={() => setF({ ...DEFAULT_FILTER, view: f.view })} style={{ color: p.accent, paddingHorizontal: 16, paddingVertical: 4 }}>
              Clear filters
            </Text>
          ) : null}
        </View>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => <ItemRow item={item} />}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: p.bg }]}>
            {section.type ? <TypeIcon type={section.type} size={16} /> : null}
            <Text style={[styles.sectionTitle, { color: p.textDim }]}>
              {section.title} · {section.data.length}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Empty
            text={
              all.length === 0
                ? 'No items yet. Record a thought on the Capture tab.'
                : f.view === 'recurring'
                  ? 'No recurring thoughts yet. When you say the same thing twice it shows up here.'
                  : 'Nothing matches these filters.'
            }
          />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  chips: { flexGrow: 0, paddingVertical: 6 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
});
