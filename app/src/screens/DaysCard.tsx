// The pieces of the Days card: seven tappable days, the controls for each kind of schedule, and the optional time limit.

import { Text, View } from 'react-native';
import { dayKeyOf } from '../core/plan';
import { MAX_BLOCK, daysBetween, keyToDay, normalizeSchedule, scheduleText, weekdaysOf } from '../core/schedule';
import { type Answers } from '../core/setup';
import { addDays, startOfDay } from '../core/time';
import type { Schedule } from '../core/types';
import { ChoiceGrid, Muted, Stepper, Tap, colors } from '../ui/kit';
import { EDGE } from '../ui/theme';

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first


// Seven tappable days. Used on the summary and on the Days screen, so the two always behave the same.
export function WeekToggles({ schedule, onChange }: { schedule: Schedule; onChange: (s: Schedule) => void }) {
  const days = weekdaysOf(schedule);
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {WEEK.map((d) => {
        const on = days.includes(d);
        return (
          <Tap
            key={d} accessibilityLabel={LONG[d]}
            onPress={() => onChange(normalizeSchedule({ kind: 'weekdays', days: on ? days.filter((x) => x !== d) : [...days, d] }))}
            style={{ flex: 1, height: 48, borderRadius: 12, borderWidth: EDGE, alignItems: 'center', justifyContent: 'center', borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : 'transparent' }}
          >
            <Text style={{ color: on ? colors.onAccent : colors.text, fontSize: 13, fontWeight: '700' }}>{SHORT[d]}</Text>
          </Tap>
        );
      })}
    </View>
  );
}

// A small grey label over each group of controls, so every rhythm reads the same way.
const Label = ({ children }: { children: string }) => <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>{children}</Text>;
const Line = ({ before, after, children }: { before?: string; after?: string; children: React.ReactNode }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
    {before ? <Text style={{ color: colors.text, fontSize: 15, marginRight: 10 }}>{before}</Text> : null}
    {children}
    {after ? <Text style={{ color: colors.text, fontSize: 15, marginLeft: 10 }}>{after}</Text> : null}
  </View>
);

// Today, tomorrow and the next Monday, as day keys: where counting or a set time starts.
const startChoices = (today: number) => [
  { key: dayKeyOf(today), label: 'Today' },
  { key: dayKeyOf(addDays(today, 1)), label: 'Tomorrow' },
  { key: dayKeyOf(addDays(today, ((8 - new Date(today).getDay()) % 7) || 7)), label: 'Monday' },
];

// The controls for the kinds other than days of the week: only the numbers; the headline above already says what it means.
export function KindControls({ schedule, change }: { schedule: Schedule; change: (s: Schedule) => void }) {
  const today = startOfDay(Date.now());
  if (schedule.kind === 'times') {
    return (
      <View>
        <Line after={schedule.n === 1 ? 'day' : 'days'}>
          <Stepper value={schedule.n} min={1} max={schedule.per === 'week' ? 7 : 31} onChange={(n) => change({ ...schedule, n })} />
        </Line>
        <ChoiceGrid
          cols={2} value={schedule.per}
          onPick={(k) => change(k === 'week' ? { ...schedule, per: 'week', n: Math.min(schedule.n, 7) } : { ...schedule, per: 'month' })}
          options={[{ key: 'week', label: 'A week' }, { key: 'month', label: 'A month' }]}
        />
      </View>
    );
  }
  if (schedule.kind === 'interval') {
    return (
      <View>
        <Line before="Every" after="days">
          <Stepper value={schedule.n} min={2} max={30} onChange={(n) => change({ ...schedule, n })} />
        </Line>
        <Label>Counting from</Label>
        <ChoiceGrid cols={3} value={schedule.from} onPick={(k) => change({ ...schedule, from: k })} options={startChoices(today)} />
      </View>
    );
  }
  if (schedule.kind === 'monthly') {
    const last = schedule.day === 'last';
    const day = last ? 1 : (schedule.day as number);
    return (
      <View>
        <ChoiceGrid
          cols={2} value={last ? 'last' : 'date'}
          onPick={(k) => change({ kind: 'monthly', day: k === 'last' ? 'last' : day })}
          options={[{ key: 'date', label: 'A date' }, { key: 'last', label: 'The last day' }]}
        />
        {!last ? (
          <Line before="Day" after="of the month">
            <Stepper value={day} min={1} max={31} onChange={(d) => change({ kind: 'monthly', day: d })} />
          </Line>
        ) : null}
        {!last && day > 28 ? <Muted style={{ marginTop: -4, marginBottom: 8 }}>In shorter months it falls on the last day.</Muted> : null}
      </View>
    );
  }
  if (schedule.kind === 'blocks') {
    return (
      <Line before="Blocks of" after="days">
        <Stepper value={schedule.n} min={2} max={MAX_BLOCK} onChange={(n) => change({ kind: 'blocks', n })} />
      </Line>
    );
  }
  return null;
}

// Whether it keeps repeating or runs for a set time (a challenge, a course). Always shown, so it is plain that a tracker
// repeats until you stop it unless you give it an end.
export function ForAWhile({ a, set, today }: { a: Answers; set: (p: Partial<Answers>) => void; today: number }) {
  const w = a.window;
  const length = w?.from && w?.until ? daysBetween(keyToDay(w.from), keyToDay(w.until)) + 1 : 30;
  const startKey = w?.from ?? dayKeyOf(today);
  const make = (fromKey: string, days: number) => ({ from: fromKey, until: dayKeyOf(addDays(keyToDay(fromKey), days - 1)) });
  return (
    <View style={{ marginTop: 10 }}>
      <Label>Repeats</Label>
      <ChoiceGrid
        cols={2} value={w ? 'set' : 'on'}
        onPick={(k) => set({ window: k === 'set' ? (w ?? make(dayKeyOf(today), 30)) : undefined })}
        options={[{ key: 'on', label: 'Until I stop' }, { key: 'set', label: 'For a set time' }]}
      />
      {w ? (
        <View>
          <Label>How many days</Label>
          <ChoiceGrid cols={5} value={String(length)} onPick={(k) => set({ window: make(startKey, Number(k)) })} options={[7, 14, 30, 60, 90].map((n) => ({ key: String(n), label: String(n) }))} />
          <Label>Starting</Label>
          <ChoiceGrid cols={3} value={startKey} onPick={(k) => set({ window: make(k, length) })} options={startChoices(today)} />
          <Muted>{scheduleText({ kind: 'daily' }, w).replace('Every day, ', '').replace(/^./, (c) => c.toUpperCase())}</Muted>
        </View>
      ) : null}
    </View>
  );
}
