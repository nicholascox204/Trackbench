// Days, on the summary: a How often dropdown with the controls for the chosen rhythm right under it. How a list works
// (one list, one per weekday, pick each time) is part of You log by, not of the days.

import { Text, View } from 'react-native';
import { dayKeyOf } from '../core/plan';
import { normalizeSchedule } from '../core/schedule';
import { picksLists, type Answers } from '../core/setup';
import type { Schedule } from '../core/types';
import { Card, colors } from '../ui/kit';
import { Dropdown, type DropdownOption } from '../ui/Dropdown';
import { ForAWhile, KindControls, WeekToggles } from './DaysCard';

type Kind = Schedule['kind'];
// A list per weekday needs a rhythm made of weekdays.
export const WEEKLY: Kind[] = ['daily', 'weekdays', 'blocks'];

// Fixed rhythms first (the calendar says which day), then flexible ones (you choose), each half from most to least often.
const OPTIONS: DropdownOption[] = [
  { key: 'daily', label: 'Every day' },
  { key: 'weekdays', label: 'On certain weekdays' },
  { key: 'interval', label: 'Every few days' },
  { key: 'monthly', label: 'On a date each month' },
  { key: 'times', label: 'A number of days' },
  { key: 'whenever', label: 'Whenever' },
];

const startFor = (kind: Kind, previous: Schedule, todayKey: string): Schedule => {
  switch (kind) {
    case 'daily': return { kind: 'daily' };
    case 'weekdays': return previous.kind === 'weekdays' ? previous : { kind: 'weekdays', days: [1, 3, 5] }; // a few days on, so on and off read clearly
    case 'times': return previous.kind === 'times' ? previous : { kind: 'times', n: 3, per: 'week' };
    case 'interval': return previous.kind === 'interval' ? previous : { kind: 'interval', n: 2, from: todayKey };
    case 'monthly': return previous.kind === 'monthly' ? previous : { kind: 'monthly', day: 1 };
    default: return { kind: 'whenever' };
  }
};

export function ScheduleSection({ a, set, planned }: { a: Answers; set: (p: Partial<Answers>) => void; planned: boolean }) {
  const sc = a.schedule;
  const todayKey = dayKeyOf(Date.now());
  const options: DropdownOption[] = sc.kind === 'blocks' ? [...OPTIONS, { key: 'blocks', label: 'Blocks of days'}] : OPTIONS;
  const kindLabel = options.find((o) => o.key === sc.kind)?.label ?? 'Every day';

  // How often never changes the lists, except where a list per weekday no longer has weekdays: then it is one list.
  const choose = (kind: string) => {
    const next = normalizeSchedule(startFor(kind as Kind, sc, todayKey));
    const perWeekday = planned && !a.samePlan && !picksLists(a);
    set({ schedule: next, ...(perWeekday && !WEEKLY.includes(next.kind) ? { samePlan: true } : {}) });
  };

  return (
    <Card style={{ padding: 12, marginBottom: 8 }}>
      <Dropdown compact flush label="How often" value={kindLabel} options={options} selected={sc.kind} onSelect={choose} />

      {sc.kind === 'weekdays' ? <View style={{ marginTop: 10 }}><WeekToggles schedule={sc} onChange={(x) => set({ schedule: x })} /></View> : null}
      {sc.kind === 'times' || sc.kind === 'interval' || sc.kind === 'monthly' || sc.kind === 'blocks' ? <View style={{ marginTop: 10 }}><KindControls schedule={sc} change={(x) => set({ schedule: x })} /></View> : null}
      {sc.kind === 'weekdays' && sc.days.length === 0 ? <Text style={{ color: colors.warn, fontSize: 13, marginTop: 6 }}>Pick at least one day.</Text> : null}

      {/* An end date only shows where a template set one (a 30-day challenge); ending belongs with goals, reworked later. */}
      {a.window ? <ForAWhile a={a} set={set} today={Date.now()} /> : null}
    </Card>
  );
}
