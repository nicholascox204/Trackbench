// Days, on the summary. A "How often" dropdown (so it is plain that there are other rhythms) with the controls for the chosen one
// right under it: the day toggles for certain days, a count for a number of times, and so on. A planned tracker adds a Lists
// dropdown below. The two are linked (a list for each weekday needs weekdays; taking turns needs a number of times or whenever),
// so choosing one that does not fit the other changes the other for you.

import { Text, View } from 'react-native';
import { MAX_LISTS, dayKeyOf } from '../core/plan';
import { normalizeSchedule } from '../core/schedule';
import type { Answers } from '../core/setup';
import type { Schedule } from '../core/types';
import { Card, Stepper, colors } from '../ui/kit';
import { Dropdown, type DropdownOption } from '../ui/Dropdown';
import { ForAWhile, KindControls, WeekToggles } from './DaysCard';

type Kind = Schedule['kind'];
const FLEXIBLE: Kind[] = ['times', 'whenever'];

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

const DEFAULT_LISTS = ['', '', '']; // named in the tracker itself

export function ScheduleSection({ a, set, planned }: { a: Answers; set: (p: Partial<Answers>) => void; planned: boolean }) {
  const sc = a.schedule;
  const turns = a.rotation.length >= 2;
  const todayKey = dayKeyOf(Date.now());
  const options: DropdownOption[] = sc.kind === 'blocks' ? [...OPTIONS, { key: 'blocks', label: 'Blocks of days'}] : OPTIONS;
  const kindLabel = options.find((o) => o.key === sc.kind)?.label ?? 'Every day';

  const choose = (kind: string) => {
    const next = normalizeSchedule(startFor(kind as Kind, sc, todayKey));
    if (!planned) { set({ schedule: next }); return; }
    const fits = FLEXIBLE.includes(kind as Kind);
    if (turns && !fits) {
      // The lists were being taken in turn, which only works with a number of times or whenever.
      set({ schedule: next, rotation: [], samePlan: !(kind === 'daily' || kind === 'weekdays') });
      return;
    }
    set({ schedule: next, ...(turns ? {} : kind === 'daily' || kind === 'weekdays' ? {} : { samePlan: true }) });
  };

  const chooseLists = (k: string) => {
    if (k === 'same') set({ samePlan: true, rotation: [] });
    else if (k === 'each') set({ samePlan: false, rotation: [], ...(sc.kind === 'daily' || sc.kind === 'weekdays' || sc.kind === 'blocks' ? {} : { schedule: startFor('weekdays', sc, todayKey) }) });
    else set({ samePlan: false, rotation: turns ? a.rotation : DEFAULT_LISTS, ...(FLEXIBLE.includes(sc.kind) ? {} : { schedule: { kind: 'times', n: 3, per: 'week' } }) });
  };

  const lists = turns ? 'turns' : a.samePlan ? 'same' : 'each';
  const listsLabel = lists === 'turns' ? 'Choose each time' : lists === 'same' ? 'The same list' : 'A list per weekday';

  return (
    <Card style={{ padding: 12, marginBottom: 8 }}>
      <Dropdown row label="How often" value={kindLabel} options={options} selected={sc.kind} onSelect={choose} />

      {sc.kind === 'weekdays' ? <View style={{ marginTop: 10 }}><WeekToggles schedule={sc} onChange={(x) => set({ schedule: x })} /></View> : null}
      {sc.kind === 'times' || sc.kind === 'interval' || sc.kind === 'monthly' || sc.kind === 'blocks' ? <View style={{ marginTop: 10 }}><KindControls schedule={sc} change={(x) => set({ schedule: x })} /></View> : null}
      {sc.kind === 'weekdays' && sc.days.length === 0 ? <Text style={{ color: colors.warn, fontSize: 13, marginTop: 6 }}>Pick at least one day.</Text> : null}

      {planned ? (
        <View style={{ marginTop: 10 }}>
          <Dropdown
            row label="Lists" value={listsLabel} selected={lists} onSelect={chooseLists}
            options={[
              { key: 'same', label: 'The same list' },
              { key: 'each', label: 'A list per weekday' },
              { key: 'turns', label: 'Choose each time' },
            ]}
          />
          {lists === 'turns' ? (
            <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 15, marginRight: 10 }}>Lists</Text>
              <Stepper value={a.rotation.length} min={2} max={MAX_LISTS} onChange={(n) => set({ rotation: Array.from({ length: n }, (_, i) => a.rotation[i] ?? '') })} />
            </View>
          ) : null}
        </View>
      ) : null}

      {/* An end date only shows where a template set one (a 30-day challenge); ending belongs with goals, reworked later. */}
      {a.window ? <ForAWhile a={a} set={set} today={Date.now()} /> : null}
    </Card>
  );
}
