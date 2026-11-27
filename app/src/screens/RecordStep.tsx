// "What do you enter?" Four headed sections, each doing one job:
//   1. How you log it: tap once, tap to count, or enter details.
//   2. How entries work (for details): add as you go, one value a day, or a list for each day.
//   3. What you enter: one list of things, each a row you can open to edit, and one Add button.
//   4. Totals: multiply any two of your numbers (neutral: no particular subject).
// Every number can measure something that follows the person's units (weight, distance, height or length, liquid volume)
// or carry a fixed label (minutes, calories, money, their own). That one "Measures" setting replaces the separate presets
// and the separate Units step.

import { useState, type ReactNode } from 'react';
import { Text, TextInput, View } from 'react-native';
import { FIXED, KINDS, applyMeasure, measuresKey } from '../core/fieldKinds';
import { CHIPS, chipField, type Answers, type ComboFn } from '../core/setup';
import type { Field, Settings } from '../core/types';
import { DEFAULT_TERMS } from '../core/terms';
import { systemDefaultUnit, defaultStep } from '../core/units';
import { dayKeyOf } from '../core/plan';
import { Button, Card, ChoiceGrid, Icon, Muted, Option, Reveal, SmallButton, Stepper, Tap, Toggle, colors, s } from '../ui/kit';
import { cleanOption } from '../core/choices';
import { Dropdown, type DropdownOption } from '../ui/Dropdown';
import { LogPreview } from './LogPreview';
import { EDGE, px } from '../ui/theme';

const TYPE_ICON: Record<Field['type'], string> = {
  number: 'keypad-outline', rating: 'star-outline', time: 'time-outline', duration: 'hourglass-outline', choice: 'list-outline', text: 'document-text-outline',
};
const TYPE_WORD: Record<Field['type'], string> = { number: 'Number', rating: 'Rating', time: 'Time of day', duration: 'Duration', choice: 'Choice', text: 'Note' };

const newId = (): string => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;

function measuresLabel(f: Field, settings: Settings): string {
  if (f.unitKind) return `${KINDS.find((k) => k.kind === f.unitKind)?.label ?? 'Measurement'} (${systemDefaultUnit(f.unitKind, settings)})`;
  const fixed = Object.values(FIXED).find((v) => v.unit === f.unit);
  if (fixed) return fixed.label;
  return f.unit ? f.unit : 'Just a number';
}

function subtitle(f: Field, settings: Settings): string {
  switch (f.type) {
    case 'number': return f.unitKind || f.unit ? `Number, ${measuresLabel(f, settings).toLowerCase()}` : 'Number';
    case 'rating': return `Rating, 1 to ${f.max ?? 5}`;
    case 'choice': return `Choice: ${(f.options ?? []).join(', ') || 'no options yet'}`;
    default: return TYPE_WORD[f.type];
  }
}

function FieldEditor({ f, onChange, onRemove, onMove, first, last, settings, planned }: { f: Field; onChange: (f: Field) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; first: boolean; last: boolean; settings: Settings; planned: boolean }) {
  const [own, setOwn] = useState(false);
  const [options, setOptions] = useState((f.options ?? []).join(', '));
  const key = measuresKey(f, own);
  const measureOptions: DropdownOption[] = [
    { key: 'none', label: 'Just a number' },
    ...KINDS.map((k) => ({ key: k.kind, label: k.label })),
    ...Object.entries(FIXED).map(([k, v]) => ({ key: k, label: v.label })),
    { key: 'own', label: 'Your own label' },
  ];

  return (
    <View style={{ paddingTop: 4 }}>
      <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Name</Text>
      <TextInput
        style={[s.input, { marginBottom: 12 }]} value={f.name} maxLength={24} selectTextOnFocus onChangeText={(v) => onChange({ ...f, name: v })}
        placeholder={TYPE_WORD[f.type] === 'Time of day' ? 'Time' : TYPE_WORD[f.type]} placeholderTextColor={colors.hint}
      />

      {f.type === 'number' || f.type === 'duration' ? (
        <View>
          {f.type === 'number' ? (
          <View>
          <Dropdown
            label="Unit" value={measuresLabel(f, settings)} options={measureOptions} selected={key}
            onSelect={(k) => { setOwn(k === 'own'); onChange(applyMeasure(f, k)); }}
          />
          {key === 'own' ? (
            <TextInput
              style={[s.input, { marginTop: -6, marginBottom: 12 }]} value={f.unit ?? ''} maxLength={12} onChangeText={(v) => onChange({ ...f, unit: v })}
              placeholder="Label for this number" placeholderTextColor={colors.hint}
            />
          ) : null}
          </View>
          ) : null}
          <View style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.text, fontSize: 15 }}>Plus and minus move by</Text>
            <Stepper
              value={f.step ?? defaultStep(f, settings)} min={0.05} max={9999}
              step={(f.step ?? defaultStep(f, settings)) < 1 ? 0.05 : (f.step ?? defaultStep(f, settings)) < 10 ? 0.5 : (f.step ?? defaultStep(f, settings)) < 100 ? 5 : 25}
              onChange={(v) => onChange({ ...f, step: Math.max(0.05, Math.round(v * 100) / 100) })}
            />
          </View>
          {!planned ? (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Several a day</Text>
              <ChoiceGrid cols={2} value={f.reading ? 'latest' : 'sum'} onPick={(k) => onChange({ ...f, reading: k === 'latest' })}
                options={[{ key: 'sum', label: 'Add up' }, { key: 'latest', label: 'Keep the latest' }]} />
            </View>
          ) : null}
        </View>
      ) : null}

      {f.type === 'rating' ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Scale</Text>
          <ChoiceGrid cols={2} value={String(f.max ?? 5)} onPick={(k) => onChange({ ...f, max: Number(k) })}
            options={[{ key: '5', label: '1 to 5' }, { key: '10', label: '1 to 10' }]} />
        </View>
      ) : null}

      {f.type === 'choice' ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Options, separated by commas</Text>
          <TextInput
            style={s.input} value={options}
            onChangeText={(v) => { setOptions(v); onChange({ ...f, options: v.split(',').map((x) => cleanOption(x)).filter(Boolean) }); }}
          />
          <Toggle label="Pick more than one" value={!!f.multi} onChange={(v) => onChange({ ...f, multi: v })} />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        {!first ? <SmallButton label="Move up" icon="arrow-up" onPress={() => onMove(-1)} /> : null}
        {!last ? <SmallButton label="Move down" icon="arrow-down" onPress={() => onMove(1)} /> : null}
      </View>
      <Button label="Remove" variant="ghost" onPress={onRemove} style={{ marginTop: 8 }} />
    </View>
  );
}

// A counter's unit uses the same list as a number's.
const COUNT_UNITS: DropdownOption[] = [
  { key: 'none', label: 'Just a number' },
  ...KINDS.map((k) => ({ key: k.kind, label: k.label })),
  ...Object.entries(FIXED).map(([k, v]) => ({ key: k, label: v.label })),
  { key: 'own', label: 'Your own label' },
];
function counterUnitKey(a: Answers): string {
  if (a.countKind) return a.countKind;
  const fixed = Object.entries(FIXED).find(([, v]) => v.unit === a.countUnit);
  if (fixed) return fixed[0];
  return a.countUnit ? 'own' : 'none';
}
function counterUnitLabel(a: Answers, settings: Settings): string {
  if (a.countKind) return `${KINDS.find((k) => k.kind === a.countKind)?.label} (${systemDefaultUnit(a.countKind, settings)})`;
  const fixed = Object.values(FIXED).find((v) => v.unit === a.countUnit);
  return fixed ? fixed.label : a.countUnit || 'Just a number';
}
function pickCounterUnit(k: string, a: Answers): Partial<Answers> {
  if (k === 'none') return { countKind: undefined, countUnit: '' };
  if (k === 'own') return { countKind: undefined, countUnit: a.countKind || FIXED[counterUnitKey(a)] ? '' : a.countUnit };
  if (FIXED[k]) return { countKind: undefined, countUnit: FIXED[k].unit };
  return { countKind: k as Answers['countKind'], countUnit: '' };
}

const ADD_TYPES: { type: Field['type']; label: string; sub: string }[] = [
  { type: 'number', label: 'Number', sub: 'Anything you count or measure: minutes, a height, pages.' },
  { type: 'rating', label: 'Rating', sub: 'Tap a score from 1 to 5 or 1 to 10.' },
  { type: 'time', label: 'Time of day', sub: 'Like when you went to bed.' },
  { type: 'duration', label: 'Duration', sub: 'How long something took, entered as hours and minutes.' },
  { type: 'choice', label: 'Choice', sub: 'Pick from a short list, one or several.' },
  { type: 'text', label: 'Note', sub: 'A few words of your own.' },
];

// Calculations: work out a number from two of yours. Neutral on purpose: it works for any two numbers, not one subject.
const FN: { key: ComboFn; label: string; sym: string; sub: string; from: string; to: string }[] = [
  { key: 'mul', label: 'Multiply', sym: '×', sub: 'Two numbers multiplied, entry by entry, then added up for the day.', from: 'First number', to: 'Second number' },
  { key: 'add', label: 'Add', sym: '+', sub: 'Two numbers added together, entry by entry.', from: 'First number', to: 'Second number' },
  { key: 'sub', label: 'Subtract', sym: '−', sub: 'The second taken from the first, entry by entry.', from: 'Start with', to: 'Take away' },
  { key: 'div', label: 'Divide', sym: '÷', sub: "The day's total of the first over the day's total of the second.", from: 'Top number', to: 'Bottom number' },
  { key: 'span', label: 'Time between', sym: 'to', sub: 'The hours from one time to another, across midnight if needed.', from: 'From', to: 'To' },
];

export function Totals({ fields, combos, setCombos }: { fields: Field[]; combos: Answers['combos']; setCombos: (c: Answers['combos']) => void }) {
  const [adding, setAdding] = useState(false);
  const [fn, setFn] = useState<ComboFn>('mul');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [name, setName] = useState('');
  const numbers = fields.filter((f) => f.type === 'number');
  const times = fields.filter((f) => f.type === 'time');
  const pool = fn === 'span' ? times : numbers;
  const canAdd = numbers.length >= 2 || times.length >= 2;
  if (!canAdd && combos.length === 0) return null;
  const spec = FN.find((x) => x.key === fn) as (typeof FN)[number];
  const nameOf = (id: string): string => fields.find((f) => f.id === id)?.name ?? id;
  const options: DropdownOption[] = pool.map((f) => ({ key: f.id, label: f.name || 'Number' }));
  const ready = !!first && !!second && first !== second;
  const reset = () => { setAdding(false); setFirst(''); setSecond(''); setName(''); };
  const add = () => {
    setCombos([...combos, { id: `x${Date.now().toString(36)}`, name: name.trim() || `${nameOf(first)} ${spec.sym} ${nameOf(second)}`, a: first, b: second, fn }]);
    reset();
  };
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 2 }}>Calculations</Text>
      {combos.map((c) => {
        const sym = FN.find((x) => x.key === (c.fn ?? 'mul'))?.sym ?? '×';
        return (
          <Card key={c.id} style={{ padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{c.name}</Text>
              <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>{nameOf(c.a)} {sym} {nameOf(c.b)}</Text>
            </View>
            <SmallButton label="Remove" onPress={() => setCombos(combos.filter((x) => x.id !== c.id))} />
          </Card>
        );
      })}
      {adding ? (
        <Card style={{ padding: 12, marginBottom: 8 }}>
          <Dropdown
            label="What to work out" value={spec.label} selected={fn} options={FN.map((x) => ({ key: x.key, label: x.label }))}
            onSelect={(k) => { setFn(k as ComboFn); setFirst(''); setSecond(''); }}
          />
          <Dropdown label={spec.from} value={first ? nameOf(first) : 'Choose'} options={options} selected={first || undefined} onSelect={setFirst} />
          <Dropdown label={spec.to} value={second ? nameOf(second) : 'Choose'} options={options} selected={second || undefined} onSelect={setSecond} />
          {pool.length < 2 ? <Muted style={{ marginBottom: 8 }}>{fn === 'span' ? 'Add two "Time of day" things to work out the time between them.' : 'Add two numbers first.'}</Muted> : null}
          <TextInput
            style={[s.input, { marginBottom: 10 }]} value={name} maxLength={24} onChangeText={setName}
            placeholder={first && second ? `${nameOf(first)} ${spec.sym} ${nameOf(second)}` : 'Name'} placeholderTextColor={colors.hint}
          />
          <Button label="Add" onPress={add} disabled={!ready} />
        </Card>
      ) : null}
      {canAdd ? <Button label={adding ? 'Cancel' : '+ Add a calculation'} variant="ghost" onPress={() => (adding ? reset() : setAdding(true))} /> : null}
    </View>
  );
}

export function RecordStep({
  a, set, fields, settings, nudge,
}: { a: Answers; set: (p: Partial<Answers>) => void; fields: Field[]; settings: Settings; nudge?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const planned = a.log === 'plan';
  const writing = a.record === 'numbers';
  const mode: 'free' | 'daily' | 'plan' = a.log === 'plan' ? 'plan' : a.daily ? 'daily' : 'free';
  const rows = fields;
  const rawName = (f: Field): Field => { const c = a.custom.find((x) => x.id === f.id); return c ? { ...f, name: c.name } : f; };
  // A name for each entry only makes sense when entries are added as you go, so changing the way drops it.
  const setMode = (m: 'free' | 'daily' | 'plan') => set({
    log: m === 'plan' ? 'plan' : 'free', daily: m === 'daily', finishPlan: m === 'plan' ? a.finishPlan : false,
    // A list with a different list for each weekday needs set weekdays; any other rhythm shares one list.
    ...(m === 'plan' && a.schedule.kind !== 'daily' && a.schedule.kind !== 'weekdays' ? { samePlan: true } : {}),
  });

  // From the first edit on, the list is held as plain fields, whatever started it, so every row works the same way.
  const commit = (next: Field[]) => set({ chips: [], custom: next, combos: a.combos.filter((c) => next.some((f) => f.id === c.a) && next.some((f) => f.id === c.b)) });
  const change = (f: Field) => commit(fields.map((x) => (x.id === f.id ? f : x)));
  // The order of the list is the order of the logging form, so it can be changed.
  const move = (id: string, dir: -1 | 1) => {
    const i = rows.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const remove = (id: string) => { setOpenId(null); commit(fields.filter((x) => x.id !== id)); };
  const addField = (f: Field, edit: boolean) => { commit([...fields, f]); setAdding(false); setOpenId(edit ? f.id : null); };

  const has = (id: string) => fields.some((f) => f.id === id);
  const shortcuts = planned && a.planStyle === 'sets' ? CHIPS.filter((c) => (c.id === 'weight' || c.id === 'reps') && !has(c.id)) : [];

  const numberFields = fields.filter((f) => f.type === 'number');
  // How you log it, as one choice: each option is what you actually do when you log.
  type Way = 'done' | 'count' | 'each' | 'daily' | 'list';
  const way: Way = a.record === 'done' ? 'done' : a.record === 'count' ? 'count' : mode === 'plan' ? 'list' : mode === 'daily' ? 'daily' : 'each';
  const pickWay = (w: Way) => {
    if (w === 'done') return set({ record: 'done', avoid: false, goal: 'none', log: 'free', daily: false });
    if (w === 'count') return set({ record: 'count', avoid: false, log: 'free', daily: false, finishPlan: false, goals: a.goals.filter((g) => g.measure === 'count' || g.measure === 'n') });
    set({ record: 'numbers', avoid: false });
    setMode(w === 'list' ? 'plan' : w === 'daily' ? 'daily' : 'free');
  };
  const WAYS: { key: Way; label: string }[] = [
    { key: 'done', label: 'Mark it done' },
    { key: 'count', label: 'Count it' },
    { key: 'each', label: 'Log it each time' },
    { key: 'daily', label: 'Log it once a day' },
    { key: 'list', label: 'Tick off a list' },
  ];
  // The heading over the fields says, as a sentence, when they are filled in.
  const enterHeading = way === 'list' ? (a.planStyle === 'sets' ? `For each ${(a.terms?.row ?? DEFAULT_TERMS.row).toLowerCase()}, you fill in` : `For each ${(a.terms?.item ?? DEFAULT_TERMS.item).toLowerCase()}, you can also fill in`) : way === 'daily' ? 'Each day, you fill in' : 'Each time, you fill in';
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>How do you log it?</Text>
      <Card style={{ padding: 0, marginBottom: 8 }}>
        {WAYS.map((w, i) => {
          const on = way === w.key;
          return (
            <Tap key={w.key} onPress={() => pickWay(w.key)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: i === 0 ? 0 : px(1), borderTopColor: colors.border, backgroundColor: on ? colors.accentBg : 'transparent' }}>
                <Text style={{ flex: 1, color: colors.text, fontSize: 15, fontWeight: on ? '700' : '500' }}>{w.label}</Text>
                {on ? <Icon name="checkmark-circle" size={20} color={colors.accent} /> : null}
              </View>
            </Tap>
          );
        })}
      </Card>
      {a.record === 'count' ? (
        <View style={{ marginTop: 6 }}>
          {/* The same unit choice as any number: something that follows the units, a fixed label, or your own. */}
          <Dropdown
            label="Unit" value={counterUnitLabel(a, settings)} options={COUNT_UNITS} selected={counterUnitKey(a)}
            onSelect={(k) => set(pickCounterUnit(k, a))}
          />
          {counterUnitKey(a) === 'own' ? (
            <TextInput
              style={[s.input, { marginTop: -6, marginBottom: 12 }]} value={a.countUnit} maxLength={12} onChangeText={(v) => set({ countUnit: v })}
              placeholder="Label" placeholderTextColor={colors.hint}
            />
          ) : null}
          <View style={[s.row, { justifyContent: 'space-between', marginBottom: 10 }]}>
            <Text style={{ color: colors.text, fontSize: 15 }}>Each tap adds</Text>
            <Stepper
              value={a.countStep} min={0.01} max={5000}
              step={a.countStep < 0.1 ? 0.01 : a.countStep < 1 ? 0.1 : a.countStep >= 100 ? 50 : a.countStep >= 10 ? 5 : 1}
              onChange={(v) => set({ countStep: Math.max(0.01, Math.round(v * 100) / 100) })}
            />
          </View>
        </View>
      ) : null}
      {a.record === 'done' ? (
        <Toggle
          label="Track something I'm avoiding"
          value={a.avoid} onChange={(v) => set(v ? { avoid: true, goals: [], finishPlan: false } : { avoid: false })}
        />
      ) : null}

      {writing ? (
        <View style={{ marginTop: 8 }}>
          <View style={{ marginBottom: 6 }}>
            {mode === 'plan' ? (
              <View>
              <Dropdown
                compact label="Items work as" value={a.planStyle === 'sets' ? 'Sets you log' : 'Items you tick'} selected={a.planStyle}
                options={[
                  { key: 'sets', label: 'Sets you log' },
                  { key: 'items', label: 'Items you tick' },
                ]}
                onSelect={(k) => set({ planStyle: k as 'sets' | 'items' })}
              />
              <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Each item is called</Text>
              <TextInput
                style={[s.input, { marginBottom: 10 }]} value={a.terms?.item ?? DEFAULT_TERMS.item} maxLength={16} selectTextOnFocus
                onChangeText={(v) => set({ terms: { ...DEFAULT_TERMS, ...(a.terms ?? {}), item: v } })}
              />
              {a.planStyle === 'sets' ? (
                <View>
                  <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Each row is called</Text>
                  <TextInput
                    style={[s.input, { marginBottom: 10 }]} value={a.terms?.row ?? DEFAULT_TERMS.row} maxLength={16} selectTextOnFocus
                    onChangeText={(v) => set({ terms: { ...DEFAULT_TERMS, ...(a.terms ?? {}), row: v } })}
                  />
                </View>
              ) : null}
              </View>
            ) : null}
          </View>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>{enterHeading}</Text>
          {rows.length === 0 && nudge ? <Text style={{ color: colors.danger, fontSize: 13, marginBottom: 8 }}>Add at least one thing to enter, then continue.</Text> : null}
          {rows.map((f0) => {
            const f = rawName(f0);
            const title = f.name || f0.name; // left empty, it shows the word it will be saved under
            const open = openId === f.id;
            return (
              <Reveal key={f.id} when={open}>
              <Card keep style={{ padding: 0, marginBottom: 8, borderColor: open ? colors.accent : colors.border, borderWidth: open ? EDGE : px(1) }}>
                <Tap onPress={() => setOpenId(open ? null : f.id)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
                    <Icon name={TYPE_ICON[f.type]} size={22} color={colors.accent} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{title}</Text>
                      <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>{f0.label ? 'Note, names each entry' : subtitle(f, settings)}</Text>
                    </View>
                    <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
                  </View>
                </Tap>
                {open ? <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}><FieldEditor f={f} onChange={change} onRemove={() => remove(f.id)} onMove={(d) => move(f.id, d)} first={rows[0]?.id === f.id} last={rows[rows.length - 1]?.id === f.id} settings={settings} planned={planned} /></View> : null}
              </Card>
              </Reveal>
            );
          })}

          {adding ? (
            <Card style={{ padding: 0, marginBottom: 8 }}>
              {shortcuts.map((c) => (
                <Tap key={c.id} onPress={() => addField(chipField(c), false)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: px(1), borderBottomColor: colors.border }}>
                    <Icon name={TYPE_ICON.number} size={20} color={colors.accent} />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{c.name}</Text>
                    </View>
                  </View>
                </Tap>
              ))}
              {ADD_TYPES.map((t, i) => (
                <Tap
                  key={t.type}
                  onPress={() => addField(
                    t.type === 'number' ? { id: newId(), name: '', type: 'number', step: 1, default: 0 }
                    : t.type === 'rating' ? { id: newId(), name: '', type: 'rating', max: 5 }
                    : t.type === 'time' ? { id: newId(), name: '', type: 'time', default: 480 }
                    : t.type === 'duration' ? { id: newId(), name: '', type: 'duration', unit: 'min', default: 0 }
                    : t.type === 'choice' ? { id: newId(), name: '', type: 'choice', options: [] }
                    : { id: newId(), name: '', type: 'text', default: '' }, true,
                  )}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: i === ADD_TYPES.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
                    <Icon name={TYPE_ICON[t.type]} size={20} color={colors.accent} />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{t.label}</Text>
                    </View>
                  </View>
                </Tap>
              ))}
            </Card>
          ) : null}
          <Button label={adding ? 'Close' : '+ Add something'} variant="ghost" onPress={() => setAdding((v) => !v)} />

        </View>
      ) : null}
      <LogPreview a={a} fields={fields} settings={settings} countUnit={a.countKind ? systemDefaultUnit(a.countKind, settings) : a.countUnit.trim()} />
    </View>
  );
}
