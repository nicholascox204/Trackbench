// The editor rework: no rest days, previous values that follow the exercise, and blocks of days.
import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedOn } from './measures';
import { planFor, previousRow, stripRest } from './plan';
import { blockPosition, isDueOn, normalizeSchedule, scheduleText, startingSchedule, weekdaysOf } from './schedule';
import { answersFromPreset, draftFromAnswers } from './setup';
import { dayResult } from './day';
import { addDays, startOfDay } from './time';
import type { Entry, PlanDay, Schedule, Settings, Tracker } from './types';

const SETTINGS: Settings = { units: 'imperial' };
const day = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
const gym = (patch: Partial<Tracker> = {}): Tracker => ({ ...draftFromAnswers(answersFromPreset('set-plan'), SETTINGS), id: 'g', systemId: null, createdAt: day(2026, 1, 1), ...patch });
const logged = (trackerId: string, d: number, slotId?: string, row?: number): Entry => ({ id: `${trackerId}${d}${slotId ?? ''}${row ?? ''}`, trackerId, at: d + 3600000, slotId, row, done: true, values: { weight: 50 } });

test('old rest days load as ordinary days: no flag, no "Rest" label', () => {
  const old = [
    { label: 'Rest', rest: true, slots: [] },
    { label: 'Push', rest: false, slots: [{ id: 'a', name: 'Bench', sets: 3 }] },
    { label: '', rest: true, slots: [] },
  ] as unknown as PlanDay[];
  const clean = stripRest(old);
  assert.equal(clean[0].label, '');
  assert.equal(clean[1].label, 'Push');
  assert.equal(clean[1].slots.length, 1);
  assert.ok(clean.every((d) => !('rest' in d)), 'the flag is gone');
});

test('a day left out of the schedule is not expected, and nothing is called rest', () => {
  const t = gym({ schedule: { kind: 'weekdays', days: [1, 2, 3, 4, 5, 6] } }); // everything but Sunday
  const sunday = day(2026, 11, 15);
  assert.equal(new Date(sunday).getDay(), 0);
  assert.equal(expectedOn(t, sunday), false);
  assert.equal(dayResult(t, [], sunday).success, false);
  assert.equal(scheduleText(t.schedule as Schedule), 'Mon, Tue, Wed, Thu, Fri, Sat');
});

test('previous values follow the exercise, not the weekday', () => {
  const tue = day(2026, 11, 17);
  const wed = addDays(tue, 1);
  const entries = [logged('g', tue, 'bench', 0)];
  assert.equal(previousRow(entries, 'bench', 0, wed)?.values.weight, 50, "Tuesday's list done on Wednesday still finds Tuesday's numbers");
  assert.equal(previousRow(entries, 'bench', 0, tue), null, 'never the same day');
  assert.equal(previousRow(entries, 'bench', 1, wed), null, 'the same set of the same exercise only');
  assert.equal(previousRow(entries, 'squat', 0, wed), null);
});

test('previous values pick the most recent earlier entry', () => {
  const d0 = day(2026, 11, 1);
  const entries = [{ ...logged('g', d0, 'bench', 0), values: { weight: 40 } }, { ...logged('g', addDays(d0, 3), 'bench', 0), values: { weight: 45 } }];
  assert.equal(previousRow(entries, 'bench', 0, addDays(d0, 10))?.values.weight, 45);
  assert.equal(previousRow(entries, 'bench', 0, addDays(d0, 2))?.values.weight, 40);
});

test('blocks: logging a day opens a block and the next days are expected', () => {
  const n = 3;
  const start = day(2026, 11, 2);
  const days = [start];
  assert.equal(blockPosition(n, days, start), 1, 'the day you logged is day 1');
  assert.equal(blockPosition(n, days, addDays(start, 1)), 2);
  assert.equal(blockPosition(n, days, addDays(start, 2)), 3);
  assert.equal(blockPosition(n, days, addDays(start, 3)), null, 'after the block nothing is expected');
  assert.equal(blockPosition(n, days, addDays(start, -1)), null, 'before it either');
  assert.equal(blockPosition(n, [], start), null, 'no log, no block');
});

test('blocks keep counting the calendar when a day is skipped, and a later log opens the next block', () => {
  const n = 3;
  const a = day(2026, 11, 2);
  const logs = [a, addDays(a, 2), addDays(a, 7)]; // skipped day 2; then a week later
  assert.equal(blockPosition(n, logs, addDays(a, 1)), 2, 'the skipped day is still part of the block');
  assert.equal(blockPosition(n, logs, addDays(a, 2)), 3, 'logging inside a block does not restart it');
  assert.equal(blockPosition(n, logs, addDays(a, 3)), null);
  assert.equal(blockPosition(n, logs, addDays(a, 7)), 1, 'a log after the block opens a new one');
  assert.equal(blockPosition(n, logs, addDays(a, 8)), 2);
});

test('a blocks tracker expects only the days inside a block', () => {
  const t = gym({ input: 'form', schedule: { kind: 'blocks', n: 3 } as Schedule, plan: [] });
  const a = day(2026, 11, 2);
  const all = [logged('g', a)];
  assert.equal(expectedOn(t, a, all), true);
  assert.equal(expectedOn(t, addDays(a, 1), all), true);
  assert.equal(expectedOn(t, addDays(a, 3), all), false);
  assert.equal(expectedOn(t, a, []), false, 'with nothing logged nothing is expected');
  assert.equal(isDueOn({ kind: 'blocks', n: 3 } as Schedule, a), false, 'a block is not tied to a date');
});

test("a blocks plan uses the day's position in the block as its list", () => {
  const t = gym({ schedule: { kind: 'blocks', n: 3 } as Schedule });
  const a = day(2026, 11, 2);
  const labelOf = (i: number) => t.plan[0].days[i].label;
  const all = [logged('g', a)];
  assert.equal(planFor(t, addDays(a, 1), all)?.label, labelOf(1), 'day 2 of the block is the second list');
  assert.equal(planFor(t, addDays(a, 5), all)?.label, labelOf(0), 'outside a block, the next one starts with the first list');
});

test('blocks in the schedule list: a starting value, a sentence, at most seven, and no weekdays', () => {
  const s = startingSchedule('blocks', { kind: 'daily' }, '2026-11-18') as Schedule & { n: number };
  assert.equal(s.kind, 'blocks');
  assert.equal(s.n, 3);
  assert.equal(scheduleText({ kind: 'blocks', n: 3 } as Schedule), 'Blocks of 3 days, whenever you start');
  assert.equal(normalizeSchedule({ kind: 'blocks', n: 40 } as Schedule).kind, 'blocks');
  assert.deepEqual(weekdaysOf({ kind: 'blocks', n: 3 } as Schedule), [0, 1, 2], 'a plan for blocks is its first n lists');
  assert.equal((normalizeSchedule({ kind: 'blocks', n: 40 } as Schedule) as { n: number }).n, 7);
});

test('startOfDay is used for days (guard against clock changes)', () => {
  assert.equal(startOfDay(day(2026, 11, 2) + 5000), day(2026, 11, 2));
});
