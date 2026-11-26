// The daily screen for one tracker. It stays lean: a week strip, today's
// totals and targets, and fast logging. All configuration lives in the builder.

import { useEffect, useRef, useState } from 'react';
import { Keyboard, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { cleanDays, dayResult, entriesOnDay, rollingAverage } from '../core/derive';
import { computeDay, isCalculated } from '../core/measures';
import { pickedDayFor, rememberPickedDay } from '../core/pickedDay';
import { WEEKDAYS, isRowSlot, planFor, planIndexFor, previousRow, viewVersion } from '../core/plan';
import { takeTimerFill, useTimerFill } from '../core/timers';
import { deleteEntry, logFree, mutatePlanDay, saveDaily, setRow, setTapTotal, toggleItem, undoLast, updateEntry, updateTracker, useAppState } from '../core/store';
import { isDueOn, listDays, scheduleOf, windowNote } from '../core/schedule';
import { addDays, formatDay, startOfDay } from '../core/time';
import type { Entry, Field, Settings, Slot, Tracker } from '../core/types';
import {
  defaultStep, fieldUnit, formatDuration, formatFieldValue, measureField, formatMeasure, formatNumber, fromDisplay, measureToDisplay, measureUnit, round2, toDisplay,
} from '../core/units';
import { Button, Card, Chip, KeepInView, Heading, Icon, Muted, SmallButton, StepGroup, Stepper, colors, getThemeIcons, s, useTopPad, Tap, Scroll, useReveal } from '../ui/kit';
import { ScreenHeader } from '../ui/kit';
import { canTimerFill } from '../core/duration';
import { FieldInput } from '../ui/FieldInput';
import { labelField } from '../core/labels';
import { isChanged } from '../core/dirty';
import { MonthCalendar, startOfMonth, type DayState } from '../ui/MonthCalendar';
import { NumInput } from '../ui/NumInput';
import { AvoidCard } from './AvoidCard';
import { canImportRun, runFill } from '../core/runImport';
import { decodeRoute } from '../core/runRecorder';
import { RunRecorder, useRun } from './RunRecorder';
import { RouteMap } from '../ui/RouteMap';
import { bestsBefore, liftFields, oneRepMax, platesFor, recordOf } from '../core/records';
import { HealthCard, stepsFieldOf } from './HealthCard';
import { autoStepsField } from '../core/healthSync';
import { useAutoValue } from '../core/autoValue';
import { AddSlot, DayHeader, EditButton, RotationPicker, SlotEditor, listName, plural, termsOf } from './PlanEditor';
import { EDGE, px } from '../ui/theme';

const dotColors = () => ({ hit: colors.done, some: colors.accent, none: colors.border });

// How a day went, for the strip and the calendar.
function dayStateOf(t: Tracker, entries: Entry[], d: number, today: number): DayState {
  if (d > today) return 'none';
  const r = dayResult(t, entriesOnDay(entries, t.id, d), d, entries);
  return r.success ? 'hit' : (r.measures.done ?? 0) > 0 ? 'some' : 'none';
}

const mondayOf = (d: number): number => { const dow = new Date(d).getDay(); return addDays(d, dow === 0 ? -6 : 1 - dow); };

function WeekStrip({
  t, entries, day, onPick, offset, setOffset, calOpen, setCalOpen,
}: {
  t: Tracker; entries: Entry[]; day: number; onPick: (d: number) => void; offset: number; setOffset: (n: number) => void;
  calOpen: boolean; setCalOpen: (v: boolean) => void;
}) {
  const today = startOfDay(Date.now());
  const monday = mondayOf(addDays(today, offset * 7));
  const canLook = t.input === 'plan'; // a plan can be edited ahead of time
  const [month, setMonth] = useState(() => startOfMonth(day));
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
        <Tap onPress={() => setOffset(offset - 1)}><Text style={{ color: colors.accent, fontSize: 18, padding: 6 }}>‹</Text></Tap>
        <Tap onPress={() => { setMonth(startOfMonth(day)); setCalOpen(!calOpen); }} style={[s.row, { padding: 4 }]}>
          <Muted>{formatDay(monday)} – {formatDay(addDays(monday, 6))}</Muted>
          <View style={{ marginLeft: 4 }}><Icon name={calOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} /></View>
        </Tap>
        <Tap onPress={() => setOffset(canLook ? offset + 1 : Math.min(0, offset + 1))}>
          <Text style={{ color: offset < 0 || canLook ? colors.accent : colors.border, fontSize: 18, padding: 6 }}>›</Text>
        </Tap>
      </View>
      {calOpen ? (
        <MonthCalendar
          month={month} setMonth={setMonth} selected={day} today={today} canPickFuture={canLook}
          stateOf={(d) => dayStateOf(t, entries, d, today)} onPick={(d) => { onPick(d); setCalOpen(false); }}
        />
      ) : null}
      <View style={s.row}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(monday, i);
          const future = d > today;
          const state = dayStateOf(t, entries, d, today);
          const selected = d === day;
          return (
            <Tap
              key={d}
              disabled={future && !canLook}
              onPress={() => onPick(d)}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, marginHorizontal: 2,
                backgroundColor: selected ? colors.doneBg : 'transparent', borderWidth: px(1), borderColor: selected ? colors.done : 'transparent',
                opacity: future && !canLook ? 0.4 : future ? 0.7 : 1,
              }}
            >
              <Text style={{ color: d === today ? colors.text : colors.muted, fontSize: 11, fontWeight: '700' }}>
                {WEEKDAYS[new Date(d).getDay()].slice(0, 3).toUpperCase()}
              </Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, marginVertical: 4, backgroundColor: dotColors()[state] }} />
              <Text style={{ color: colors.muted, fontSize: 11 }}>{new Date(d).getDate()}</Text>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}

function RowSlot({
  t, slot, day, entries, editable, settings, canEdit, open, onToggle, index, count,
}: {
  t: Tracker; slot: Slot; day: number; entries: Entry[]; editable: boolean; settings: Settings;
  canEdit: boolean; open: boolean; onToggle: () => void; index: number; count: number;
}) {
  const terms = termsOf(t);
  const mine = entries.filter((e) => e.slotId === slot.id && startOfDay(e.at) === day);
  const sets = slot.sets as number;
  const doneCount = mine.filter((e) => e.done && (e.row ?? 0) < sets).length;
  const nf = t.fields.filter((f) => f.type === 'number');
  const weekday = new Date(day).getDay();
  const [plates, setPlates] = useState(false);
  const lift = liftFields(t);
  const bests = bestsBefore(t, entries, slot.id, day);
  const wUnit = lift.weight ? fieldUnit(lift.weight, settings) : undefined;
  const show = (base: number) => (lift.weight ? `${formatNumber(round2(toDisplay(lift.weight, base, settings)))}${wUnit ? ' ' + wUnit : ''}` : '');
  const todayTop = Math.max(0, ...mine.map((e) => (lift.weight ? Number(e.values[lift.weight.id]) || 0 : 0)));
  const plateBase = todayTop || bests.weight;
  const plateUnit = wUnit === 'lb' ? 'lb' : wUnit === 'kg' ? 'kg' : undefined;
  if (open) return <SlotEditor t={t} slot={slot} weekday={weekday} settings={settings} index={index} count={count} onClose={onToggle} />;
  return (
    <Card keep style={{ padding: 14, marginBottom: 10 }}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 10 }]}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', flex: 1 }}>{slot.name}</Text>
        {canEdit ? <EditButton onPress={onToggle} /> : null}
      </View>
      <View style={[s.row, { marginBottom: 10 }]}>
        <Text style={{ color: colors.muted, fontSize: 14, flex: 1 }}>{sets} {plural(terms.row.toLowerCase(), sets)}{slot.range ? ` · ${slot.range}` : ''}</Text>
        <Text style={[{ color: colors.muted, fontSize: 14, fontWeight: '600' }, doneCount === sets && { color: colors.done }]}>{doneCount}/{sets} done</Text>
      </View>
      {lift.weight && (bests.seen || plateBase > 0) ? (
        <View style={[s.row, { marginTop: -4, marginBottom: 10 }]}>
          <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }}>{bests.seen ? `Best ${show(bests.weight)} · est. max ${show(bests.e1rm)}` : ''}</Text>
          {plateUnit && plateBase > 0 ? <Tap onPress={() => setPlates(!plates)} style={{ paddingLeft: 10 }}><Text style={{ color: colors.accent, fontSize: 13, fontWeight: '700' }}>{plates ? 'Hide plates' : 'Plates'}</Text></Tap> : null}
        </View>
      ) : null}
      {plates && plateUnit && plateBase > 0 ? (() => {
        const shown = round2(toDisplay(lift.weight!, plateBase, settings));
        const p = platesFor(shown, plateUnit);
        return <Text style={{ color: colors.text, fontSize: 13, marginTop: -4, marginBottom: 10 }}>{p.perSide.length === 0 ? `${formatNumber(shown)} ${plateUnit}: just the ${p.bar} ${plateUnit} bar` : `${formatNumber(shown)} ${plateUnit}, each side: ${p.perSide.map(formatNumber).join(' + ')}${p.left > 0 ? ` (${formatNumber(p.left)} ${plateUnit} short)` : ''} · ${p.bar} ${plateUnit} bar`}</Text>;
      })() : null}
      <View style={[s.row, { marginBottom: 6 }]}>
        <View style={{ width: 28 }} />
        {nf.map((f) => (
          <Text key={f.id} numberOfLines={1} style={{ color: colors.muted, fontSize: 13, flex: 1, textAlign: 'center' }}>
            {f.name}{fieldUnit(f, settings) ? ` (${fieldUnit(f, settings)})` : ''}
          </Text>
        ))}
        <View style={{ width: 48 }} />
      </View>
      {Array.from({ length: sets }, (_, r) => {
        const e = mine.find((x) => x.row === r);
        const prev = t.tools.previous ? previousRow(entries, slot.id, r, day) : null;
        const done = !!e?.done;
        const pr = recordOf(t, e, bests);
        return (
          <View key={r} style={[s.row, { marginBottom: 4 }]}>
            <Text accessibilityLabel={pr ? 'Personal record' : undefined} style={{ color: pr ? colors.accent : colors.muted, width: 28, fontSize: pr ? 12 : 15, fontWeight: pr ? '800' : '600' }}>{pr ? 'PR' : r + 1}</Text>
            {nf.map((f) => {
              const raw = e?.values[f.id];
              const shown = raw === undefined || raw === '' ? undefined : round2(toDisplay(f, Number(raw), settings));
              const pv = prev?.values[f.id];
              return (
                <View key={f.id} style={{ flex: 1, paddingHorizontal: 4 }}>
                  <NumInput
                    value={shown}
                    disabled={!editable}
                    style={{ height: 42, fontSize: 17, fontWeight: '600', borderRadius: 10 }}
                    placeholder={pv !== undefined ? String(round2(toDisplay(f, Number(pv), settings))) : ''}
                    onCommit={(v) => setRow(t.id, day, slot.id, r, { values: { [f.id]: v === undefined ? '' : fromDisplay(f, v, settings) } })}
                  />
                </View>
              );
            })}
            <Tap
              disabled={!editable}
              accessibilityLabel={done ? 'Undo done' : 'Mark done'}
              onPress={() => setRow(t.id, day, slot.id, r, { done: !done })}
              style={{
                width: 44, height: 42, marginLeft: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                borderWidth: EDGE, borderColor: done ? colors.done : colors.border,
                backgroundColor: done ? colors.doneBg : colors.raised, opacity: editable ? 1 : 0.5,
              }}
            >
              <Icon name="checkmark" size={22} color={done ? colors.done : colors.muted} />
            </Tap>
          </View>
        );
      })}
    </Card>
  );
}

function itemNumbers(t: Tracker, values: Record<string, number> | undefined, settings: Settings): string {
  if (!values) return '';
  return t.fields
    .filter((f) => f.type === 'number' && values[f.id] !== undefined)
    .map((f) => `${formatNumber(round2(toDisplay(f, values[f.id], settings)))}${fieldUnit(f, settings) ? ' ' + fieldUnit(f, settings) : ''}`)
    .join(' · ');
}

function ItemRow({
  t, slot, day, entries, editable, settings, canEdit, open, onToggle, index, count,
}: {
  t: Tracker; slot: Slot; day: number; entries: Entry[]; editable: boolean; settings: Settings;
  canEdit: boolean; open: boolean; onToggle: () => void; index: number; count: number;
}) {
  const e = entries.find((x) => x.slotId === slot.id && x.row === undefined && startOfDay(x.at) === day && x.done);
  const variant = e?.variant;
  const values = variant !== undefined && slot.variants?.[variant] ? slot.variants[variant].values : slot.values;
  if (open) return <SlotEditor t={t} slot={slot} weekday={new Date(day).getDay()} settings={settings} index={index} count={count} onClose={onToggle} />;
  return (
    <View style={{ marginBottom: 6 }}>
      <View style={s.row}>
      <Tap
        disabled={!editable}
        onPress={() => toggleItem(t.id, day, slot.id)}
        style={[s.row, {
          flex: 1, padding: 12, borderRadius: 8, borderWidth: px(1), gap: 10,
          backgroundColor: e ? colors.doneBg : colors.card, borderColor: e ? colors.done : colors.border, opacity: editable ? 1 : 0.6,
        }]}
      >
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: EDGE, borderColor: e ? colors.done : colors.muted, backgroundColor: e ? colors.done : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {e ? <Text style={{ color: colors.onAccent, fontSize: 12, fontWeight: '800' }}>✓</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: e ? colors.muted : colors.text, fontSize: 14 }}>
            {slot.name}{variant !== undefined && slot.variants?.[variant] ? ` · ${slot.variants[variant].label}` : ''}
          </Text>
          <Text style={s.muted}>{itemNumbers(t, values, settings)}</Text>
        </View>
      </Tap>
      {canEdit ? <EditButton onPress={onToggle} /> : null}
      </View>
      {slot.variants && slot.variants.length > 0 && editable ? (
        <View style={[s.row, { marginTop: 4, gap: 6 }]}>
          {slot.variants.map((v, vi) => (
            <Tap
              key={vi}
              onPress={() => toggleItem(t.id, day, slot.id, vi)}
              style={{
                flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, borderWidth: px(1),
                borderColor: variant === vi ? colors.done : colors.border, backgroundColor: variant === vi ? colors.doneBg : colors.raised,
              }}
            >
              <Text style={{ color: variant === vi ? colors.done : colors.muted, fontSize: 12, fontWeight: '600' }}>{v.label}</Text>
              <Text style={{ color: colors.muted, fontSize: 10 }}>{itemNumbers(t, v.values, settings)}</Text>
            </Tap>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FreeForm({
  t, entries, day, editable, settings, averages,
}: { t: Tracker; entries: Entry[]; day: number; editable: boolean; settings: Settings; averages?: Record<string, string> }) {
  const last = [...entries].filter((e) => e.done).sort((a, b) => a.at - b.at).pop();
  const todays = entriesOnDay(entries, t.id, day).filter((e) => e.done);
  const mine = t.daily ? todays[0] : undefined;
  const autoId = autoStepsField(t); // filled by the phone: it starts at what the phone has counted, never at the preset's starting number
  const init = (): Record<string, number | string> => {
    const v: Record<string, number | string> = {};
    for (const f of t.fields) {
      const own = mine?.values[f.id];
      if (own !== undefined && own !== '') { v[f.id] = own; continue; }
      if (f.id === autoId) { v[f.id] = 0; continue; }
      if (f.type === 'rating' || f.type === 'choice' || f.label) continue; // you pick these each time
      const prev = t.tools.previous ? last?.values[f.id] : undefined;
      v[f.id] = prev !== undefined ? prev : f.default ?? (f.type === 'number' || f.type === 'duration' ? 0 : f.type === 'time' ? 480 : '');
    }
    return v;
  };
  const [draft, setDraft] = useState(init);
  const live = useAutoValue(t.id, day);
  const autoValue = autoId ? live ?? mine?.values[autoId] : undefined; // what the phone says right now, which also replaces anything typed when automatic is turned back on
  const [seenAutoId, setSeenAutoId] = useState(autoId);
  const [seenAuto, setSeenAuto] = useState<number | string | undefined>(autoValue);
  if (autoId !== seenAutoId || (autoId && autoValue !== seenAuto)) {
    setSeenAutoId(autoId); // the phone's number arrives in the same render as the entry, so the form never shows the old one for a moment
    setSeenAuto(autoValue);
    if (autoId && autoValue !== undefined && autoValue !== '') setDraft((p) => ({ ...p, [autoId]: autoValue }));
  }
  const saved = t.daily && !!mine && !isChanged(draft, init()); // one entry a day: the form itself shows what is saved, and the button says so
  const lf = labelField(t);
  // A timer that fills a field puts its time into the form when it is stopped (or was stopped while you were away).
  const fill = useTimerFill(t.id);
  useEffect(() => {
    if (!fill || !editable) return;
    const f = takeTimerFill(t.id);
    if (!f || !t.fields.some((x) => x.id === f.fieldId && canTimerFill(x))) return;
    setDraft((p) => ({ ...p, [f.fieldId]: f.minutes })); // the timer was just stopped, so its time is the newest thing you did
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill?.stamp, editable]);
  const save = () => {
    Keyboard.dismiss(); // a note you were typing stops being the active box
    if (t.daily) return saveDaily(t.id, draft, day);
    logFree(t.id, draft, day);
    if (lf) setDraft((p) => ({ ...p, [lf.id]: '' })); // the next entry is something new
  };
  const [runNote, setRunNote] = useState('');
  const [recording, setRecording] = useState(false);
  const mapW = Math.min(useWindowDimensions().width, 600) - 32;
  const run = useRun();
  const runLive = run.status === 'running' || run.status === 'paused' || run.status === 'done';
  const importRun = async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const text = await (await fetch(res.assets[0].uri)).text();
      const fill = runFill(t, text);
      if (!fill) return setRunNote('That file has no route in it. Use a GPX file from your watch or running app.');
      setDraft((p) => ({ ...p, ...fill.values }));
      const other = fill.at !== undefined && startOfDay(fill.at) !== day;
      setRunNote(`Filled from the file${fill.climb > 0 ? `, ${fill.climb} m of climb` : ''}.${other ? ` This run was on ${formatDay(startOfDay(fill.at!))}; pick that day above to log it there.` : ''}`);
    } catch {
      setRunNote('Could not read that file.');
    }
  };
  const fieldsJsx = t.fields.map((f) => (
        <View key={f.id} style={{ marginBottom: 12 }}>
          <FieldInput f={f} value={draft[f.id]} settings={settings} onChange={(v) => {
            setDraft((p) => ({ ...p, [f.id]: v }));
            // Typing or nudging a number that the phone fills means you want it your way: automatic goes off.
            if (f.id === autoId) updateTracker(t.id, { sources: { ...(t.sources ?? {}), [f.id]: 'manual' } });
          }}
            onOptions={f.type === 'choice' ? (o) => updateTracker(t.id, { fields: t.fields.map((x) => (x.id === f.id ? { ...x, options: o } : x)) }) : undefined} />
          {averages?.[f.id] ? <Text style={{ color: colors.accent, fontSize: 13, marginTop: 6 }}>{averages[f.id]}</Text> : null}
        </View>
  ));
  return (
    <View>
      {editable ? (
        <Card tone="new" keep>
          <StepGroup>{fieldsJsx}</StepGroup>
          {canImportRun(t) ? (
            <Button label={runLive ? (run.status === 'done' ? 'Your run is ready to save' : `Run in progress · ${(run.meters / 1000).toFixed(2)} km`) : 'Record a run'} onPress={() => setRecording(true)} />
          ) : null}
          {recording ? <RunRecorder t={t} settings={settings} onClose={() => setRecording(false)} /> : null}
          {canImportRun(t) ? (
            <Tap onPress={importRun} style={{ alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 6 }}>
              <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700' }}>Fill from a run file (GPX)</Text>
            </Tap>
          ) : null}
          {runNote ? <Text style={{ color: colors.muted, fontSize: 13, marginBottom: 10 }}>{runNote}</Text> : null}
          <Button
            label={t.daily ? (saved ? 'Saved' : 'Save today') : 'Log'} onPress={save}
            done={saved}
          />
        </Card>
      ) : null}
      {todays.length > 0 && !(t.daily && editable) ? <Heading>{t.daily ? 'Saved' : 'Logged'}</Heading> : null}
      {(t.daily && editable ? [] : todays).map((e, i) => (
        <View key={e.id}>
          <EntryRow first={i === 0} t={t} e={e} settings={settings} editable={editable} />
          {typeof e.values.route === 'string' && e.values.route ? <View style={{ marginBottom: 10 }}><RouteMap pts={decodeRoute(e.values.route)} w={mapW} h={180} /></View> : null}
        </View>
      ))}
    </View>
  );
}

// A logged entry, changed where it is. Numbers and times (distance, minutes...) sit in the row as the controls used to enter
// them. An entry with words, a choice or a rating shows a summary that opens in place to the same controls. Either way a change
// is the entry's new value at once: it is already a record, so there is nothing to confirm. × removes it.
function EntryRow({ t, e, settings, editable, first }: { t: Tracker; e: Entry; settings: Settings; editable: boolean; first: boolean }) {
  const [open, setOpen] = useState(false);
  const strip = useReveal(open);
  const lf = labelField(t);
  const set = (id: string, v: number | string) => updateEntry(e.id, { ...e.values, [id]: v });
  // Numbers, times, ratings and a name are the controls themselves, right in the row. Choices and notes would make it tall, so they
  // sit on one line under it (their values, or what is missing) that opens to the same controls.
  const inlineOf = (f: Field) => f.type === 'number' || f.type === 'duration' || f.type === 'time' || f.type === 'rating' || (f.type === 'text' && !!f.label);
  const inline = t.fields.filter(inlineOf);
  const folded = t.fields.filter((f) => !inlineOf(f));
  const summary = (
    <Text style={{ color: colors.text, fontSize: 14, flex: 1 }}>
      {lf && String(e.values[lf.id] ?? '').trim() ? <Text style={{ fontWeight: '700' }}>{String(e.values[lf.id]).trim()}  </Text> : null}
      {t.fields
        .filter((f) => !f.label)
        .map((f) => {
          const v = e.values[f.id];
          return v === undefined || v === '' ? '' : formatFieldValue(f, v, settings);
        })
        .filter(Boolean)
        .join(' · ') || (lf && String(e.values[lf.id] ?? '').trim() ? '' : 'Done')}
    </Text>
  );
  const line = first ? null : { borderTopWidth: px(1), borderTopColor: colors.border }; // a line between entries, none under the last
  if (!editable) return <View style={[{ paddingVertical: 6 }, line]}>{summary}</View>;
  const remove = (
    <Tap onPress={() => deleteEntry(e.id)} accessibilityLabel="Remove" style={{ width: 36, height: 36, borderRadius: 10, borderWidth: EDGE, borderColor: colors.border, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
      <Icon name="close" size={18} color={colors.muted} />
    </Tap>
  );
  // Every control sits at the left with its name after it (Time, Distance...); the remove button floats at the top right, so only the first
  // line keeps clear of it and anything below can run the full width. 'reserve' marks the list that has it.
  const controlsFor = (list: Field[], reserve = false) => list.map((f, i) => (
    <View key={f.id} style={{ marginBottom: i === list.length - 1 ? 0 : 8, marginRight: reserve && i === 0 ? 44 : 0 }}>
      <FieldInput
        f={f} value={e.values[f.id]} settings={settings} bare after onChange={(v) => set(f.id, v)}
        onOptions={f.type === 'choice' ? (o) => updateTracker(t.id, { fields: t.fields.map((x) => (x.id === f.id ? { ...x, options: o } : x)) }) : undefined}
      />
    </View>
  ));
  const foldedLine = (
    <Text style={{ color: colors.muted, fontSize: 14, flex: 1 }} numberOfLines={1}>
      {folded.map((f) => { const v = e.values[f.id]; return v === undefined || v === '' ? f.name : formatFieldValue(f, v, settings); }).join(' · ')}
    </Text>
  );
  if (inline.length === 0) {
    return (
      <KeepInView style={[{ paddingVertical: 6 }, line]}><View ref={strip}>
        <View style={s.row}>
          <Tap onPress={() => setOpen((o) => !o)} accessibilityLabel={open ? 'Close' : 'Change'} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            {summary}
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
          </Tap>
          {remove}
        </View>
        {open ? <View style={{ marginTop: 8, marginBottom: 6 }}><StepGroup>{controlsFor(folded)}</StepGroup></View> : null}
      </View></KeepInView>
    );
  }
  // The controls and the remove button share a row; the line for the choice and note runs the full width beneath it, as a tinted
  // bordered strip, so it reads as part of this entry (and is not a button squeezed under the remove one).
  return (
    <KeepInView style={[{ paddingVertical: 8 }, line]}>
      <View>
        <StepGroup>{controlsFor(inline, true)}</StepGroup>
        <View style={{ position: 'absolute', right: 0, top: 2 }}>{remove}</View>
      </View>
      {folded.length > 0 ? (
        <View ref={strip} style={{ marginTop: 8, borderRadius: 10, backgroundColor: colors.raised, borderWidth: px(1), borderColor: colors.border }}>
          <Tap onPress={() => setOpen((o) => !o)} accessibilityLabel={open ? 'Close' : 'Change'} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9 }}>
            {foldedLine}
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
          </Tap>
          {open ? <View style={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: 2 }}><StepGroup>{controlsFor(folded)}</StepGroup></View> : null}
        </View>
      ) : null}
    </KeepInView>
  );
}

export function TrackerScreen({ id, setup }: { id: string; setup: () => void }) {
  const top = useTopPad();
  const { state } = useAppState();
  const t = state.trackers.find((x) => x.id === id);
  // A tracker opens on today, even a brand-new one with nothing planned: that is where you add the first thing.
  const firstDay = (): number => startOfDay(Date.now());
  const startDay = (): number => pickedDayFor(id) ?? firstDay(); // a day you switched to stays until a new day begins
  const [day, setDay] = useState(startDay);
  const [offset, setOffset] = useState(() => { const d = startDay(); return Math.round((mondayOf(d) - mondayOf(startOfDay(Date.now()))) / (7 * 86400000)); });
  const [calOpen, setCalOpen] = useState(false);
  const typedTotal = useRef<number | undefined>(undefined); // a total being typed on a counter; it takes effect when the box is left
  const [totalKey, setTotalKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const today = startOfDay(Date.now());
  if (!t) {
    return (
      <View style={s.screen}>
        <ScreenHeader label="Tracker" />
      </View>
    );
  }
  const settings = state.settings;
  const entries = state.entries.filter((e) => e.trackerId === id);
  const editable = day <= today && !(t.tools.lockPast && day < today);
  const dayEntries = entriesOnDay(entries, id, day);
  // The list this day uses: the one its schedule gives, unless it has none and you already logged another one.
  const ownIndex = planIndexFor(t, day, state.entries);
  // A past day that had nothing planned is viewed through today's plan, so it can be built from there.
  const { version, fromToday } = t.input === 'plan' ? viewVersion(t.plan, day, today, ownIndex) : { version: null, fromToday: false };
  const ownEmpty = !version || (version.days[ownIndex]?.slots.length ?? 0) === 0;
  const usedIndex = ownEmpty && version ? version.days.findIndex((d) => d.slots.some((sl) => dayEntries.some((e) => e.slotId === sl.id))) : -1;
  const listIndex = usedIndex >= 0 ? usedIndex : ownIndex;
  const planDay = version ? version.days[listIndex] ?? null : planFor(t, day, state.entries);
  const measures = computeDay(t, dayEntries, planDay);
  const success = dayResult(t, dayEntries, day, state.entries).success;
  const isToday = day === today;
  // The days set in setup are the days it runs: on any other day there is no list to add to or tick (change the days in setup to use it).
  // A day that already has entries (from before the days changed) still shows.
  const sched = scheduleOf(t, day);
  const offDay = t.input === 'plan' && ['weekdays', 'interval', 'monthly'].includes(sched.kind) && !isDueOn(sched, day) && dayEntries.length === 0;


  const doneNow = (measures.done ?? 0) > 0;
  const canEdit = t.input === 'plan' && (day >= today || fromToday); // plan changes apply from today onward; a past day with a list of its own is history
  const weekdayOfDay = listIndex; // where this day's list sits in the plan (its weekday, or its day in a block)
  // A counter whose taps add an amount (250 ml) holds it in one field; the total is that field's measure.
  const tapTotal = t.input === 'tap' ? t.measures.find((m) => m.id === 'n') : undefined;
  const tapStep = t.fields.find((f) => f.id === 'n')?.step ?? 1;
  // A counter holds at most 99 taps' worth (typing a huge total would make that many entries), and warns when it is over its limit.
  const tapCap = tapStep * 99;
  const tapNow = t.input === 'tap' ? (tapTotal ? measures.n ?? 0 : measures.count ?? 0) : 0;
  const tapLimit = t.input === 'tap' ? t.targets.find((tg) => tg.measure === (tapTotal ? 'n' : 'count') && tg.max !== undefined && tg.min === undefined)?.max : undefined;
  const overLimit = tapLimit !== undefined && tapNow > tapLimit;
  const inlineAverages = t.daily === true && t.input === 'form'; // a one-a-day entry shows its average beside the value, not in a card
  const checklist = t.input === 'plan' && !!planDay?.slots.some((sl) => !isRowSlot(sl)); // a list of items that carry numbers (meals): what is ticked adds up under it
  const hasTotals = (checklist && t.measures.some((m) => m.calc.op !== 'completion')) || t.targets.length > 0 || (t.derived.length > 0 && !inlineAverages) || (t.input === 'plan' && t.measures.some(isCalculated)) || (t.input !== 'plan' && t.input !== 'tap' && !t.daily && t.measures.some((m) => m.calc.op !== 'completion')); // a counter's big number is its total, and a one-a-day entry already shows what was entered
  const averageLines: Record<string, string> = {};
  if (inlineAverages) {
    for (const d of t.derived) {
      const m = t.measures.find((x) => x.id === d.measure);
      const fid = m && 'field' in m.calc ? m.calc.field : undefined;
      if (!m || !fid) continue;
      const avg = rollingAverage(t, entries, d.measure, day, d.days);
      const txt = avg === null ? '—' : measureField(t, m)?.type === 'duration' ? formatDuration(avg) : `${formatNumber(measureToDisplay(t, m, avg, settings))}${measureUnit(t, m, settings) ? ' ' + measureUnit(t, m, settings) : ''}`;
      averageLines[fid] = averageLines[fid] ? averageLines[fid] + '  ·  ' + d.name + ' ' + txt : d.name + ' ' + txt;
    }
  }
  // The plain numbers (up to three) and every calculation; a planned list of sets shows its calculations only.
  const allMeasures = t.measures.filter((m) => m.calc.op !== 'completion');
  const plainShown = t.input === 'plan' && !checklist ? [] : allMeasures.filter((m) => !isCalculated(m)).slice(0, Math.max(0, 3 - allMeasures.filter(isCalculated).length));
  const shownMeasures = allMeasures.filter((m) => isCalculated(m) || plainShown.includes(m));
  const totalsCard = hasTotals ? (
          <Card>
            {t.targets.map((tg) => {
              const m = t.measures.find((x) => x.id === tg.measure);
              if (!m) return null;
              const v = measures[m.id] ?? 0;
              const limit = tg.min ?? tg.max ?? 1;
              const met = tg.min !== undefined ? v >= tg.min : doneNow && v <= (tg.max as number);
              return (
                <View key={tg.id} style={{ marginBottom: 10 }}>
                  <View style={[s.row, { justifyContent: 'space-between' }]}>
                    <Text style={{ color: colors.text, fontSize: 14 }}>{m.name}</Text>
                    <Text style={[s.muted, met && { color: colors.done }, tg.max !== undefined && tg.min === undefined && v > tg.max && { color: colors.warn }]}>
                      {formatMeasure(t, m, v, settings)} {tg.min !== undefined ? 'of' : 'max'} {formatMeasure(t, m, limit, settings)}
                    </Text>
                  </View>
                  <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4 }}>
                    <View style={{ height: 4, borderRadius: 2, width: `${Math.min(1, v / Math.max(1e-9, limit)) * 100}%`, backgroundColor: met ? colors.done : colors.accent }} />
                  </View>
                </View>
              );
            })}
            {t.targets.length === 0 && (t.input !== 'plan' || checklist || t.measures.some(isCalculated))
              ? shownMeasures.map((m) => (
                  <View key={m.id} style={[s.row, { justifyContent: 'space-between' }]}>
                    <Text style={{ color: colors.text, fontSize: 14 }}>{m.name}</Text>
                    <Text style={s.muted}>{formatMeasure(t, m, measures[m.id] ?? 0, settings)}</Text>
                  </View>
                ))
              : null}
            {t.derived.map((d) => {
              const m = t.measures.find((x) => x.id === d.measure);
              if (!m) return null;
              const avg = rollingAverage(t, entries, d.measure, day, d.days);
              return (
                <View key={d.id} style={[s.row, { justifyContent: 'space-between', marginTop: 4 }]}>
                  <Text style={{ color: colors.text, fontSize: 14 }}>{d.name}</Text>
                  <Text style={{ color: colors.accent, fontSize: 14 }}>
                    {avg === null ? '—' : measureField(t, m)?.type === 'duration' ? formatDuration(avg) : `${formatNumber(measureToDisplay(t, m, avg, settings))}${measureUnit(t, m, settings) ? ' ' + measureUnit(t, m, settings) : ''}`}
                  </Text>
                </View>
              );
            })}
          </Card>
        ) : null;

  return (
    <View style={s.screen}>
      {/* This page is a place of its own: the tracker on the left, system-wide buttons on the right */}
      <View style={{ paddingHorizontal: 16, paddingTop: top, paddingBottom: 10, backgroundColor: colors.bg, borderBottomWidth: px(1), borderBottomColor: colors.border }}>
        <View style={[s.row, { justifyContent: 'space-between', maxWidth: 600, width: '100%', alignSelf: 'center' }]}>
          <View style={[s.row, { flex: 1, marginRight: 10 }]}>
            {getThemeIcons() ? <View style={{ marginRight: 8 }}><Icon name={t.icon} size={26} color={colors.accent} /></View> : null}
            <Text style={{ color: colors.text, fontSize: 22, lineHeight: 30, paddingBottom: 3, fontWeight: '700', flexShrink: 1 }} numberOfLines={2}>{t.name}</Text>
          </View>
          <Tap
            onPress={setup} accessibilityLabel="Tracker setup"
            style={{ flexDirection: 'row', alignItems: 'center', height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: EDGE, borderColor: colors.border, backgroundColor: colors.raised }}
          >
            <Icon name="options-outline" size={17} color={colors.text} />
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', marginLeft: 6 }}>Setup</Text>
          </Tap>
        </View>
      </View>
      <Scroll resetKey={id} contentContainerStyle={[s.content, { paddingTop: 12 }]} keyboardShouldPersistTaps="handled">
        {t.window ? <Muted style={{ marginBottom: 8 }}>{windowNote(t.window, today)}</Muted> : null}

        <WeekStrip
          t={t} entries={entries} day={day} offset={offset} setOffset={setOffset} calOpen={calOpen} setCalOpen={setCalOpen}
          onPick={(d) => { setDay(d); rememberPickedDay(id, d); setOffset(Math.round((mondayOf(d) - mondayOf(today)) / (7 * 86400000))); setOpenId(null); }}
        />
        {stepsFieldOf(t) && day <= today ? <HealthCard t={t} day={day} entries={entries} /> : null}
        {t.input === 'plan' && !offDay && version?.rotation && day <= today ? <RotationPicker t={t} day={day} entries={state.entries} current={listIndex} /> : null}
        {t.input === 'plan' && !offDay ? <DayHeader t={t} weekday={weekdayOfDay} editable={canEdit} /> : null}
        {!editable && day <= today ? <Muted style={{ marginBottom: 8, textAlign: 'center' }}>Past days are locked for this tracker (change in Build).</Muted> : null}

        {/* body by input kind */}
        {offDay ? (
          <Card style={{ padding: 16 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 4 }}>Not one of this tracker's days</Text>
            <Muted style={{ marginBottom: 12 }}>{WEEKDAYS[new Date(day).getDay()]} is not a day you set for {t.name}. To use this day, add it in Setup.</Muted>
            <Button label="Open setup" variant="ghost" onPress={setup} />
          </Card>
        ) : t.input === 'plan' ? (
          !planDay || planDay.slots.length === 0 ? (
            <View>
              {listDays(t, fromToday ? today : day).length === 0 && canEdit ? (
                <AddSlot key={`add${day}`} t={t} weekday={weekdayOfDay} first settings={settings} />
              ) : (
                <View>
                  <Muted style={{ marginBottom: 8, textAlign: 'center' }}>Nothing on {listName(t, weekdayOfDay)}{fromToday ? '. What you add here applies from today on.' : ''}</Muted>
                  {canEdit ? <AddSlot key={`add${day}`} t={t} weekday={weekdayOfDay} first={false} settings={settings} /> : null}
                </View>
              )}
            </View>
          ) : (
            <View>
              <View style={{ marginBottom: 10 }}>
                {planDay.slots.map((sl, at) => {
                  const common = {
                    t, slot: sl, day, entries, editable, settings, canEdit, open: openId === sl.id,
                    onToggle: () => setOpenId(openId === sl.id ? null : sl.id), index: at, count: planDay.slots.length,
                  };
                  return isRowSlot(sl) ? <RowSlot key={sl.id} {...common} /> : <ItemRow key={sl.id} {...common} />;
                })}
              </View>
              {totalsCard}
              {canEdit ? <AddSlot key={`add${day}`} t={t} weekday={weekdayOfDay} first={false} settings={settings} /> : null}
            </View>
          )
        ) : t.input === 'form' ? (
          <FreeForm key={t.id + day} t={t} entries={entries} day={day} editable={editable} settings={settings} averages={inlineAverages ? averageLines : undefined} />
        ) : t.avoid ? (
          <AvoidCard t={t} entries={state.entries} day={day} today={today} editable={editable} />
        ) : (
          <Card style={overLimit ? { borderColor: colors.warn } : undefined}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              {(
              t.input === 'tap' ? (
                // The total is typed straight in: it takes effect when you leave the box (see setTapTotal)
                <View style={[s.row, { flex: 1, marginRight: 8 }]}>
                  <View style={{ width: 84 }}>
                    <NumInput
                      key={`total${day}-${totalKey}-${tapTotal ? measures.n ?? 0 : measures.count ?? 0}`}
                      value={tapTotal ? measures.n ?? 0 : measures.count ?? 0}
                      disabled={!editable}
                      onCommit={(v) => { typedTotal.current = v; }}
                      onEnd={() => {
                        const v = typedTotal.current;
                        typedTotal.current = undefined;
                        if (v !== undefined) setTapTotal(t.id, day, Math.min(v, tapCap), !!tapTotal);
                        setTotalKey((k) => k + 1);
                      }}
                      maxLength={String(tapCap).length}
                      style={{ fontSize: 24, fontWeight: '700', height: 46, borderRadius: 8, ...(overLimit ? { color: colors.warn, borderColor: colors.warn } : {}) }}
                    />
                  </View>
                  {tapTotal && measureUnit(t, tapTotal, settings) ? <Text style={{ color: colors.muted, fontSize: 15, marginLeft: 8 }} numberOfLines={1}>{measureUnit(t, tapTotal, settings)}</Text> : null}
                </View>
              ) : (
              <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>
                {doneNow ? 'Done' : 'To do'}
              </Text>
              )
              )}
              {editable ? (
                <View style={s.row}>
                  {doneNow && t.input === 'tap' ? (
                    <Tap style={[s.stepBtn, { marginRight: 8 }]} onPress={() => setTapTotal(t.id, day, (tapTotal ? measures.n ?? 0 : measures.count ?? 0) - tapStep, !!tapTotal)}><Text style={s.stepBtnText}>−</Text></Tap>
                  ) : null}
                  <Button
                    disabled={t.input === 'tap' && tapNow >= tapCap}
                    label={t.input === 'check' ? (t.avoid ? (doneNow ? 'Undo slip' : 'I slipped') : doneNow ? 'Undo' : 'Mark done') : `+${formatNumber(tapStep)}`}
                    onPress={() => (t.input === 'check' && doneNow ? undoLast(t.id, day) : logFree(t.id, tapTotal ? { n: tapStep } : {}, day))}
                  />
                </View>
              ) : null}
            </View>
            {overLimit ? <Text style={{ color: colors.warn, fontSize: 14, fontWeight: '600', marginTop: 8 }}>Over your limit by {formatNumber(tapNow - (tapLimit as number))}{tapTotal && measureUnit(t, tapTotal, settings) ? ` ${measureUnit(t, tapTotal, settings)}` : ''}</Text> : null}
          </Card>
        )}

        {/* After the quick part: totals, and the way to change the tracker itself */}
        {t.input !== 'plan' ? totalsCard : null}
      </Scroll>
    </View>
  );
}

export type { Field };
