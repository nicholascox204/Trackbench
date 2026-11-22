// Lists taken in turn (Push, Pull, Legs) for people whose training days are not fixed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { nextList, planIndexFor, versionFor } from './plan';
import { answersFromPreset, answersFromTracker, draftFromAnswers, scheduleFromAnswers, summaryLines } from './setup';
import { startOfDay } from './time';
import type { Entry, Settings, Tracker } from './types';

const SETTINGS: Settings = { units: 'imperial' };
const DAY = startOfDay(new Date(2026, 10, 18).getTime());
const day = (n: number): number => DAY + n * 86400000;

function rotation(names = ['Push', 'Pull', 'Legs']): Tracker {
  const a = { ...answersFromPreset('set-plan'), name: 'Gym', rotation: names, samePlan: false, schedule: { kind: 'times' as const, n: 4, per: 'week' as const } };
  const d = draftFromAnswers(a, SETTINGS);
  // one slot in each list so there is something to log
  const plan = d.plan.map((v) => ({ ...v, from: '2000-01-01', days: v.days.map((x, i) => ({ ...x, slots: [{ id: `s${i}`, name: `Move ${i}`, sets: 3 }] })) }));
  return { ...d, plan, id: 'g', systemId: null, createdAt: 0 };
}
const log = (slot: number, at: number): Entry => ({ id: `e${slot}${at}`, trackerId: 'g', at: at + 3600000, done: true, slotId: `s${slot}`, values: {} });

test('a rotation is just its lists, in order, kept as a rotation', () => {
  const t = rotation();
  const v = versionFor(t.plan, DAY)!;
  assert.equal(v.rotation, true);
  assert.deepEqual(v.days.map((d) => d.label), ['Push', 'Pull', 'Legs']);
});

test('the next list is the one after the last you trained, and skipped days do not move it', () => {
  const t = rotation();
  assert.equal(nextList(t, day(5), []), 0, 'nothing trained yet: the first list');
  const done = [log(0, day(1))]; // Push on the 19th
  assert.equal(nextList(t, day(2), done), 1);
  assert.equal(nextList(t, day(9), done), 1, 'a week of not training changes nothing');
  assert.equal(nextList(t, day(9), [...done, log(1, day(3)), log(2, day(4))]), 0, 'wraps round after Legs');
});

test('which list a day shows: the one chosen, else the one logged on it, else the next in turn', () => {
  const t = rotation();
  const before = [log(0, day(0))];
  assert.equal(planIndexFor(t, day(1), before), 1, 'next in turn');
  assert.equal(planIndexFor({ ...t, rotationPick: { day: day(1), index: 2 } }, day(1), before), 2, 'chosen for the day');
  assert.equal(planIndexFor({ ...t, rotationPick: { day: day(0), index: 2 } }, day(1), before), 1, 'a choice made for another day does not carry over');
  assert.equal(planIndexFor(t, day(1), [...before, log(2, day(1))]), 2, 'after logging, the day shows the list you logged');
});

test('doing a different list than the suggested one carries the rotation on from it', () => {
  const t = rotation();
  const entries = [log(0, day(0)), log(2, day(1))]; // Push, then Legs instead of Pull
  assert.equal(nextList(t, day(2), entries), 0, 'after Legs comes Push');
});

test('the days of a rotation can only be a number of times or whenever', () => {
  const a = { ...answersFromPreset('set-plan'), rotation: ['A', 'B'], schedule: { kind: 'weekdays' as const, days: [1, 3, 5] } };
  assert.equal(scheduleFromAnswers(a).kind, 'whenever');
  assert.equal(scheduleFromAnswers({ ...a, schedule: { kind: 'times', n: 3, per: 'week' } }).kind, 'times');
  assert.equal(scheduleFromAnswers({ ...a, rotation: [] }).kind, 'weekdays', 'no rotation: untouched');
});

test('editing a rotation brings its lists back, and keeps what was built in them', () => {
  const t = rotation();
  const back = answersFromTracker(t, SETTINGS, false);
  assert.deepEqual(back.rotation, ['Push', 'Pull', 'Legs']);
  const renamed = draftFromAnswers({ ...back, rotation: ['Push', 'Pull', 'Legs', 'Arms'] }, SETTINGS, t);
  const v = versionFor(renamed.plan, DAY + 365 * 86400000)!;
  assert.equal(v.days.length, 4);
  assert.equal(v.days[0].slots[0]?.name, 'Move 0', 'existing lists keep their items by position');
  assert.equal(v.days[3].slots.length, 0);
});

test('the summary says the lists are chosen each time', () => {
  const t = rotation();
  const line = summaryLines(answersFromTracker(t, SETTINGS, false), SETTINGS, true).find((l) => l.label === 'You log')?.value ?? '';
  assert.ok(line.startsWith('Choose each time (Push, Pull, Legs)'), line);
});
