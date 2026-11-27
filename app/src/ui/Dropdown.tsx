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
  label, value, options, selected, onSelect, searchable, searchLabel, footer, compact, flush, onRename, onRemove, onAdd, addLabel,
}: {
  label: string; value: string; options: DropdownOption[]; selected: string | undefined; onSelect: (key: string) => void;
  searchable?: boolean; searchLabel?: string; footer?: ReactNode; compact?: boolean; // compact: one line, the label then the value
  flush?: boolean; // no space under it, for a dropdown that sits centred in its own card
  // A list the person keeps (lists to pick from): each row has a pen to rename or remove it in place, and the last row adds one.
  onRename?: (key: string, name: string) => void; onRemove?: (key: string) => void; onAdd?: (name: string) => void; addLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const panel = useReveal(open);
  // The list lines up with the box that opens it: the same side padding, the text on the same side as the value, and the
  // check mark the same size and place as the chevron.
  const pad = compact ? 10 : 14;
  const mark = compact ? 22 : 26;
  // A compact dropdown with a label: the value starts right after the label, and the open list starts at that same line.
  const [labelW, setLabelW] = useState(0);
  const inset = compact && label ? labelW + 10 : 0;
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sure, setSure] = useState(false);
  const [adding, setAdding] = useState(false);
  const add = () => { const n = draft.trim(); if (!n || !onAdd) return; onAdd(n); setDraft(''); setAdding(false); };
  const stopEdit = () => { setEditKey(null); setSure(false); setDraft(''); setAdding(false); };
  const shown = options.filter((o) => o.label.toLowerCase().includes(find.trim().toLowerCase()));
  return (
    <View ref={panel} style={{ marginBottom: flush ? 0 : compact ? SEPARATION.panelGap + 2 : SEPARATION.endOfList }}>
      <Tap
        onPress={() => { setOpen(!open); stopEdit(); }}
        style={{
          flexDirection: 'row', alignItems: 'center', borderWidth: px(SEPARATION.controlBorder), borderRadius: 14, padding: compact ? 10 : 14,
          borderColor: open ? colors.accent : colors.border, backgroundColor: colors.raised,
        }}
      >
        {compact ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                        {label ? <Text onLayout={(e) => setLabelW(e.nativeEvent.layout.width)} style={{ color: colors.muted, fontSize: 13, marginRight: 10 }}>{label}</Text> : null}
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 }}>{value}</Text>
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
              <TextInput style={s.input} value={find} onChangeText={setFind} placeholder={searchLabel ?? 'Search'} placeholderTextColor={colors.hint} />
            </View>
          ) : null}
          {/* a short list opens in full; only a long or searchable one scrolls inside itself */}
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" scrollEnabled={searchable || options.length > LONG_LIST} style={searchable || options.length > LONG_LIST ? { maxHeight: SEPARATION.listMaxHeight } : undefined}>
            {shown.length === 0 ? <Text style={{ color: colors.muted, padding: 14 }}>Nothing matches.</Text> : null}
            {shown.map((o, i) => {
              const on = o.key === selected;
              const row = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: SEPARATION.rowPad, paddingHorizontal: pad, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border };
              if (editKey === o.key) {
                return (
                  <View key={o.key} style={[row, { paddingVertical: 6 }]}>
                    <TextInput
                      style={[s.input, { flex: 1, marginLeft: inset, paddingVertical: 8 }]} value={draft} autoFocus maxLength={24}
                      onChangeText={(v) => { setDraft(v); onRename?.(o.key, v); }} onSubmitEditing={stopEdit} placeholder="Name it" placeholderTextColor={colors.hint}
                    />
                    {onRemove ? (
                      <Tap onPress={() => (sure ? (onRemove(o.key), stopEdit()) : setSure(true))} accessibilityLabel={`Remove ${o.label}`} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                        {sure ? <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Tap again</Text> : <Icon name="trash-outline" size={18} color={colors.muted} />}
                      </Tap>
                    ) : null}
                    <Tap onPress={stopEdit} accessibilityLabel="Done" style={{ width: mark, alignItems: 'center' }}><Icon name="checkmark" size={mark - 2} color={colors.accent} /></Tap>
                  </View>
                );
              }
              return (
                <Tap
                  key={o.key} onPress={() => { onSelect(o.key); setOpen(false); setFind(''); stopEdit(); }}
                  style={[row, { backgroundColor: on ? colors.accentBg : 'transparent' }]}
                >
                  <View style={{ flex: 1, marginRight: 8, marginLeft: inset }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: on ? '700' : '500' }}>{o.label}</Text>
                    {o.sub ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{o.sub}</Text> : null}
                  </View>
                  {onRename ? (
                    <Tap onPress={() => { setEditKey(o.key); setDraft(o.label); setSure(false); setAdding(false); }} accessibilityLabel={`Edit ${o.label}`} style={{ paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Icon name="pencil" size={15} color={colors.hint} />
                    </Tap>
                  ) : null}
                  <View style={{ width: mark, alignItems: 'center' }}><Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={mark} color={on ? colors.accent : colors.border} /></View>
                </Tap>
              );
            })}
            {onAdd ? (
              adding ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: pad, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <TextInput
                    style={[s.input, { flex: 1, marginLeft: inset, paddingVertical: 8 }]} value={draft} autoFocus maxLength={24} onChangeText={setDraft}
                    onSubmitEditing={add} placeholder="Name it" placeholderTextColor={colors.hint} returnKeyType="done"
                  />
                  <Tap onPress={add} disabled={!draft.trim()} accessibilityLabel="Add" style={{ width: mark, alignItems: 'center', marginLeft: 8, opacity: draft.trim() ? 1 : 0.4 }}><Icon name="checkmark" size={mark - 2} color={colors.accent} /></Tap>
                </View>
              ) : (
                <Tap onPress={() => { setAdding(true); setEditKey(null); setDraft(''); }} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: SEPARATION.rowPad, paddingHorizontal: pad, borderTopWidth: shown.length ? 1 : 0, borderTopColor: colors.border }}>
                  <Text style={{ flex: 1, marginLeft: inset, marginRight: 8, color: colors.accent, fontSize: 15, fontWeight: '700' }}>{addLabel ?? 'Add'}</Text>
                  <View style={{ width: mark, alignItems: 'center' }}><Icon name="add-circle-outline" size={mark} color={colors.accent} /></View>
                </Tap>
              )
            ) : null}
          </ScrollView>
          {footer}
        </View>
      ) : null}
    </View>
  );
}
