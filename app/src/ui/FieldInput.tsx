// One input for any kind of field: a number stepper, a note, a tap-a-rating, a choice from a list, or a time.

import { Text, TextInput, View } from 'react-native';
import { Keyboard } from 'react-native';
import { picksOf, togglePick } from '../core/choices';
import type { Field, Settings } from '../core/types';
import { joinDuration, splitDuration } from '../core/duration';
import { defaultStep, fieldUnit, formatTime, fromDisplay, round2, toDisplay } from '../core/units';
import { useState } from 'react';
import { clampTyped } from '../core/limits';
import { NUMBER_BOX } from '../constants/layout';
import { px } from './theme';
import { AlignCtx, Chip, NumberBox, StepFrame, Stepper, Tap, colors, s, useHold } from './kit';
import { EDGE } from '../ui/theme';

// Hours and minutes in one control: each part is typed in place (two digits, a firm top limit: 99 hours, 59 minutes), and one minus and plus
// move it by the field's step (half an hour unless set). Each part is only as wide as its digits, so a second digit moves the box.
function DurationInput({ f, value, onChange }: { f: Field; value: number | string | undefined; onChange: (v: number) => void }) {
  const total = Math.round(Number(value ?? f.default ?? 0));
  const { h, m } = splitDuration(total);
  const [editing, setEditing] = useState<string | null>(null);
  const [tH, setTH] = useState(String(h));
  const [tM, setTM] = useState(String(m));
  const hText = editing === 'h' ? tH : String(h);
  const mText = editing === 'm' ? tM : String(m);
  const step = f.step ?? 30;
  const nudge = (v: number) => { setEditing(null); onChange(Math.max(0, v)); };
  // Never narrower than the step itself (30 minutes is two digits), so the spacing depends on the step, not on the value you happen to have.
  const sp = splitDuration(step);
  const hDigits = Math.max(hText.length, String(sp.h).length);
  const mDigits = Math.max(mText.length, String(sp.m).length);
  const hWidth = useHold(editing === 'h', hDigits * NUMBER_BOX.digit);
  const mWidth = useHold(editing === 'm', mDigits * NUMBER_BOX.digit);
  const part = { color: colors.text, fontSize: 18, fontWeight: '600' as const, textAlign: 'right' as const };
  return (
    <StepFrame onMinus={() => nudge(total - step)} onPlus={() => nudge(total + step)}>
      <NumberBox
        id="h" editing={editing} setEditing={setEditing} text={String(h)} width={hWidth} maxLength={2} keyboard="number-pad"
        style={part} label="Hours" onStart={() => setTH(String(h))}
        onType={(raw) => { const r = clampTyped(raw, 99); setTH(r.text); onChange(joinDuration(r.value ?? 0, m)); return r.text; }}
      />
      <Text style={[s.muted, { marginLeft: NUMBER_BOX.unitGap, marginRight: NUMBER_BOX.partGap }]}>h</Text>
      <NumberBox
        id="m" editing={editing} setEditing={setEditing} text={String(m)} width={mWidth} maxLength={2} keyboard="number-pad"
        style={part} label="Minutes" onStart={() => setTM(String(m))}
        onType={(raw) => { const r = clampTyped(raw, 59); setTM(r.text); onChange(joinDuration(h, r.value ?? 0)); return r.text; }}
      />
      <Text style={[s.muted, { marginLeft: NUMBER_BOX.unitGap }]}>min</Text>
    </StepFrame>
  );
}

export const ratingMax = (f: Field): number => f.max ?? 5;

// A choice you can shape right here: add an option with the + chip (it is picked at once); Edit shows × on each option so it can be removed (press and hold an option is a shortcut into it).
// Only when the screen passes onOptions; otherwise the list is fixed.
function ChoiceInput({ f, value, onChange, onOptions }: { f: Field; value: number | string | undefined; onChange: (v: number | string) => void; onOptions?: (o: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const options = f.options ?? [];
  const isOn = (o: string) => (f.multi ? picksOf(value).includes(o) : value === o);
  const add = () => {
    Keyboard.dismiss();
    const name = draft.trim().replace(/\s+/g, ' ').slice(0, 30);
    setDraft(''); setAdding(false);
    if (!name) return;
    const have = options.find((o) => o.toLowerCase() === name.toLowerCase());
    if (!have) onOptions?.([...options, name]);
    const pick = have ?? name;
    if (!isOn(pick)) onChange(f.multi ? togglePick(value, pick) : pick);
  };
  return (
    <View>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
        <Text style={{ color: colors.text, fontSize: 15 }}>{f.name}</Text>
        {onOptions && options.length > 0 ? <Tap onPress={() => setEditing((e) => !e)}><Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>{editing ? 'Done' : 'Edit'}</Text></Tap> : null}
      </View>
      <View style={s.wrap}>
        {options.map((o) => (
          <Chip
            key={o} label={editing ? o + '  ×' : o} active={!editing && isOn(o)}
            onLongPress={onOptions ? () => setEditing(true) : undefined}
            onPress={() => {
              if (editing) { onOptions?.(options.filter((x) => x !== o)); if (isOn(o)) onChange(f.multi ? togglePick(value, o) : ''); if (options.length <= 1) setEditing(false); }
              else onChange(f.multi ? togglePick(value, o) : o);
            }}
          />
        ))}
        {onOptions && !adding && !editing ? <Chip label="+" onPress={() => setAdding(true)} /> : null}
      </View>
      {adding ? (
        <View style={[s.row, { marginTop: 8, gap: 8 }]}>
          <TextInput
            autoFocus style={[s.input, { flex: 1, paddingVertical: 8 }]} value={draft} onChangeText={setDraft} maxLength={30}
            placeholder="New option" placeholderTextColor={colors.hint} onSubmitEditing={add} returnKeyType="done"
          />
          <Chip label="Add" active onPress={add} />
        </View>
      ) : null}
    </View>
  );
}

// A growing note. Its height comes from the text alone, worked out here in the same render that sets the text: a line per line break, and more
// where a line is long enough to wrap (estimated from the box's width, a little on the generous side so nothing is ever cut off). The phone's own
// measurement is not used: it arrives a frame late and, when the text empties, briefly reports something smaller and shrinks the box.
// There is always one spare line, because the phone puts a new line in before any height we set can arrive; with the room already there,
// nothing has to scroll up to make way for it.
const NOTE_LINE = 22;
const NOTE_CHAR = 8; // a little wider than the average letter at this size, so wrapping is over- rather than under-counted
export function NoteInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const [width, setWidth] = useState(280);
  const perLine = Math.max(8, Math.floor((width - 32) / NOTE_CHAR));
  const lines = value.split('\n').reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0);
  return (
    <TextInput
      autoFocus={autoFocus} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.hint}
      multiline scrollEnabled={false} textAlignVertical="top" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[s.input, { paddingVertical: 8, lineHeight: NOTE_LINE, height: (lines + 1) * NOTE_LINE + 16 + 2 * px(1) }]}
    />
  );
}

// A note that stays out of the way: a small + until you want it, then the box (it stays open once it has words).
function OptionalNote({ f, value, onChange }: { f: Field; value: number | string | undefined; onChange: (v: number | string) => void }) {
  const [open, setOpen] = useState(false);
  const has = String(value ?? '').trim() !== '';
  if (!open && !has) return <View style={s.wrap}><Chip label={'+ ' + f.name} onPress={() => setOpen(true)} /></View>;
  return (
    <View>
      <Text style={{ color: colors.text, fontSize: 15, marginBottom: 6 }}>{f.name}</Text>
      <NoteInput autoFocus={!has} value={String(value ?? '')} onChange={onChange} placeholder={f.name} />
    </View>
  );
}

// A bare row (no field name beside it) puts its control at the left and mirrors everything that makes the right-hand one steady.
export function FieldInput(props: Parameters<typeof FieldInputBody>[0]) {
  return <AlignCtx.Provider value={props.bare ? 'left' : 'right'}><FieldInputBody {...props} /></AlignCtx.Provider>;
}

function FieldInputBody({
  f, value, onChange, settings, suggestions, onOptions, bare, after,
}: { f: Field; value: number | string | undefined; onChange: (v: number | string) => void; settings: Settings; suggestions?: string[]; onOptions?: (o: string[]) => void; bare?: boolean; after?: boolean }) {
  const tail = after ? <Text style={[s.muted, { marginLeft: 10, flexShrink: 1 }]} numberOfLines={1}>{f.name}</Text> : null; // the field's name, after its control
  if (f.type === 'rating') {
    const max = ratingMax(f);
    const now = Number(value ?? 0);
    return (
      <View>
        <Text style={{ color: colors.text, fontSize: 15, marginBottom: 6 }}>{f.name}</Text>
        <View style={s.row}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <Tap
              key={n} onPress={() => onChange(n)}
              style={{
                flex: 1, height: 40, marginHorizontal: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: EDGE,
                borderColor: now === n ? colors.accent : colors.border, backgroundColor: now === n ? colors.accent : colors.raised,
              }}
            >
              <Text style={{ color: now === n ? colors.onAccent : colors.text, fontSize: 15, fontWeight: '700' }}>{n}</Text>
            </Tap>
          ))}
        </View>
      </View>
    );
  }

  if (f.type === 'choice') return <ChoiceInput f={f} value={value} onChange={onChange} onOptions={onOptions} />;

  if (f.type === 'duration') {
    return (
      <View style={[s.row, { justifyContent: bare ? 'flex-start' : 'space-between' }]}>
        {bare ? null : <Text style={{ color: colors.text, fontSize: 15, width: 90 }}>{f.name}</Text>}
        <DurationInput f={f} value={value} onChange={onChange} />
        {tail}
      </View>
    );
  }

  if (f.type === 'time') {
    const mins = Number(value ?? f.default ?? 480);
    const wrap = (m: number) => ((Math.round(m / 5) * 5) % 1440 + 1440) % 1440;
    const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
    return (
      <View>
        <Text style={{ color: colors.text, fontSize: 15, marginBottom: 6 }}>{f.name}</Text>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <StepFrame onMinus={() => onChange(wrap(mins - 15))} onPlus={() => onChange(wrap(mins + 15))}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', minWidth: 92, textAlign: 'center' }}>{formatTime(mins)}</Text>
          </StepFrame>
          <Chip label="Now" onPress={() => onChange(wrap(nowMin()))} />
        </View>
      </View>
    );
  }

  if (f.type === 'text' && f.label) {
    // Names an entry: one line, with past names one tap away.
    const typed = String(value ?? '');
    const shown = (suggestions ?? []).filter((x) => x !== typed && (!typed.trim() || x.toLowerCase().includes(typed.trim().toLowerCase()))).slice(0, 6);
    return (
      <View>
        {bare ? null : <Text style={{ color: colors.text, fontSize: 15, marginBottom: 6 }}>{f.name}</Text>}
        <TextInput
          style={[s.input, { paddingVertical: 8 }]} value={typed} onChangeText={onChange} maxLength={40}
          placeholder={f.name} placeholderTextColor={colors.hint}
        />
        {shown.length > 0 ? <View style={[s.wrap, { marginTop: 8 }]}>{shown.map((x) => <Chip key={x} label={x} onPress={() => onChange(x)} />)}</View> : null}
      </View>
    );
  }

  if (f.type === 'text' && f.optional) return <OptionalNote f={f} value={value} onChange={onChange} />;

  if (f.type === 'text') {
    return (
      <View>
        <Text style={{ color: colors.text, fontSize: 15, marginBottom: 6 }}>{f.name}</Text>
        <NoteInput value={String(value ?? '')} onChange={onChange} placeholder={f.name} />
      </View>
    );
  }

  // number
  return (
    <View style={[s.row, { justifyContent: bare ? 'flex-start' : 'space-between' }]}>
      {bare ? null : <Text style={{ color: colors.text, fontSize: 15, width: 90 }}>{f.name}</Text>}
      <Stepper
        value={f.unitKind ? Math.round(toDisplay(f, Number(value ?? 0), settings) * 10) / 10 : round2(toDisplay(f, Number(value ?? 0), settings))}
        onChange={(v) => onChange(fromDisplay(f, v, settings))}
        step={defaultStep(f, settings)}
        suffix={fieldUnit(f, settings)}
      />
      {tail}
    </View>
  );
}
