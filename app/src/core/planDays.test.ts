// The days chosen in setup decide which days a plan runs, whatever lists sit on which weekday: a list on a day that is not chosen is only
// there if you open that day, and a chosen day with nothing on it is still a day. (Trackers saved before schedules existed took their days from the lists.)
import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedOn } from './measures';
import { isDueOn, listDays, scheduleOf } from './schedule';
import { viewVersion } from './plan';
import { answersFromPreset, draftFromAnswers } from './setup';
import type { PlanDay, PlanVersion, Schedule, Settings, Slot, Tracker } from './types';

const SETTINGS: Settings = { units: 'imperial' };
const day = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
const MON = day(2026, 11, 16), TUE = day(2026, 11, 17), WED = day(2026, 11, 18), THU = day(2026, 11, 19), FRI = day(2026, 11, 20), SUN = day(2026, 11, 22);
const slot = (id: string): Slot => ({ id, name: id, sets: 3 });

// lists: weekday number (0 = Sunday) to the names on that day
const plan = (lists: Record<number, string[]>, same = false, from = '2026-01-01'): PlanVersion => ({
  from,
  days: Array.from({ length: 7 }, (_, i): PlanDay => ({ label: '', slots: (lists[i] ?? []).map(slot) })),
  ...(same ? { same: true } : {}),
});
const gym = (versions: PlanVersion[], schedule: Schedule): Tracker => ({
  ...draftFromAnswers(answersFromPreset('set-plan'), SETTINGS), id: 'g', systemId: null, createdAt: day(2026, 1, 1), plan: versions, schedule,
});
const due = (t: Tracker, d: number): boolean => isDueOn(scheduleOf(t, d), d);
const MWF: Schedule = { kind: 'weekdays', days: [1, 3, 5] };

test('the chosen days are the days it runs, whatever the lists say', () => {
  const t = gym([plan({ 1: ['bench'], 3: ['squat'] })], { kind: 'weekdays', days: [2, 4] });
  assert.deepEqual([MON, TUE, WED, THU].map((d) => due(t, d)), [false, true, false, true]);
});

test('a list on a day that is not chosen does not make it a day to do it', () => {
  const t = gym([plan({ 1: ['bench'], 3: ['squat'], 5: ['row'], 4: ['curl'] })], MWF);
  assert.equal(due(t, THU), false);
  assert.equal(expectedOn(t, THU), false);
});

test('a chosen day with nothing on it is still a day', () => {
  const t = gym([plan({ 1: ['bench'], 3: [], 5: ['row'] })], MWF);
  assert.equal(due(t, WED), true);
  assert.equal(due(t, FRI), true);
});

test('with nothing on any day, the chosen days still run', () => {
  const t = gym([plan({})], MWF);
  assert.deepEqual([MON, WED, FRI, SUN].map((d) => due(t, d)), [true, true, true, false]);
});

test('a tracker saved before schedules existed takes its days from its lists', () => {
  const { schedule: _drop, ...legacy } = gym([plan({ 1: ['bench'], 3: ['squat'] })], MWF);
  void _drop;
  assert.deepEqual([MON, TUE, WED, THU].map((d) => due(legacy as Tracker, d)), [true, false, true, false]);
});

test('one list shared by every day keeps the days you chose', () => {
  const same: Record<number, string[]> = { 0: ['a'], 1: ['a'], 2: ['a'], 3: ['a'], 4: ['a'], 5: ['a'], 6: ['a'] };
  const t = gym([plan(same, true)], MWF);
  assert.deepEqual([MON, TUE, WED, THU, FRI].map((d) => due(t, d)), [true, false, true, false, true]);
});

test('a tracker with no lists keeps its day picker', () => {
  const habit: Tracker = { ...gym([], MWF), input: 'check' };
  assert.deepEqual([MON, TUE, WED].map((d) => due(habit, d)), [true, false, true]);
});

test('blocks and every-few-days are left alone', () => {
  assert.equal(scheduleOf(gym([plan({ 1: ['a'] })], { kind: 'blocks', n: 3 })).kind, 'blocks');
  assert.equal(scheduleOf(gym([plan({ 1: ['a'] })], { kind: 'interval', n: 2, from: '2026-11-16' })).kind, 'interval');
});

test('listDays names the weekdays that have something on them', () => {
  const t = gym([plan({ 1: ['a'], 4: ['b'] })], MWF);
  assert.deepEqual(listDays(t, THU), [1, 4]);
  assert.deepEqual(listDays(gym([], MWF), THU), []);
});

// Building the plan from a past day: a past day that had nothing planned is viewed through today's plan.
const TODAY = THU;
test('a past day that had nothing planned is viewed through the plan of today, so what you add there shows', () => {
  const old = plan({ 5: ['row'] }, false, '2026-01-01');
  const now = plan({ 5: ['row'], 1: ['bench'] }, false, '2026-11-19');
  const r = viewVersion([old, now], MON, TODAY, 1);
  assert.equal(r.fromToday, true);
  assert.equal(r.version, now);
});

test('a past day with nothing planned and a single plan still opens for building', () => {
  const only = plan({}, false, '2026-01-01');
  const r = viewVersion([only], MON, TODAY, 1);
  assert.equal(r.fromToday, true);
  assert.equal(r.version, only);
});

test('a past day that had a list keeps showing that list (history), and is not opened for building', () => {
  const old = plan({ 1: ['bench'] }, false, '2026-01-01');
  const now = plan({ 1: ['squat'] }, false, '2026-11-19');
  const r = viewVersion([old, now], MON, TODAY, 1);
  assert.equal(r.fromToday, false);
  assert.equal(r.version, old);
});

test('a past day viewed through a plan made today can still be built on, since edits go into that same plan', () => {
  const made = plan({ 1: ['bench'] }, false, '2026-11-19');
  const r = viewVersion([made], MON, TODAY, 1);
  assert.equal(r.fromToday, true);
  assert.equal(r.version, made);
});

test('today and later days are viewed through their own plan', () => {
  const p = plan({ 4: ['curl'] });
  assert.equal(viewVersion([p], TODAY, TODAY, 4).fromToday, false);
  assert.equal(viewVersion([p], FRI, TODAY, 5).fromToday, false);
});

test('with no plan at all there is nothing to view through', () => {
  const r = viewVersion([], MON, TODAY, 1);
  assert.equal(r.version, null);
  assert.equal(r.fromToday, true);
});
