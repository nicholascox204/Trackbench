// Plan editing happens right on the tracker page, one row at a time: each row has an edit button that
// opens that row's editor in place. The only thing that touches other rows is moving this one up or down.
// What a row, a repeat and a target are called is the tracker's own wording, so a plan works for lifting,
// language practice, rehab or anything else.

import { useRef, useState, type ComponentRef, useEffect } from 'react';
import { suggestExercises } from '../core/exercises';
import { liftFields } from '../core/records';
import { importSlotId } from '../core/liftImport';
import { stockLeft } from '../core/stock';
import { Text, TextInput, View } from 'react-native';
import { MAX_LISTS, WEEKDAYS, isRowSlot, nextList, versionFor } from '../core/plan';
import { startOfDay } from '../core/time';
import { scheduleOf } from '../core/schedule';
import { addList, getState, mutatePlanDay, removeList, updateTracker } from '../core/store';
import { DEFAULT_TERMS, plural, termsOf } from '../core/terms';
import type { Entry, PlanDay, Settings, Slot, Tracker } from '../core/types';
import { defaultStep, fieldUnit, formatNumber, fromDisplay, round2, toDisplay } from '../core/units';
import { Button, Card, Chip, Icon, Muted, Reveal, StepGroup, Stepper, Tap, colors, s } from '../ui/kit';
import { FieldInput } from '../ui/FieldInput';
import { EDGE } from '../ui/theme';

export { DEFAULT_TERMS, plural, termsOf };

const newId = (): string => Math.random().toString(36).slice(2, 8);

// What a list is called when there is no name: its weekday, or its place in a block of days.
export const listName = (t: Tracker, index: number): string => (versionFor(t.plan, Date.now())?.rotation ? `List ${index + 1}` : scheduleOf(t).kind === 'blocks' ? `Day ${index + 1}` : WEEKDAYS[index]);

const planOf = (t: Tracker): { days: PlanDay[]; same: boolean; rotation: boolean } => {
  const v = versionFor(t.plan, Date.now());
  return { days: v?.days ?? [], same: !!v?.same, rotation: !!v?.rotation };
};

// One row's editor, shown in place of the row while it is open.
export function SlotEditor({
  t, slot, weekday, settings, index, count, onClose,
}: { t: Tracker; slot: Slot; weekday: number; settings: Settings; index: number; count: number; onClose: () => void }) {
  const terms = termsOf(t);
  const patch = (fn: (x: Slot) => void) => mutatePlanDay(t.id, weekday, (d) => { const x = d.slots.find((y) => y.id === slot.id); if (x) fn(x); });
  const move = (dir: -1 | 1) => mutatePlanDay(t.id, weekday, (d) => {
    const i = d.slots.findIndex((y) => y.id === slot.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.slots.length) return;
    [d.slots[i], d.slots[j]] = [d.slots[j], d.slots[i]];
  });
  const remove = () => { mutatePlanDay(t.id, weekday, (d) => { d.slots = d.slots.filter((y) => y.id !== slot.id); }); onClose(); };
  const done = () => (slot.name.trim() ? onClose() : remove());
  const numFields = t.fields.filter((f) => f.type === 'number');

  return (
    <Reveal when>
    <Card keep style={{ borderColor: colors.accent, padding: 12 }}>
      <TextInput
        style={[s.input, { marginBottom: 10 }]} value={slot.name} autoFocus={!slot.name}
        onChangeText={(v) => patch((x) => { x.name = v; })}
        placeholder={`${terms.item} name`} placeholderTextColor={colors.hint}
      />
      {isRowSlot(slot) ? (
        <View>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
            <Text style={{ color: colors.text, fontSize: 15 }}>{plural(terms.row, 2)}</Text>
            <Stepper value={slot.sets as number} min={1} max={30} width={40} onChange={(v) => patch((x) => { x.sets = Math.round(v); })} />
          </View>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: colors.text, fontSize: 15 }}>{terms.target}</Text>
            <TextInput
              style={[s.input, { width: 140, paddingVertical: 8, textAlign: 'center' }]} value={slot.range ?? ''}
              onChangeText={(v) => patch((x) => { x.range = v; })} placeholder="optional" placeholderTextColor={colors.hint}
            />
          </View>
        </View>
      ) : (
        <View>
          <StepGroup>
            {numFields.map((f) => (
              <View key={f.id} style={{ marginBottom: 12 }}>
                <FieldInput f={f} value={slot.values?.[f.id] ?? 0} settings={settings} onChange={(v) => patch((x) => { x.values = { ...(x.values ?? {}), [f.id]: Number(v) }; })} />
              </View>
            ))}
          </StepGroup>
          {t.tools.stock ? (
            <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
              <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>On hand now</Text>
              <Stepper value={stockLeft(slot, getState().entries) ?? 0} min={0} max={999} width={48} onChange={(v) => patch((x) => { x.stock = { count: Math.round(v), at: Date.now() }; })} />
            </View>
          ) : null}
          {slot.variants && slot.variants.length > 0 ? <Muted>Alternatives cannot be edited here yet.</Muted> : null}
        </View>
      )}

      <View style={[s.row, { marginTop: 6 }]}>
        <Tap
          onPress={() => move(-1)} disabled={index === 0} accessibilityLabel="Move up"
          style={{ width: 40, height: 40, borderRadius: 10, borderWidth: EDGE, borderColor: colors.border, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', opacity: index === 0 ? 0.35 : 1 }}
        ><Icon name="chevron-up" size={20} color={colors.text} /></Tap>
        <Tap
          onPress={() => move(1)} disabled={index === count - 1} accessibilityLabel="Move down"
          style={{ width: 40, height: 40, marginLeft: 6, borderRadius: 10, borderWidth: EDGE, borderColor: colors.border, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', opacity: index === count - 1 ? 0.35 : 1 }}
        ><Icon name="chevron-down" size={20} color={colors.text} /></Tap>
        <Tap
          onPress={remove} accessibilityLabel="Remove"
          style={{ flexDirection: 'row', alignItems: 'center', height: 40, marginLeft: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: EDGE, borderColor: colors.danger }}
        >
          <Icon name="trash-outline" size={16} color={colors.danger} />
          <Text style={{ color: colors.danger, fontSize: 14, fontWeight: '600', marginLeft: 6 }}>Remove</Text>
        </Tap>
        <View style={{ flex: 1 }} />
        <Button label="Done" onPress={done} />
      </View>
    </Card>
    </Reveal>
  );
}

// The small pencil that opens a row's editor: a plain pen in the faint hint colour, so it is findable without shouting.
export function EditButton({ onPress }: { onPress: () => void }) {
  return (
    <Tap onPress={onPress} style={{ padding: 6, marginLeft: 4 }}>
      <Icon name="pencil" size={15} color={colors.hint} />
    </Tap>
  );
}

// Lists to pick from. The chips pick the day's list (the next in turn marked). The pencil turns the same chips into an edit
// card: tap a list to rename or remove it, or New list to add one. With no lists yet it is one card: Make your first list.
export function ListBar({ t, day, entries, current, canEdit }: { t: Tracker; day: number; entries: Entry[]; current: number; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState(0); // the list being changed while editing
  const v = versionFor(t.plan, day);
  if (!v?.rotation) return null;
  const may = canEdit && day >= startOfDay(Date.now());
  const next = nextList(t, day, entries);
  const create = () => {
    const n = name.trim();
    if (!n) return;
    const at = addList(t.id, n);
    if (v.days.length === 0) updateTracker(t.id, { rotationPick: { day, index: at } });
    setName(''); setAdding(false); setTarget(at);
  };
  const nameBox = (label: string) => (
    <View style={[s.row, { gap: 8 }]}>
      <TextInput
        style={[s.input, { flex: 1 }]} value={name} onChangeText={setName} onSubmitEditing={create} maxLength={24} blurOnSubmit={false}
        placeholder="Name it" placeholderTextColor={colors.hint} returnKeyType="done"
      />
      <Button label={label} onPress={create} disabled={!name.trim()} />
    </View>
  );
  if (v.days.length === 0) {
    if (!may) return null;
    return (
      <Card keep style={{ marginBottom: 12 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10 }}>Make your first list</Text>
        {nameBox('Create')}
      </Card>
    );
  }
  const chips = (edit: boolean) => (
    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
      {v.days.map((d, i) => (
        <Chip
          key={i} label={`${d.label.trim() || `List ${i + 1}`}${!edit && i === next && v.days.length > 1 ? ' · next' : ''}`}
          active={edit ? i === target && !adding : i === current}
          onPress={() => (edit ? (setTarget(i), setAdding(false), setRemoving(false)) : updateTracker(t.id, { rotationPick: { day, index: i } }))}
        />
      ))}
      {edit && v.days.length < MAX_LISTS ? (
        <Tap onPress={() => { setAdding(true); setRemoving(false); }} accessibilityLabel="New list"
          style={[s.chip, { flexDirection: 'row', alignItems: 'center', borderStyle: 'dashed', backgroundColor: adding ? colors.accentBg : 'transparent' }]}>
          <Icon name="add" size={15} color={colors.text} />
          <Text style={[s.chipText, { marginLeft: 4 }]}>New list</Text>
        </Tap>
      ) : null}
    </View>
  );
  const close = () => { setEditing(false); setAdding(false); setRemoving(false); setName(''); };
  const picked = v.days[target];
  // Not editing: the chips pick the day's list. Editing: the same chips sit in a card, and the one tapped is the one changed.
  if (!editing) {
    return (
      <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'flex-start' }}>
        {chips(false)}
        {may ? <EditButton onPress={() => { setTarget(current); setEditing(true); }} /> : null}
      </View>
    );
  }
  return (
    <Card keep style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10 }}>Your lists</Text>
      {chips(true)}
      <View style={{ marginTop: 6 }}>
        {adding ? nameBox('Add') : picked ? (
          <View style={s.row}>
            <TextInput
              style={[s.input, { flex: 1 }]} value={picked.label} maxLength={24} placeholder={`List ${target + 1}`} placeholderTextColor={colors.hint}
              onChangeText={(val) => mutatePlanDay(t.id, target, (x) => { x.label = val; })}
            />
            <Tap
              onPress={() => (removing ? (removeList(t.id, target), setRemoving(false), setTarget(0)) : setRemoving(true))}
              accessibilityLabel="Remove this list" style={{ paddingHorizontal: 10, paddingVertical: 8 }}
            >
              {removing ? <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Tap again</Text> : <Icon name="trash-outline" size={19} color={colors.muted} />}
            </Tap>
          </View>
        ) : null}
      </View>
      <Button label="Done" variant="ghost" onPress={close} style={{ marginTop: 8 }} />
    </Card>
  );
}

// The name of a planned day ("Push", "Long run"), only where days have their own lists: one shared list has no day names, and the date is on the
// calendar above. Past days show the name if there is one and are read-only.
export function DayHeader({ t, weekday, editable }: { t: Tracker; weekday: number; editable: boolean }) {
  const { days, same } = planOf(t);
  const pd = days[weekday] ?? { label: '', slots: [] };
  if (same) return null;
  if (!editable) return pd.label ? <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>{pd.label}</Text> : null;
  return (
    <TextInput
      style={[s.input, { marginBottom: 12, fontSize: 18, fontWeight: '700' }]} value={pd.label}
      onChangeText={(v) => mutatePlanDay(t.id, weekday, (d) => { d.label = v; })}
      placeholder={planOf(t).rotation ? 'List name' : 'Day title'} placeholderTextColor={colors.hint}
    />
  );
}

// Add to this day, built for quick repeats: type a name and add; the name clears and the cursor stays, and the
// number of repeats and the target carry over to the next one, so a whole day goes in without leaving the keyboard.
export function AddSlot({
  t, weekday, first, settings,
}: { t: Tracker; weekday: number; first: boolean; onAdded?: (id: string) => void; settings: Settings }) {
  const terms = termsOf(t);
  const { days, same } = planOf(t);
  const day = days[weekday] ?? { label: '', slots: [] };
  const [name, setName] = useState('');
  const [sets, setSets] = useState(3);
  const [range, setRange] = useState('');
  const [values, setValues] = useState<Record<string, number>>({}); // the numbers an item carries (calories, protein), set as it is added
  const numFields = t.fields.filter((f) => f.type === 'number');
  const [open, setOpen] = useState(first); // an empty day opens the card; otherwise it is a slim button until you need it
  // Clearing the list brings the first-item card back, the same as a new tracker.
  useEffect(() => { if (first) setOpen(true); }, [first]);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const rowKind = t.planStyle ? t.planStyle === 'sets' : t.measures.some((m) => m.id === 'sets') || day.slots.some(isRowSlot);
  const lifting = rowKind && !!liftFields(t).weight; // suggestions from the exercise library while typing a name
  const hints = lifting ? suggestExercises(name, [...new Set(t.plan.flatMap((v) => v.days.flatMap((d) => d.slots.map((x) => x.name))).filter(Boolean))]) : [];

  const addNew = (init: Partial<Slot>) => {
    const id = init.id ?? newId();
    mutatePlanDay(t.id, weekday, (d) => {
      d.slots.push(rowKind ? { name: '', sets: 3, ...init, id } : { name: '', values: {}, ...init, id });
    });
    return id;
  };
  const addNamed = () => {
    if (!name.trim()) return;
    // An exercise whose history was imported (from Strong or Hevy) under its name takes that id, so its sets are its history.
    const imported = importSlotId(name.trim());
    const known = rowKind && getState().entries.some((e) => e.trackerId === t.id && e.slotId === imported) && !t.plan.some((v) => v.days.some((d) => d.slots.some((x) => x.id === imported)));
    const id = addNew(rowKind ? { ...(known ? { id: imported } : {}), name: name.trim(), sets, ...(range.trim() ? { range: range.trim() } : {}) } : { name: name.trim(), values: { ...values } });
    setName('');
    setValues({});
    input.current?.blur(); // adding one closes the keyboard; the next one starts when you press Add again
    void id;
    setOpen(false);
  };

  const dayName = day.label ? day.label : listName(t, weekday);

  if (!open) {
    return (
      <Tap
        onPress={() => { setOpen(true); setTimeout(() => input.current?.focus(), 60); }} accessibilityLabel={`Add ${terms.item.toLowerCase()}`}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 40, borderRadius: 10, borderWidth: EDGE, borderStyle: 'dashed', borderColor: colors.border }}
      >
        <Icon name="add" size={18} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginLeft: 6 }}>Add {terms.item.toLowerCase()}</Text>
      </Tap>
    );
  }

  return (
    <Card keep>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 2 }}>
        {first ? `Add your first ${terms.item.toLowerCase()}${same ? '' : ` to ${dayName}`}` : `Add ${terms.item.toLowerCase()}`}
      </Text>
      {first ? <View style={{ height: 8 }} /> : <Muted style={{ marginBottom: 10 }}>It goes at the end of the list.</Muted>}
      <TextInput
        ref={input} style={[s.input, { marginBottom: 10 }]} value={name} onChangeText={setName} onSubmitEditing={() => input.current?.blur()}
        returnKeyType="done" placeholder={`${terms.item} name`} placeholderTextColor={colors.hint}
      />
      {lifting && hints.length > 0 ? (
        <View style={[s.wrap, { marginTop: -4, marginBottom: 8 }]}>
          {hints.map((h) => <Chip key={h.name} label={h.muscle ? `${h.name} · ${h.muscle}` : h.name} active={false} onPress={() => setName(h.name)} />)}
        </View>
      ) : null}
      {rowKind ? (
        <View style={{ marginBottom: 12 }}>
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
            <Text style={{ color: colors.text, fontSize: 15 }}>{plural(terms.row, 2)}</Text>
            <Stepper value={sets} min={1} max={30} width={40} onChange={(v) => setSets(Math.round(v))} />
          </View>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={{ color: colors.text, fontSize: 15 }}>{terms.target}</Text>
            <TextInput
              style={[s.input, { width: 140, paddingVertical: 8, textAlign: 'center' }]} value={range} onChangeText={setRange}
              placeholder="Optional" placeholderTextColor={colors.hint}
            />
          </View>
        </View>
      ) : (
        <View>
          <StepGroup>
            {numFields.map((f) => (
              <View key={f.id} style={{ marginBottom: 12 }}>
                <FieldInput f={f} value={values[f.id] ?? 0} settings={settings} onChange={(v) => setValues((p) => ({ ...p, [f.id]: Number(v) }))} />
              </View>
            ))}
          </StepGroup>
        </View>
      )}
      <View style={s.row}>
        <Button label={`Add ${terms.item.toLowerCase()}`} onPress={addNamed} disabled={!name.trim()} style={{ flex: 1 }} />
        {!first ? <Button label="Cancel" variant="ghost" onPress={() => { setOpen(false); setName(''); }} style={{ marginLeft: 8 }} /> : null}
      </View>
    </Card>
  );
}
