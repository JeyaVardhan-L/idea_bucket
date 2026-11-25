import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { applyFilter, DEFAULT_FILTER, groupByType } from '../../core/filters';
import * as repo from '../../db/repo';
import { Chip, Empty, ItemRow, TypeIcon } from '../../ui/components';
import { useQuery } from '../../ui/hooks';
import { usePalette } from '../../ui/theme';

export default function ItemsScreen() {
  const p = usePalette();
  const all = useQuery(repo.listItems, []);
  const [status, setStatus] = useState<'open' | 'done'>('open');
  const [now] = useState(() => Date.now());
  const sections = useMemo(() => groupByType(applyFilter(all, { ...DEFAULT_FILTER, status }, now)), [all, status, now]);

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={styles.bar}>
        <Chip label="Open" active={status === 'open'} onPress={() => setStatus('open')} />
        <Chip label="Done" active={status === 'done'} onPress={() => setStatus('done')} />
      </View>
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
        ListEmptyComponent={<Empty text={status === 'open' ? 'No open items. Record a thought on the Capture tab.' : 'Nothing marked done yet.'} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        stickySectionHeadersEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
});
