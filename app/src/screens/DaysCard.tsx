// The pieces of the Days card: seven tappable days, the controls for each kind of schedule, and the optional time limit.

import { Text, View } from 'react-native';
import { dayKeyOf } from '../core/plan';
import { MAX_BLOCK, daysBetween, keyToDay, normalizeSchedule, scheduleText, weekdaysOf } from '../core/schedule';
import { type Answers } from '../core/setup';
import { addDays, startOfDay } from '../core/time';
import type { Schedule } from '../core/types';
import { Chip, Muted, Stepper, Tap, Toggle, colors, s } from '../ui/kit';
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

// The controls for the kinds other than days of the week. On the summary only the one or two quick inputs show (how many
// days, how many times, which day of the month); the Days screen adds the rest, like where counting starts.
export function KindControls({ schedule, change, full }: { schedule: Schedule; change: (s: Schedule) => void; full?: boolean }) {
  const today = startOfDay(Date.now());
  return (
    <View>
      {schedule.kind === 'interval' ? (
        <View style={{ marginTop: 0, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: colors.text, fontSize: 15, marginRight: 10 }}>Every</Text>
            <Stepper value={schedule.n} min={2} max={30} onChange={(n) => change({ ...schedule, n })} />
            <Text style={{ color: colors.text, fontSize: 15, marginLeft: 10 }}>days</Text>
          </View>
          {full ? <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>Counting from</Text> : null}
          {full ? <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[
              { label: 'Today', at: today },
              { label: 'Tomorrow', at: addDays(today, 1) },
              { label: 'Next Monday', at: addDays(today, ((8 - new Date(today).getDay()) % 7) || 7) },
            ].map((o) => (
              <Chip key={o.label} label={o.label} active={schedule.from === dayKeyOf(o.at)} onPress={() => change({ ...schedule, from: dayKeyOf(o.at) })} />
            ))}
          </View> : null}
        </View>
      ) : null}

      {schedule.kind === 'times' ? (
        <View style={{ marginTop: 0, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Stepper value={schedule.n} min={1} max={schedule.per === 'week' ? 7 : 31} onChange={(n) => change({ ...schedule, n })} />
            <Text style={{ color: colors.text, fontSize: 15, marginLeft: 10 }}>{schedule.n === 1 ? 'time a' : 'times a'}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Chip label="Week" active={schedule.per === 'week'} onPress={() => change({ ...schedule, per: 'week', n: Math.min(schedule.n, 7) })} />
            <Chip label="Month" active={schedule.per === 'month'} onPress={() => change({ ...schedule, per: 'month' })} />
          </View>
        </View>
      ) : null}

      {schedule.kind === 'blocks' ? (
        <View style={{ marginTop: 0, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: colors.text, fontSize: 15, marginRight: 10 }}>Blocks of</Text>
            <Stepper value={schedule.n} min={2} max={MAX_BLOCK} onChange={(n) => change({ kind: 'blocks', n })} />
            <Text style={{ color: colors.text, fontSize: 15, marginLeft: 10 }}>days</Text>
          </View>
          {full ? <Muted>Log a day to start a block. The days after it are expected, then nothing is until you start the next one. A skipped day counts as missed; the block keeps going.</Muted> : null}
        </View>
      ) : null}

      {schedule.kind === 'monthly' ? (
        <View style={{ marginTop: 0, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: colors.text, fontSize: 15, marginRight: 10 }}>On day</Text>
            <Stepper value={schedule.day === 'last' ? 28 : schedule.day} min={1} max={31} onChange={(day) => change({ kind: 'monthly', day })} />
          </View>
          <View style={{ flexDirection: 'row' }}>
            <Chip label="Last day of the month" active={schedule.day === 'last'} onPress={() => change({ kind: 'monthly', day: schedule.day === 'last' ? 28 : 'last' })} />
          </View>
        </View>
      ) : null}

    </View>
  );
}
// "Only for a while": a challenge or a set period. A start and a length; after the last day the tracker stops asking.
export function ForAWhile({ a, set, today }: { a: Answers; set: (p: Partial<Answers>) => void; today: number }) {
  const w = a.window;
  const length = w?.from && w?.until ? daysBetween(keyToDay(w.from), keyToDay(w.until)) + 1 : 30;
  const startKey = w?.from ?? dayKeyOf(today);
  const make = (fromKey: string, days: number) => ({ from: fromKey, until: dayKeyOf(addDays(keyToDay(fromKey), days - 1)) });
  const starts = [
    { label: 'Today', at: today },
    { label: 'Tomorrow', at: addDays(today, 1) },
    { label: 'Next Monday', at: addDays(today, ((8 - new Date(today).getDay()) % 7) || 7) },
  ];
  return (
    <View style={{ marginTop: 4 }}>
      <Toggle
        label="Only for a while"
        value={!!w} onChange={(v) => set({ window: v ? make(dayKeyOf(today), 30) : undefined })}
      />
      {w ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>How long</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {[7, 14, 30, 60, 90].map((n) => <Chip key={n} label={`${n} days`} active={length === n} onPress={() => set({ window: make(startKey, n) })} />)}
          </View>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 6 }}>Starts</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {starts.map((o) => <Chip key={o.label} label={o.label} active={startKey === dayKeyOf(o.at)} onPress={() => set({ window: make(dayKeyOf(o.at), length) })} />)}
          </View>
          <Muted>{scheduleText({ kind: 'daily' }, w).replace('Every day, ', '')}</Muted>
        </View>
      ) : null}
    </View>
  );
}

