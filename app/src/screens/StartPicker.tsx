// The first screen of adding a tracker: search, Build your own, then every template under a heading. Popular first (the top
// few by popularity, repeated in their categories so each category is complete), then every category, so scrolling shows what kinds exist without tapping a filter. Searching
// flattens it into one list. A search that finds nothing offers to build it yourself,
// with the name already typed.

import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { CATEGORIES, POPULAR_COUNT, TEMPLATES, searchTemplates, type Template } from '../core/templates';
import { Go, Icon, Muted, Tap, TrackerIcon, colors, s } from '../ui/kit';
import { px } from '../ui/theme';

export function StartPicker({
  onTemplate, onScratch,
}: { onTemplate: (t: Template) => void; onScratch: (name?: string) => void; have?: Set<string> }) {
  const [query, setQuery] = useState('');
  const q = query.trim();
  const results = searchTemplates(query);

  const badge = () => <Go />;
  // Build your own is an ordinary row, same placements as the templates; it sits alone above Popular.
  const card = (label: string, onPress: () => void) => (
    <Tap onPress={onPress}>
      <View style={[s.row, { paddingVertical: 10, borderBottomWidth: px(1), borderBottomColor: `${colors.border}88` }]}>
        <TrackerIcon name="construct-outline" size={40} />
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
          <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>Set up every part yourself</Text>
        </View>
        {badge()}
      </View>
    </Tap>
  );
  // Every template row is the same: icon, name, one line on what it is, and a chevron.
  const row = (t: Template) => {
    return (
      <Tap key={t.id} onPress={() => onTemplate(t)} accessibilityLabel={t.name}>
        <View style={[s.row, { paddingVertical: 10, borderBottomWidth: px(1), borderBottomColor: `${colors.border}88` }]}>
          <TrackerIcon name={t.icon} size={40} />
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{t.name}</Text>
            <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={1}>{t.blurb}</Text>
          </View>
          {badge()}
        </View>
      </Tap>
    );
  };
  const heading = (label: string) => (
    <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 18, marginBottom: 2 }}>{label}</Text>
  );

  const popular = TEMPLATES.slice(0, POPULAR_COUNT);

  return (
    <View style={{ marginTop: 6 }}>
      <TextInput
        style={[s.input, { marginBottom: 8 }]} value={query} onChangeText={setQuery}
        placeholder="Search starting points" placeholderTextColor={colors.hint}
      />
      {q ? (
        <View>
          {results.map(row)}
          {results.length === 0 ? <Muted style={{ paddingVertical: 12 }}>No starting point matches.</Muted> : null}
          {/* always offered under a search, since a match may not be what you meant */}
          <View style={{ marginTop: results.length ? 14 : 0 }}>{card(`Build ${q} your own way`, () => onScratch(q.replace(/^./, (c) => c.toUpperCase())))}</View>
        </View>
      ) : (
        <View>
          {card('Build your own', () => onScratch())}
          {heading('Popular')}
          {popular.map(row)}
          {CATEGORIES.map((c, ci) => {
            // The first category peeks under Popular, so it opens on something not already shown there (Reading, not Daily habits).
            const inCat = TEMPLATES.filter((t) => t.category === c);
            const list = ci > 0 ? inCat : [...inCat.filter((t) => !popular.includes(t)), ...inCat.filter((t) => popular.includes(t))];
            return list.length ? <View key={c}>{heading(c)}{list.map(row)}</View> : null;
          })}
        </View>
      )}
    </View>
  );
}
