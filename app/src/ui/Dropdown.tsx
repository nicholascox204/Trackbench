// One dropdown for everything that picks a single thing from a list. The closed control is a firm bordered
// field with a chevron so it reads as something to open; the open list is its own bordered panel with a
// divider between rows, a check on the chosen one and room after the last row. Sizes live in constants/layout.

import { useState, type ReactNode } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SEPARATION } from '../constants/layout';
import { Button, Icon, KeepInView, Tap, colors, s, useReveal } from './kit';
import { EDGE, px } from '../ui/theme';

export interface DropdownOption { key: string; label: string; sub?: string; tag?: string } // tag: a short muted word on the same line

const LONG_LIST = 7; // more options than this scroll inside the list

export function Dropdown({
  label, value, options, selected, onSelect, searchable, searchLabel, footer, compact, flush, onRename, onRemove, onAdd, addLabel,
}: {
  label: string; value: string; options: DropdownOption[]; selected: string | undefined; onSelect: (key: string) => void;
  searchable?: boolean; searchLabel?: string; footer?: ReactNode; compact?: boolean; // compact: tighter, the label still above the value
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
        {/* The label sits above the value, so the value and the list it opens both start at the left edge. */}
        <View style={{ flex: 1, marginRight: 8 }}>
          {label ? <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text> : null}
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: compact ? 15 : 16, fontWeight: '700', marginTop: label ? 2 : 0 }}>{value}</Text>
        </View>
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
              // A row being changed: its name in a box, then Remove and Done as real buttons.
              if (editKey === o.key) {
                return (
                  <KeepInView key={o.key} style={{ padding: pad, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border, backgroundColor: colors.raised }}>
                    <TextInput
                      style={s.input} value={draft} autoFocus maxLength={24} placeholder="Name it" placeholderTextColor={colors.hint}
                      onChangeText={(v) => { setDraft(v); onRename?.(o.key, v); }} onSubmitEditing={stopEdit} returnKeyType="done"
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      {onRemove ? <Button label={sure ? 'Yes, remove' : 'Remove'} variant={sure ? 'danger' : 'ghost'} onPress={() => (sure ? (onRemove(o.key), stopEdit()) : setSure(true))} style={{ flex: 1 }} /> : null}
                      <Button label="Done" onPress={stopEdit} style={{ flex: 1 }} />
                    </View>
                  </KeepInView>
                );
              }
              // A list the person keeps marks the chosen row by its tint and weight, and keeps the right column for the pen,
              // under the chevron. Other dropdowns show a check, or a faint circle, there.
              return (
                <Tap
                  key={o.key} onPress={() => { onSelect(o.key); setOpen(false); setFind(''); stopEdit(); }}
                  style={[row, { backgroundColor: on ? colors.accentBg : 'transparent' }]}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: on ? '700' : '500' }}>{o.label}{o.tag ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '500' }}>{`  ${o.tag}`}</Text> : null}</Text>
                    {o.sub ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{o.sub}</Text> : null}
                  </View>
                  {onRename ? (
                    <Tap onPress={() => { setEditKey(o.key); setDraft(o.label); setSure(false); setAdding(false); }} accessibilityLabel={`Edit ${o.label}`} style={{ width: mark, height: mark, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="pencil-outline" size={17} color={colors.muted} />
                    </Tap>
                  ) : (
                    <View style={{ width: mark, alignItems: 'center' }}><Icon name={on ? 'checkmark-circle' : 'ellipse-outline'} size={mark} color={on ? colors.accent : colors.border} /></View>
                  )}
                </Tap>
              );
            })}
            {onAdd ? (
              <View style={{ padding: pad, borderTopWidth: shown.length ? 1 : 0, borderTopColor: colors.border }}>
                {adding ? (
                  // With the keyboard up, the name box and its buttons are kept in view together.
                  <KeepInView>
                    <TextInput
                      style={s.input} value={draft} autoFocus maxLength={24} onChangeText={setDraft} onSubmitEditing={add}
                      placeholder="Name it" placeholderTextColor={colors.hint} returnKeyType="done"
                    />
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <Button label="Cancel" variant="ghost" onPress={stopEdit} style={{ flex: 1 }} />
                      <Button label="Add" onPress={add} disabled={!draft.trim()} style={{ flex: 1 }} />
                    </View>
                  </KeepInView>
                ) : (
                  // The same dashed add button as the rest of the app.
                  <Tap
                    onPress={() => { setAdding(true); setEditKey(null); setDraft(''); }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: 10, borderWidth: EDGE, borderStyle: 'dashed', borderColor: colors.border }}
                  >
                    <Icon name="add" size={18} color={colors.text} />
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginLeft: 6 }}>{addLabel ?? 'Add'}</Text>
                  </Tap>
                )}
              </View>
            ) : null}
          </ScrollView>
          {footer}
        </View>
      ) : null}
    </View>
  );
}
