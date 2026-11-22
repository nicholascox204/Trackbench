// Goals live on the tracker page, not in setup. Each one is a quest with progress you can see.
// This file holds the Goals screen and its builder, the compact Goals row for the tracker page, and the
// Goals card for Home.

import { useEffect, useState } from 'react';
import { BackHandler, Text, View } from 'react-native';
import { SEPARATION } from '../constants/layout';
import { dayResult, entriesOnDay } from '../core/derive';
import {
  AGG_WORD, DAYS_MEASURE, dailyGoals, dayFromKey, dayKey, describeGoal, goalProgress, itemNames, goalToBase, goalToDisplay, periodOf, type GoalProgress, type WeekStart,
} from '../core/goals';
import { suggestGoals } from '../core/goalPresets';
import { labelSuggestions } from '../core/labels';
import { isCalculated } from '../core/measures';
import { getState, removeDailyGoal, removeGoal, saveDailyGoal, saveGoal, useAppState } from '../core/store';
import { PayEditor } from './PayEditor';
import { plural as pluralWord, termsOf } from '../core/terms';
import { addDays, startOfDay } from '../core/time';
import type { Entry, Field, GoalAgg, GoalDef, GoalHow, Settings, Tracker } from '../core/types';
import { defaultStep, formatMeasure, measureField } from '../core/units';
import { Dropdown } from '../ui/Dropdown';
import { GoalBar } from '../ui/GoalBar';
import { Button, Card, Chip, Icon, Muted, Option, Scroll, Stepper, Tap, Title, TrackerIcon, colors, s, topPad } from '../ui/kit';
import { BackButton, ScreenHeader, SmallButton } from '../ui/kit';
import { MonthCalendar, startOfMonth } from '../ui/MonthCalendar';

const newId = (): string => `g${Math.random().toString(36).slice(2, 8)}`;
const HOW_LABEL: Record<GoalHow, string> = { day: 'Each day', week: 'This week', month: 'This month', total: 'Your own dates', best: 'Best day', latest: 'Latest value' };

// One plain line under each section, so the choice explains itself.
const HOW_HINT: Record<GoalHow, string> = {
  day: 'Judged every day. This is the goal behind your daily streak.', week: 'Repeats every calendar week and is judged when it ends.',
  month: 'Repeats every calendar month and is judged when it ends.', total: 'Starts today and runs to the date you pick, or with no end.', best: '', latest: '',
};
const AGG_HINT: Record<GoalAgg, string> = {
  sum: 'Add every entry up.', max: 'Your single highest entry.', min: 'Your single lowest entry.', avg: 'The average of your entries.',
  latest: 'Your most recent entry.', count: 'How many entries you log.', days: 'How many different days you log it.',
};
const AIM_HINT: Record<GoalDef['cmp'], string> = {
  min: 'The number should be at or above this.', max: 'The number should stay at or under this.',
  range: 'The number should stay between two values.', reach: 'Moves from where you start toward your target.',
};

export const weekStartOf = (settings: Settings): WeekStart => settings.weekStart ?? 'mon';

// Goals still in progress come first (soonest ending first); finished or lapsed ones go below.
export function ranked(t: Tracker, entries: Entry[], today: number, settings: Settings) {
  const ws = weekStartOf(settings);
  return [...dailyGoals(t), ...(t.goals ?? [])]
    .map((g) => ({ g, p: goalProgress(t, g, entries, today, settings, ws) }))
    .sort((a, b) => {
      const open = (x: { g: GoalDef; p: GoalProgress }) => (x.g.how === 'day' || x.p.status === 'active' || x.p.status === 'over' ? 0 : 1);
      return open(a) - open(b) || (a.p.daysLeft ?? 9999) - (b.p.daysLeft ?? 9999);
    });
}

// ---------- the builder ----------

type Thing = { key: string; name: string; field?: Field; kind: 'days' | 'count' | 'field' | 'combo' };
const AGGS: Record<string, GoalAgg[]> = { number: ['sum', 'max', 'min', 'avg', 'latest'], rating: ['avg', 'max', 'min', 'latest'], time: ['avg', 'min', 'max', 'latest'] };
const CMP_LABEL: Record<GoalDef['cmp'], string> = { min: 'At least', max: 'At most', range: 'Between two values', reach: 'Reach a number' };
const SEP = '|';

// A daily goal is a daily target on a measure. These say which thing a measure belongs to, and back.
function dayThingKey(t: Tracker, measureId: string): string | undefined {
  if (t.input !== 'check' && (measureId === 'count' || measureId === 'sets')) return 'count';
  if (t.fields.some((f) => f.id === measureId && (f.type === 'number' || f.type === 'rating' || f.type === 'time'))) return measureId;
  if (t.measures.some((m) => m.id === measureId && isCalculated(m))) return measureId;
  return undefined;
}
function dayMeasureOf(t: Tracker, thing: Thing): string | undefined {
  if (thing.kind === 'days') return undefined;
  if (thing.kind === 'count') return t.measures.find((m) => m.id === 'count')?.id ?? t.measures.find((m) => m.id === 'sets')?.id;
  return t.measures.some((m) => m.id === thing.key) ? thing.key : undefined;
}

// Used from the Goals screen (saves to the tracker) and from setup (onSave and onRemove take over, since the tracker
// does not exist yet).
export function Builder({
  t, entries, existing, preset, onClose, onSave, onRemove,
}: { t: Tracker; entries: Entry[]; existing?: GoalDef; preset?: GoalDef; onClose: () => void; onSave?: (g: GoalDef) => void; onRemove?: (g: GoalDef) => void }) {
  const src = existing ?? preset; // an existing goal being edited, or a suggestion to start from
  const { state } = useAppState();
  const settings = state.settings;
  const today = startOfDay(Date.now());

  // Everything you can count is something you record: days you log it, the number of entries, or one of your fields.
  const things: Thing[] = ([
    { key: DAYS_MEASURE, name: 'Days I log it', kind: 'days' } as Thing,
    { key: 'count', name: t.input === 'plan' ? `${pluralWord(termsOf(t).row, 2)} done` : t.input === 'tap' ? 'Count' : 'Entries', kind: 'count' } as Thing,
    ...t.fields.filter((f) => f.type === 'number' || f.type === 'rating' || f.type === 'time').map((f): Thing => ({ key: f.id, name: f.name, field: f, kind: 'field' })),
    ...t.measures.filter((m) => isCalculated(m)).map((m): Thing => ({ key: m.id, name: m.name, kind: 'combo' })),
  ] as Thing[]).filter((x) => !(t.input === 'check' && x.kind === 'count'));

  const fallbackKey = t.input === 'check' || t.input === 'plan' ? DAYS_MEASURE : things.find((x) => x.kind === 'field')?.key ?? DAYS_MEASURE;
  const initialKey = src ? (src.how === 'day' ? dayThingKey(t, src.measure) ?? fallbackKey : src.agg === 'days' ? DAYS_MEASURE : src.field ?? src.measure) : fallbackKey;
  const [key, setKey] = useState(things.some((x) => x.key === initialKey) ? initialKey : DAYS_MEASURE);
  // A planned tracker can aim a goal at one of its items (a single lift), not just the whole tracker.
  const itemChoices = t.input === 'plan' ? itemNames(t) : [];
  const [item, setItem] = useState<string | undefined>(src?.item);
  // Any tracker with choice fields can count only the entries where a choice has a given option
  // ...or a named entry (an exercise, a subject), from the names already used.
  const choiceOpts = [
    ...t.fields.filter((f) => f.type === 'choice').flatMap((f) => (f.options ?? []).map((o) => ({ key: `${f.id}${SEP}${o}`, label: `${f.name}: ${o}` }))),
    ...t.fields.filter((f) => f.label).flatMap((f) => labelSuggestions(entries, t.id, f.id, 30).map((n) => ({ key: `${f.id}${SEP}${n}`, label: `${f.name}: ${n}` }))),
  ];
  const [whereKey, setWhereKey] = useState<string>(src?.where ? `${src.where.field}${SEP}${src.where.equals}` : '');
  const thing = things.find((x) => x.key === key) ?? things[0];
  const aggOptions: GoalAgg[] = thing.kind === 'field' ? AGGS[thing.field?.type ?? 'number'] : [];
  const [agg, setAgg] = useState<GoalAgg>(src?.agg ?? 'sum');
  const [how, setHow] = useState<GoalHow>(src && src.how !== 'best' && src.how !== 'latest' ? src.how : 'week');
  const [cmp, setCmp] = useState<GoalDef['cmp']>(src?.cmp ?? 'min');
  const ref = thing.kind === 'combo' ? { measure: thing.key } : { field: thing.field?.id };
  const toDisp = (n: number) => goalToDisplay(t, thing.kind === 'field' || thing.kind === 'combo' ? ref : {}, n, settings);
  const startValue = (): number => {
    if (thing.kind === 'days') return 3;
    const d = thing.field?.default;
    return typeof d === 'number' && d > 0 ? toDisp(d) : 1;
  };
  const [value, setValue] = useState(src ? toDisp(src.value) : startValue());
  const [value2, setValue2] = useState(src?.value2 !== undefined ? toDisp(src.value2) : value + 1);
  const [start, setStart] = useState<number | undefined>(src?.start !== undefined ? toDisp(src.start) : undefined);
  const [until, setUntil] = useState<string | undefined>(src?.until);
  const [pay, setPay] = useState(src?.pay);
  const gameConfig = getState().systems.find((x) => x.id === t.systemId)?.config;
  const [picking, setPicking] = useState(false);
  const [month, setMonth] = useState(startOfMonth(today));

  const dayMeasure = dayMeasureOf(t, thing);
  const dayOk = !!dayMeasure && t.success.mode !== 'clean';
  const effHow: GoalHow = how === 'day' && !dayOk ? 'week' : how;
  const isDay = effHow === 'day';
  const effAgg: GoalAgg = thing.kind === 'days' ? 'days' : thing.kind === 'count' ? 'count' : thing.kind === 'combo' ? 'sum' : aggOptions.includes(agg) ? agg : aggOptions[0];
  const periodic = effHow === 'day' || effHow === 'week' || effHow === 'month';
  const cmps: GoalDef['cmp'][] = periodic ? ['min', 'max', 'range'] : effAgg === 'latest' ? ['reach', 'range'] : ['min', 'max'];
  const effCmp = cmps.includes(cmp) ? cmp : cmps[0];
  const step = thing.field ? defaultStep(thing.field, settings) : thing.kind === 'combo' ? 100 : 1;

  const lastReading = (): number | undefined => {
    if (!thing.field) return undefined;
    const e = state.entries.filter((x) => x.trackerId === t.id && x.done && x.values[thing.field!.id] !== undefined && x.values[thing.field!.id] !== '').sort((a, b) => b.at - a.at)[0];
    return e ? Number(e.values[thing.field.id]) : undefined;
  };
  const startShown = start ?? (() => { const l = lastReading(); return l === undefined ? value : goalToDisplay(t, ref, l, settings); })();

  const toBase = (n: number) => goalToBase(t, thing.kind === 'field' || thing.kind === 'combo' ? ref : {}, n, settings);
  const [wf, wo] = whereKey ? whereKey.split(SEP) : [];
  const goal: GoalDef = isDay
    ? {
        id: existing?.id ?? newId(), measure: dayMeasure as string, how: 'day', cmp: effCmp, value: toBase(value),
        ...(effCmp === 'range' ? { value2: toBase(Math.max(value, value2)) } : {}), from: dayKey(today),
      }
    : {
        id: existing?.id ?? newId(), measure: thing.key, ...(item && itemChoices.includes(item) ? { item } : {}),
        ...(whereKey ? { where: { field: wf, equals: wo } } : {}),
        ...(thing.kind === 'field' ? { field: thing.key } : {}), ...(thing.kind === 'combo' ? {} : { agg: effAgg }),
        how: effHow, cmp: effCmp, value: toBase(value),
        ...(effCmp === 'range' ? { value2: toBase(Math.max(value, value2)) } : {}),
        ...(effCmp === 'reach' ? { start: toBase(startShown) } : {}),
        from: existing && existing.how !== 'day' ? existing.from : dayKey(today),
        ...(!periodic && until ? { until } : {}),
        ...(pay ? { pay } : {}),
      };
  const untilChips: { label: string; key?: string }[] = [
    { label: 'No date' },
    { label: 'End of month', key: dayKey(periodOf('month', today, 'mon').end) },
    { label: '4 weeks', key: dayKey(addDays(today, 28)) },
    { label: '8 weeks', key: dayKey(addDays(today, 56)) },
    { label: '12 weeks', key: dayKey(addDays(today, 84)) },
  ];
  const wasDay = existing?.how === 'day';

  function save() {
    if (onSave) { onSave(goal); onClose(); return; }
    if (isDay) {
      if (existing && !wasDay) removeGoal(t.id, existing.id);
      saveDailyGoal(t.id, goal);
    } else {
      if (existing && wasDay) removeDailyGoal(t.id, existing.id);
      saveGoal(t.id, wasDay ? { ...goal, id: newId() } : goal);
    }
    onClose();
  }
  function remove() {
    if (!existing) return;
    if (onRemove) { onRemove(existing); onClose(); return; }
    if (wasDay) removeDailyGoal(t.id, existing.id);
    else removeGoal(t.id, existing.id);
    onClose();
  }

  return (
    <View style={{ flex: 1 }}>
      {/* The sentence stays put while the options scroll underneath it. */}
      <View style={{ paddingHorizontal: 16, paddingTop: topPad, paddingBottom: 10, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        <BackButton label="Goals" onPress={onClose} />
        <View style={{ backgroundColor: colors.accentBg, borderColor: colors.accent, borderWidth: 2, borderRadius: 12, padding: 12, marginTop: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 2 }}>Your goal</Text>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{describeGoal(t, goal, settings)}</Text>
        </View>
      </View>
      <Scroll contentContainerStyle={[s.content, { paddingTop: 12, paddingBottom: 60 }]} keyboardShouldPersistTaps="handled">
        <Card>
          <Dropdown
            compact label="Count" value={thing.name} selected={key} options={things.map((x) => ({ key: x.key, label: x.name }))}
            onSelect={(k) => { setKey(k); const x = things.find((y) => y.key === k); if (x?.kind === 'days' && how === 'day') setHow('week'); }}
          />
          {itemChoices.length > 0 && !isDay ? (
            <Dropdown
              compact label={`Which ${termsOf(t).item.toLowerCase()}`}
              value={item && itemChoices.includes(item) ? item : 'Any'} selected={item && itemChoices.includes(item) ? item : ''}
              options={[{ key: '', label: 'Any', sub: 'Counts everything' }, ...itemChoices.map((n) => ({ key: n, label: n }))]}
              onSelect={(k) => setItem(k || undefined)}
              searchable={itemChoices.length > 8} searchLabel={`Search ${itemChoices.length} ${pluralWord(termsOf(t).item.toLowerCase(), 2)}`}
            />
          ) : null}
          {choiceOpts.length > 0 && !isDay ? (
            <Dropdown
              compact label="Only where" value={choiceOpts.find((o) => o.key === whereKey)?.label ?? 'Any entry'} selected={whereKey}
              options={[{ key: '', label: 'Any entry', sub: 'Counts everything' }, ...choiceOpts]} onSelect={setWhereKey}
              searchable={choiceOpts.length > 8} searchLabel="Search options"
            />
          ) : null}
          {aggOptions.length > 0 && !isDay ? (
            <Dropdown
              compact label="Combine" value={AGG_WORD[effAgg].toLowerCase()} selected={effAgg}
              options={aggOptions.map((a) => ({ key: a, label: AGG_WORD[a].toLowerCase(), sub: AGG_HINT[a] }))} onSelect={(k) => setAgg(k as GoalAgg)}
            />
          ) : null}
          <Dropdown
            compact label="Over" value={HOW_LABEL[effHow]} selected={effHow}
            options={(['day', 'week', 'month', 'total'] as GoalHow[]).filter((h) => h !== 'day' || dayOk).map((h) => ({ key: h, label: HOW_LABEL[h], sub: HOW_HINT[h] }))}
            onSelect={(k) => setHow(k as GoalHow)}
          />
          <Dropdown
            compact label="Aim" value={CMP_LABEL[effCmp]} selected={effCmp}
            options={cmps.map((c) => ({ key: c, label: CMP_LABEL[c], sub: AIM_HINT[c] }))} onSelect={(k) => setCmp(k as GoalDef['cmp'])}
          />

          <View style={[s.row, { justifyContent: 'space-between', marginTop: 4 }]}>
            <Text style={{ color: colors.text, fontSize: 15 }}>{effCmp === 'range' ? 'From' : effCmp === 'reach' ? 'Target' : 'Amount'}</Text>
            <Stepper value={value} onChange={setValue} step={step} width={64} />
          </View>
          {effCmp === 'range' ? (
            <View style={[s.row, { justifyContent: 'space-between', marginTop: 8 }]}>
              <Text style={{ color: colors.text, fontSize: 15 }}>To</Text>
              <Stepper value={Math.max(value, value2)} onChange={setValue2} step={step} width={64} />
            </View>
          ) : null}
          {effCmp === 'reach' ? (
            <View style={[s.row, { justifyContent: 'space-between', marginTop: 8 }]}>
              <Text style={{ color: colors.text, fontSize: 15 }}>Starting from</Text>
              <Stepper value={startShown} onChange={setStart} step={step} width={64} />
            </View>
          ) : null}

          {!periodic ? (
            <View style={{ marginTop: 12 }}>
              <Dropdown
                compact label="By when"
                value={until ? (untilChips.find((c) => c.key === until)?.label ?? `On ${until}`) : 'No date'} selected={until && !untilChips.some((c) => c.key === until) ? 'pick' : until ?? ''}
                options={[...untilChips.map((c) => ({ key: c.key ?? '', label: c.label })), { key: 'pick', label: 'Pick a date' }]}
                onSelect={(k) => { if (k === 'pick') setPicking(true); else { setUntil(k || undefined); setPicking(false); } }}
              />
              {picking ? (
                <MonthCalendar
                  month={month} setMonth={setMonth} selected={until ? startOfDay(new Date(until + 'T00:00:00').getTime()) : today} today={today}
                  canPickFuture stateOf={() => 'none'} onPick={(d) => { setUntil(dayKey(d)); setPicking(false); }}
                />
              ) : null}
            </View>
          ) : null}

          {gameConfig && !isDay ? (
            <View style={{ marginTop: 12 }}>
              <PayEditor pay={pay} config={gameConfig} onChange={setPay} />
            </View>
          ) : null}

          <View style={[s.row, { marginTop: 16 }]}>
            <Button label="Cancel" variant="ghost" onPress={onClose} style={{ marginRight: 10 }} />
            <Button label={existing ? 'Save goal' : 'Add goal'} onPress={save} style={{ flex: 1 }} />
          </View>
          {existing ? <Button label="Remove this goal" variant="danger" onPress={remove} style={{ marginTop: 10 }} /> : null}
        </Card>
      </Scroll>
    </View>
  );
}

// ---------- the Goals screen ----------

// The daily rules that are not an amount: show up, finish the plan, stay clean. Amount goals are goals, listed below.
function ruleRow(t: Tracker, entries: Entry[], today: number): { title: string; p: Pick<GoalProgress, 'headline' | 'fraction' | 'status' | 'detail'> } | null {
  const r = dayResult(t, entriesOnDay(entries, t.id, today), today);
  const logged = (r.measures.done ?? 0) > 0;
  if (t.success.mode === 'clean') {
    return { title: 'Stay clean each day', p: { headline: logged ? 'Slipped today' : 'Clean so far', fraction: logged ? 0 : 1, status: logged ? 'over' : 'met', detail: '' } };
  }
  if (t.success.mode === 'logged') {
    return { title: 'Show up each day', p: { headline: logged ? 'Done today' : 'Not yet today', fraction: logged ? 1 : 0, status: logged ? 'met' : 'active', detail: logged ? '' : 'Log it once to count today' } };
  }
  if (t.success.mode === 'plan') {
    const pct = r.measures.completion ?? 0;
    return { title: 'Finish the plan each day', p: { headline: `${pct}% of ${t.success.minPct}%`, fraction: Math.min(1, pct / t.success.minPct), status: pct >= t.success.minPct ? 'met' : 'active', detail: '' } };
  }
  return null;
}

export function Goals({ id, back }: { id: string; back: () => void }) {
  const { state } = useAppState();
  const t = state.trackers.find((x) => x.id === id);
  const [editing, setEditing] = useState<GoalDef | 'new' | { preset: GoalDef } | null>(null);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editing !== null) setEditing(null);
      else back();
      return true;
    });
    return () => sub.remove();
  });
  if (!t) return <View style={s.screen} />;
  const settings = state.settings;
  const today = startOfDay(Date.now());
  const entries = state.entries.filter((e) => e.trackerId === id);
  const list = ranked(t, entries, today, settings);
  // A daily goal repeats every day, so it stays in the active list even on a day it is met.
  const isOpen = (x: { g: GoalDef; p: GoalProgress }) => x.g.how === 'day' || x.p.status === 'active' || x.p.status === 'over';
  const active = list.filter(isOpen);
  const finished = list.filter((x) => !isOpen(x));
  const rule = ruleRow(t, entries, today);
  const dailyAmounts = active.filter((x) => x.g.how === 'day'); // an amount to hit each day is part of what makes a good day
  const overTime = active.filter((x) => x.g.how !== 'day');

  // Start the same goal again from today, over the same length.
  function repeat(g: GoalDef) {
    const days = g.until ? Math.max(1, Math.round((dayFromKey(g.until) - dayFromKey(g.from)) / 86400000)) : undefined;
    const { start: _start, ...rest } = g;
    saveGoal(id, { ...rest, id: newId(), from: dayKey(today), ...(days ? { until: dayKey(addDays(today, days)) } : {}) });
  }
  // Adding a goal starts the builder at the one most likely to suit this tracker, so it is usually one number to change.
  const addGoal = () => { const top = suggestGoals(t, entries, settings)[0]; setEditing(top ? { preset: { ...top.goal, id: newId(), from: dayKey(today) } } : 'new'); };
  const openGoal = (g: GoalDef) => setEditing(g);

  if (editing !== null) {
    return (
      <View style={s.screen}>
        {editing === 'new' ? (
          <Builder t={t} entries={entries} onClose={() => setEditing(null)} />
        ) : 'preset' in editing ? (
          <Builder t={t} entries={entries} preset={editing.preset} onClose={() => setEditing(null)} />
        ) : (
          <Builder key={editing.id} t={t} entries={entries} existing={editing} onClose={() => setEditing(null)} />
        )}
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <ScreenHeader label={t.name} onBack={back} />
      <Scroll contentContainerStyle={[s.content, { paddingTop: 12 }]}>
        <View>
          <Title>Goals</Title>

          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 2 }}>A good day</Text>
          <Muted style={{ marginBottom: 8 }}>What counts as a good day. Your streak and points use this.</Muted>
          {rule ? (
            <Card><GoalBar title={rule.title} p={rule.p} /></Card>
          ) : null}
          {dailyAmounts.map(({ g, p }) => (
            <Tap key={g.id} onPress={() => openGoal(g)}><Card><GoalBar title={describeGoal(t, g, settings)} p={p} /></Card></Tap>
          ))}

          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 10, marginBottom: 2 }}>Goals</Text>
          <Muted style={{ marginBottom: 8 }}>Something to reach over a week, a month, or by a date.</Muted>
          {overTime.length === 0 ? <Muted style={{ marginBottom: 10 }}>None yet.</Muted> : null}
          {overTime.map(({ g, p }) => (
            <Tap key={g.id} onPress={() => openGoal(g)}><Card><GoalBar title={describeGoal(t, g, settings)} p={p} /></Card></Tap>
          ))}
          <Button label="Add a goal" onPress={addGoal} style={{ marginBottom: 14 }} />

          {finished.length > 0 ? (
            <View>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>Finished</Text>
              {finished.map(({ g, p }) => (
                <Card key={g.id}>
                  <Tap onPress={() => openGoal(g)}><GoalBar title={describeGoal(t, g, settings)} p={p} compact /></Tap>
                  <SmallButton label="Repeat" icon="repeat-outline" onPress={() => repeat(g)} style={{ marginTop: 10 }} />
                </Card>
              ))}
            </View>
          ) : null}
        </View>
      </Scroll>
    </View>
  );
}

// ---------- compact views ----------

// Under the week strip on a tracker page: your goals at a glance, tap for the full screen.
export function GoalsRow({ t, entries, onOpen }: { t: Tracker; entries: Entry[]; onOpen: () => void }) {
  const { state } = useAppState();
  const today = startOfDay(Date.now());
  const list = ranked(t, entries, today, state.settings).filter((x) => x.p.status === 'active' || x.p.status === 'over' || x.p.status === 'met').slice(0, 2);
  return (
    <Tap onPress={onOpen}>
      <Card style={{ marginBottom: 12 }}>
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: list.length ? 10 : 0 }]}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>Goals</Text>
          <SmallButton label={list.length ? 'See all' : 'Set a goal'} trailing="chevron-forward" />
        </View>
        {list.length === 0 ? <Muted>Add a goal for the week or month and watch your progress here.</Muted> : null}
        {list.map(({ g, p }, i) => (
          <View key={g.id} style={{ marginBottom: i === list.length - 1 ? 0 : 12 }}><GoalBar title={describeGoal(t, g, state.settings)} p={p} compact /></View>
        ))}
      </Card>
    </Tap>
  );
}
