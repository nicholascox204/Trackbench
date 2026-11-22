// Opening on the right tracker, tried over sixty simulated days for different kinds of people. Each person opens the app
// at set times wanting a particular tracker; the app picks one, they log what they wanted (a wrong pick costs one tap on
// the bar), and what they log feeds the next day's pick. The rate over the last thirty days is compared with "where I was".
import assert from 'node:assert/strict';
import test from 'node:test';
import { pickStart } from './startPick';
import { answersFromPreset, draftFromAnswers } from './setup';
import { addDays, startOfDay } from './time';
import type { Entry, Settings, Tracker } from './types';

const SETTINGS: Settings = { units: 'imperial' };
const DAY0 = startOfDay(new Date(2026, 8, 1).getTime()); // a Tuesday
const at = (day: number, h: number, m = 0): number => day + (h * 60 + m) * 60000;
const mk = (id: string): Tracker => ({ ...draftFromAnswers(answersFromPreset('check-in'), SETTINGS), id, name: id, systemId: null, createdAt: DAY0 });
const bar = ['D', 'A', 'B', 'C'].map(mk); // D is first on the bar
type Session = { h: number; m: number; want: string };
type Plan = (n: number, day: number) => Session[];

const weekend = (day: number) => [0, 6].includes(new Date(day).getDay());
const routine = (shift = 0): Session[] => [{ h: 7 + shift, m: 40, want: 'A' }, { h: 12 + shift, m: 40, want: 'B' }, { h: 19 + shift, m: 10, want: 'C' }];

function run(plan: Plan, mode: 'smart' | 'last'): number {
  const entries: Entry[] = [];
  let last: { id: string; at: number } | null = null;
  let hits = 0, total = 0;
  for (let n = 0; n < 60; n++) {
    const day = addDays(DAY0, n);
    for (const s of plan(n, day)) {
      const now = at(day, s.h, s.m);
      const pick = pickStart(bar, entries, now, { mode }, last);
      if (n >= 30) { total++; if (pick === s.want) hits++; }
      entries.push({ id: `${s.want}${now}`, trackerId: s.want, at: now, done: true, values: {} });
      last = { id: s.want, at: now };
    }
  }
  return total ? hits / total : 0;
}

const people: Record<string, { plan: Plan; floor: number }> = {
  'a regular day': { plan: () => routine(), floor: 0.9 },
  'weekends on a later clock': { plan: (_n, day) => (weekend(day) ? routine(3) : routine()), floor: 0.8 },
  'a sick day every week': { plan: (n) => routine(n % 7 === 3 ? 4 : 0), floor: 0.8 },
  'a week away in another time zone': { plan: (n) => routine(n >= 40 && n < 47 ? 5 : 0), floor: 0.8 },
  'a tracker never used, first on the bar': { plan: () => routine(), floor: 0.9 },
  'everything logged in one sitting at night': { plan: () => [{ h: 21, m: 0, want: 'A' }, { h: 21, m: 1, want: 'B' }, { h: 21, m: 2, want: 'C' }], floor: 0.3 },
};

for (const [name, p] of Object.entries(people)) {
  test(`opening for ${name} is right often enough and better than where I was`, () => {
    const smart = run(p.plan, 'smart');
    const last = run(p.plan, 'last');
    console.log(`  ${name}: smart ${(smart * 100).toFixed(0)}%, where I was ${(last * 100).toFixed(0)}%`);
    assert.ok(smart >= p.floor, `smart ${smart}`);
    assert.ok(smart >= last, `smart ${smart} should not do worse than where I was ${last}`);
  });
}

test('the stale tracker is never what the app opens on once the others are in use', () => {
  const entries: Entry[] = [];
  for (let n = 0; n < 20; n++) entries.push({ id: `A${n}`, trackerId: 'A', at: at(addDays(DAY0, n), 8), done: true, values: {} });
  const now = at(addDays(DAY0, 20), 3, 0); // nothing near anyone's usual time
  assert.notEqual(pickStart(bar, entries, now, { mode: 'smart' }, null), 'D');
});

test('a tracker that is finished is not where a quick reopen goes while others are waiting', () => {
  const entries: Entry[] = [{ id: 'x', trackerId: 'A', at: at(DAY0, 8), done: true, values: {} }];
  const pick = pickStart(bar, entries, at(DAY0, 8, 10), { mode: 'smart' }, { id: 'A', at: at(DAY0, 8) });
  assert.notEqual(pick, 'A');
});

test('a day logged afterwards by hand does not pull the usual time to noon', () => {
  const entries: Entry[] = [];
  for (let n = 1; n <= 8; n++) entries.push({ id: `b${n}`, trackerId: 'A', at: addDays(DAY0, n) + 12 * 3600000, done: true, values: {} });
  for (let n = 1; n <= 8; n++) entries.push({ id: `r${n}`, trackerId: 'B', at: at(addDays(DAY0, n), 7, 0), done: true, values: {} });
  const now = at(addDays(DAY0, 10), 7, 0);
  assert.equal(pickStart(bar.slice(1, 3), entries, now, { mode: 'smart' }, null), 'B');
});
