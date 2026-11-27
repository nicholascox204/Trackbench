// One dropdown for everything that picks a single thing from a list. The closed control is a firm bordered
// field with a chevron so it reads as something to open; the open list is its own bordered panel with a
// divider between rows, a check on the chosen one and room after the last row. Sizes live in constants/layout.

import { useState, type ReactNode } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SEPARATION } from '../constants/layout';
import { Icon, Tap, colors, s, useReveal } from './kit';
import { px } from '../ui/theme';

export interface DropdownOption { key: string; label: string; sub?: string }

const LONG_LIST = 7; // more options than this scroll inside the list

export function Dropdown({
  label, value, options, selected, onSelect, searchable, searchLabel, footer, compact, flush,
}: {
  label: string; value: string; options: DropdownOption[]; selected: string | undefined; onSelect: (key: string) => void;
  searchable?: boolean; searchLabel?: string; footer?: ReactNode; compact?: boolean; // compact: one line, label left and value right
  flush?: boolean; // no space under it, for a dropdown that sits centred in its own card
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const panel = useReveal(open);
  const shown = options.filter((o) => o.label.toLowerCase().includes(find.trim().toLowerCase()));
  return (
    <View ref={panel} style={{ marginBottom: flush ? 0 : compact ? SEPARATION.panelGap + 2 : SEPARATION.endOfList }}>
      <Tap
        onPress={() => setOpen(!open)}
        style={{
          flexDirection: 'row', alignItems: 'center', borderWidth: px(SEPARATION.controlBorder), borderRadius: 14, padding: compact ? 10 : 14,
          borderColor: open ? colors.accent : colors.border, backgroundColor: colors.raised,
        }}
      >
        {compact ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: colors.muted, fontSize: 13, marginRight: 10 }}>{label}</Text>
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'right', marginRight: 8 }}>{value}</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 2 }}>{value}</Text>
          </View>
        )}
        <Icon name={open ? 'chevron-up-circle-outline' : 'chevron-down-circle-outline'} size={compact ? 22 : 26} color={colors.accent} />
      </Tap>
      {open ? (
        <View style={{ marginTop: SEPARATION.panelGap, borderWidth: px(SEPARATION.controlBorder), borderColor: colors.border, borderRadius: 14, backgroundColor: colors.card, overflow: 'hidden' }}>
          {searchable ? (
            <View style={{ padding: 10, borderBottomWidth: px(1), borderBottomColor: colors.border }}>
              <TextInput style={s.input} value={find} onChangeText={setFind} placeholder={searchLabel ?? 'Search'} placeholderTextColor={colors.muted} />
            </View>
          ) : null}
          {/* a short list opens in full; only a long or searchable one scrolls inside itself */}
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" scrollEnabled={searchable || options.length > LONG_LIST} style={searchable || options.length > LONG_LIST ? { maxHeight: SEPARATION.listMaxHeight } : undefined}>
            {shown.length === 0 ? <Text style={{ color: colors.muted, padding: 14 }}>Nothing matches.</Text> : null}
            {shown.map((o, i) => {
              const on = o.key === selected;
              return (
                <Tap
                  key={o.key} onPress={() => { onSelect(o.key); setOpen(false); setFind(''); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', paddingVertical: SEPARATION.rowPad, paddingHorizontal: 14,
                    backgroundColor: on ? colors.accentBg : 'transparent', borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: on ? '700' : '500' }}>{o.label}</Text>
                    {o.sub ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{o.sub}</Text> : null}
                  </View>
                  {on ? <Icon name="checkmark-circle" size={20} color={colors.accent} /> : null}
                </Tap>
              );
            })}
          </ScrollView>
          {footer}
        </View>
      ) : null}
    </View>
  );
}
