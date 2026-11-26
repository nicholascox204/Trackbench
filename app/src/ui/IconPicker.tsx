// Choosing a tracker's icon: search, or browse by group. Shared by the name step and by the summary, where it opens
// in place under the name so changing an icon never means leaving the screen.

import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { ICON_GROUPS, searchIcons } from '../core/icons';
import { ChoiceGrid, Icon, Muted, Tap, colors, s } from './kit';
import { EDGE } from '../ui/theme';

let lastWidth = 0; // the grid stays hidden until its width is known the first time, so tiles never appear and then stretch

export function IconPicker({ value, onPick, onSearchFocus }: { value: string; onPick: (name: string) => void; onSearchFocus?: (focused: boolean) => void }) {
  const [group, setGroup] = useState(() => Math.max(0, ICON_GROUPS.findIndex((g) => g.icons.includes(value))));
  const [query, setQuery] = useState('');
  // Tiles sized from the width there is: as many columns of about 46 as fit, then stretched so the row ends flush.
  const [width, setWidth] = useState(lastWidth); // remembered, so reopening draws the right size at once
  const GAP = 8;
  const cols = Math.max(1, Math.floor((width + GAP) / (46 + GAP)));
  const tile = width ? (width - GAP * (cols - 1)) / cols : 46;
  const searching = query.trim().length > 0;
  const found = searching ? searchIcons(query) : ICON_GROUPS[group].icons;

  return (
    <View>
      <TextInput
        style={[s.input, { marginBottom: 10 }]} value={query} onChangeText={setQuery}
        onFocus={() => onSearchFocus?.(true)} onBlur={() => onSearchFocus?.(false)}
        placeholder="Search icons" placeholderTextColor={colors.muted}
      />
      {searching ? null : (
        <View style={{ marginBottom: 2 }}><ChoiceGrid options={ICON_GROUPS.map((g, i) => ({ key: String(i), label: g.name }))} value={String(group)} onPick={(k) => setGroup(Number(k))} /></View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', opacity: width ? 1 : 0 }} onLayout={(e) => { lastWidth = e.nativeEvent.layout.width; setWidth(lastWidth); }}>
        {found.map((n, i) => (
          <Tap
            key={n} onPress={() => onPick(n)} accessibilityLabel={n}
            style={{ width: tile, height: tile, borderRadius: 12, marginRight: (i + 1) % cols === 0 ? 0 : GAP, marginBottom: GAP, alignItems: 'center', justifyContent: 'center', borderWidth: EDGE, borderColor: value === n ? colors.accent : colors.border, backgroundColor: value === n ? colors.accentBg : colors.card }}
          >
            <Icon name={n} size={22} color={value === n ? colors.accent : colors.text} />
          </Tap>
        ))}
        {searching && found.length === 0 ? <Muted>No match. Try another word, or clear the search to browse.</Muted> : null}
      </View>
    </View>
  );
}
