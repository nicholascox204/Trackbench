// The tracker's name and icon: the icon is a tile beside the name (same height, with a small arrow badge that says it opens
// a list), and the list opens in place. One component for the "name it" step and for the summary, so they never differ.

import { useState, type ComponentRef, type RefObject } from 'react';
import { Text, TextInput, View } from 'react-native';
import { LIMITS } from '../constants/layout';
import { IconPicker } from '../ui/IconPicker';
import { Card, Icon, Tap, colors, s } from '../ui/kit';
import { EDGE } from '../ui/theme';

export function NameCard({
  name, icon, onName, onIcon, message, inputRef, placeholder = 'Name it', onSearchFocus,
}: {
  name: string; icon: string; onName: (v: string) => void; onIcon: (v: string) => void; message?: string;
  inputRef?: RefObject<ComponentRef<typeof TextInput> | null>; placeholder?: string; onSearchFocus?: (focused: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <View style={s.row}>
        <Tap
          onPress={() => setOpen((o) => !o)} accessibilityLabel="Change icon"
          style={{ width: 54, height: 54, borderRadius: 14, borderWidth: EDGE, borderColor: open ? colors.accent : colors.border, backgroundColor: colors.accentBg, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}
        >
          <Icon name={icon} size={28} color={colors.accent} />
          <View style={{ position: 'absolute', right: -8, bottom: -8, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, borderWidth: EDGE, borderColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.onAccent} />
          </View>
        </Tap>
        <TextInput
          ref={inputRef} value={name} onChangeText={onName} placeholder={placeholder} placeholderTextColor={colors.muted}
          maxLength={LIMITS.trackerName} returnKeyType="done"
          style={[s.input, { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '700', borderWidth: EDGE, borderColor: message ? colors.danger : colors.border }]}
        />
      </View>
      {name.length >= LIMITS.nameWarnAt ? (
        <Text style={{ color: name.length >= LIMITS.trackerName ? colors.warn : colors.muted, fontSize: 12, marginTop: 6, textAlign: 'right' }}>{name.length} of {LIMITS.trackerName} letters</Text>
      ) : null}
      {message ? <Text style={{ color: colors.danger, fontSize: 13, marginTop: 8 }}>{message}</Text> : null}
      {open ? <View style={{ marginTop: 14 }}><IconPicker value={icon} onPick={onIcon} onSearchFocus={onSearchFocus} /></View> : null}
    </Card>
  );
}
