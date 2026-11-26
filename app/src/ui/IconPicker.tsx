// Choosing a tracker's icon: search, or browse by group. Shared by the name step and by the summary, where it opens
// in place under the name so changing an icon never means leaving the screen.

import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { ICON_GROUPS, searchIcons } from '../core/icons';
import { Chip, Icon, Muted, Tap, colors, s } from './kit';
import { EDGE } from '../ui/theme';

export function IconPicker({ value, onPick, onSearchFocus }: { value: string; onPick: (name: string) => void; onSearchFocus?: (focused: boolean) => void }) {
  const [group, setGroup] = useState(() => Math.max(0, ICON_GROUPS.findIndex((g) => g.icons.includes(value))));
  const [query, setQuery] = useState('');
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
        <View style={s.wrap}>
          {ICON_GROUPS.map((g, i) => <Chip key={g.name} label={g.name} active={i === group} fill onPress={() => setGroup(i)} />)}
        </View>
      )}
      <View style={s.wrap}>
        {found.map((n) => (
          <Tap
            key={n} onPress={() => onPick(n)} accessibilityLabel={n}
            style={{ width: 46, height: 46, borderRadius: 12, marginRight: 8, marginBottom: 8, alignItems: 'center', justifyContent: 'center', borderWidth: EDGE, borderColor: value === n ? colors.accent : colors.border, backgroundColor: value === n ? colors.accentBg : colors.card }}
          >
            <Icon name={n} size={22} color={value === n ? colors.accent : colors.text} />
          </Tap>
        ))}
        {searching && found.length === 0 ? <Muted>No match. Try another word, or clear the search to browse.</Muted> : null}
      </View>
    </View>
  );
}
