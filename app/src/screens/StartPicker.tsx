// The first screen of adding a tracker: search or browse ready-made templates, or build your own from one
// of a few neutral shapes.

import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { searchTemplates, type Template } from '../core/templates';
import { Button, Card, Icon, Muted, Tap, TrackerIcon, colors, s } from '../ui/kit';
import { BackButton } from '../ui/kit';
import { px } from '../ui/theme';

export function StartPicker({
  onTemplate, onScratch,
}: { onTemplate: (t: Template) => void; onScratch: () => void }) {
  const [query, setQuery] = useState('');

  const results = searchTemplates(query);
  const buildOwn = (
    <Tap onPress={onScratch}>
      <View style={{ borderWidth: px(1), borderColor: colors.border, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <View style={s.row}>
          <View style={{ marginRight: 12 }}><Icon name="construct-outline" size={26} color={colors.muted} /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Build your own</Text>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.muted} />
        </View>
      </View>
    </Tap>
  );
  return (
    <View style={{ marginTop: 6 }}>
      <TextInput
        style={[s.input, { marginBottom: 6 }]} value={query} onChangeText={setQuery}
        placeholder="Search starting points" placeholderTextColor={colors.muted}
      />
      <View style={{ marginTop: 8 }}>{buildOwn}</View>

      {results.map((t) => (
        <Tap key={t.id} onPress={() => onTemplate(t)}>
          <View style={[s.row, { paddingVertical: 10, borderBottomWidth: px(1), borderBottomColor: `${colors.border}88` }]}>
            <TrackerIcon name={t.icon} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{t.name}</Text>
              <Text style={[s.muted, { fontSize: 13 }]} numberOfLines={2}>{t.blurb}</Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.muted} />
          </View>
        </Tap>
      ))}
      {results.length === 0 ? <Muted style={{ paddingVertical: 14 }}>Nothing matches. Try another word, or build your own above.</Muted> : null}
    </View>
  );
}
