import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKeyOf } from './plan';
import { answersFromPreset, answersFromTracker, draftFromAnswers, type Answers } from './setup';
import { daysBetween, isDueOn, lastDayOfMonth, normalizeSchedule, scheduleOf, scheduleText, startingSchedule, weekdaysOf } from './schedule';
import { expectedOn } from './measures';
import { TEMPLATES } from './templates';
import type { Schedule, Settings, Tracker } from './types';

const SETTINGS: Settings = { units: 'imperial' };
const day = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
const make = (a: Answers, createdAt = day(2026, 1, 1)): Tracker => ({ ...draftFromAnswers(a, SETTINGS), id: 't', systemId: null, createdAt });
const tpl = (id: string): Answers => (TEMPLATES.find((t) => t.id === id) as (typeof TEMPLATES)[number]).make();

test('every day, certain weekdays', () => {
  const mwf: Schedule = { kind: 'weekdays', days: [1, 3, 5] };
  assert.ok(isDueOn({ kind: 'daily' }, day(2026, 11, 17)));
  assert.ok(isDueOn(mwf, day(2026, 11, 16))); // Monday
  assert.ok(!isDueOn(mwf, day(2026, 11, 17))); // Tuesday
  assert.ok(isDueOn(mwf, day(2026, 11, 18))); // Wednesday
});

test('every few days counts from its start date and never before it', () => {
  const s: Schedule = { kind: 'interval', n: 2, from: '2026-11-10' };
  assert.ok(!isDueOn(s, day(2026, 11, 8)));
  assert.ok(isDueOn(s, day(2026, 11, 10)));
  assert.ok(!isDueOn(s, day(2026, 11, 11)));
  assert.ok(isDueOn(s, day(2026, 11, 12)));
  assert.ok(isDueOn(s, day(2026, 12, 2))); // across a month end
  assert.equal(daysBetween(day(2026, 10, 25), day(2026, 11, 2)), 8); // a clock change in between must not shift the count
});

test('once a month: a date, the last day, and a date that does not exist that month', () => {
  const fifteenth: Schedule = { kind: 'monthly', day: 15 };
  const last: Schedule = { kind: 'monthly', day: 'last' };
  const thirty1: Schedule = { kind: 'monthly', day: 31 };
  assert.ok(isDueOn(fifteenth, day(2026, 11, 15)) && !isDueOn(fifteenth, day(2026, 11, 14)));
  assert.ok(isDueOn(last, day(2026, 11, 30)) && !isDueOn(last, day(2026, 11, 29)));
  assert.ok(isDueOn(last, day(2028, 2, 29)) && isDueOn(last, day(2027, 2, 28))); // leap year and not
  assert.ok(isDueOn(thirty1, day(2026, 11, 30)) && !isDueOn(thirty1, day(2026, 11, 29))); // the 31st means the last day
  assert.ok(isDueOn(thirty1, day(2026, 12, 31)));
  assert.equal(lastDayOfMonth(day(2026, 2, 10)), 28);
});

test('times a week and whenever have no particular due day', () => {
  assert.ok(!isDueOn({ kind: 'times', n: 3, per: 'week' }, day(2026, 11, 17)));
  assert.ok(!isDueOn({ kind: 'whenever' }, day(2026, 11, 17)));
});

test('schedules read as plain sentences', () => {
  const t = (s: Schedule, w?: { from?: string; until?: string }) => scheduleText(s, w);
  assert.equal(t({ kind: 'daily' }), 'Every day');
  assert.equal(t({ kind: 'weekdays', days: [5, 1, 3] }), 'Mon, Wed, Fri');
  assert.equal(t({ kind: 'weekdays', days: [1, 2, 3, 4, 5] }), 'Weekdays');
  assert.equal(t({ kind: 'weekdays', days: [6, 0] }), 'Weekends');
  assert.equal(t({ kind: 'weekdays', days: [2] }), 'Every Tuesday');
  assert.equal(t({ kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] }), 'Every day');
  assert.equal(t({ kind: 'interval', n: 2, from: '2026-11-10' }), 'Every other day');
  assert.equal(t({ kind: 'interval', n: 3, from: '2026-11-10' }), 'Every 3 days');
  assert.equal(t({ kind: 'times', n: 3, per: 'week' }), '3 times a week');
  assert.equal(t({ kind: 'times', n: 1, per: 'month' }), 'Once a month');
  assert.equal(t({ kind: 'monthly', day: 'last' }), 'Last day of each month');
  assert.equal(t({ kind: 'monthly', day: 22 }), 'On the 22nd of each month');
  assert.equal(t({ kind: 'monthly', day: 11 }), 'On the 11th of each month');
  assert.equal(t({ kind: 'whenever' }), 'Whenever it happens');
  assert.equal(t({ kind: 'daily' }, { from: '2026-11-18', until: '2026-11-24' }), 'Every day, 18 Nov to 24 Nov');
  assert.equal(t({ kind: 'daily' }, { until: '2026-11-24' }), 'Every day, until 24 Nov');
});

test('a tracker is expected only on days its schedule asks for, inside its window', () => {
  const a = { ...answersFromPreset('check-in'), schedule: { kind: 'interval', n: 2, from: '2026-11-10' } as Schedule };
  const t = make(a);
  assert.ok(expectedOn(t, day(2026, 11, 12)));
  assert.ok(!expectedOn(t, day(2026, 11, 13)));
  const windowed = make({ ...answersFromPreset('check-in'), window: { from: '2026-11-16', until: '2026-11-22' } });
  assert.ok(!expectedOn(windowed, day(2026, 11, 15)));
  assert.ok(expectedOn(windowed, day(2026, 11, 19)));
  assert.ok(!expectedOn(windowed, day(2026, 11, 23)));
  const whenever = make({ ...answersFromPreset('time-blocks'), schedule: { kind: 'whenever' } });
  assert.ok(!expectedOn(whenever, day(2026, 11, 17))); // never waiting on you
});

test('a tracker saved before schedules existed keeps behaving: plans train their weekdays, the rest are daily', () => {
  const gym = make(tpl('gym-split'));
  const { schedule: _drop, ...legacy } = gym;
  void _drop;
  const old = { ...legacy, plan: gym.plan.map((v) => ({ ...v, days: v.days.map((d, i) => ([1, 3, 5].includes(i) ? { ...d, slots: [{ id: 'x', name: 'Bench', sets: 3 }] } : d)) })) } as Tracker;
  assert.deepEqual(scheduleOf(old), { kind: 'weekdays', days: [1, 3, 5] });
  const habit = make(answersFromPreset('check-in'));
  const { schedule: _d2, ...legacyHabit } = habit;
  void _d2;
  assert.deepEqual(scheduleOf(legacyHabit as Tracker), { kind: 'daily' });
});

test('templates start with the schedule that fits them', () => {
  assert.deepEqual(make(tpl('gym-split')).schedule, { kind: 'weekdays', days: [1, 3, 5] });
  assert.deepEqual(make(tpl('full-body')).schedule, { kind: 'weekdays', days: [1, 3, 5] });
  assert.deepEqual(make(tpl('running')).schedule, { kind: 'times', n: 3, per: 'week' });
  for (const id of ['spending', 'symptoms', 'savings']) assert.deepEqual(make(tpl(id)).schedule, { kind: 'whenever' }, id);
  for (const id of ['habit', 'water', 'sleep', 'mood', 'weigh-in', 'meditate', 'steps', 'reading', 'study', 'chores', 'pet-care', 'meals']) {
    assert.deepEqual(make(tpl(id)).schedule, { kind: 'daily' }, id);
  }
});

test('a plan chosen on every day is stored as every day, and its weekdays come from one place', () => {
  const a = tpl('gym-split');
  assert.deepEqual(make({ ...a, schedule: { kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] } }).schedule, { kind: 'daily' });
  assert.deepEqual(make({ ...a, schedule: { kind: 'weekdays', days: [5, 2] } }).schedule, { kind: 'weekdays', days: [2, 5] });
});

test('times a week becomes one weekly goal, not duplicated or lost on edit', () => {
  const t = make(tpl('running'));
  const sched = (t.goals ?? []).filter((g) => g.id === 'sched');
  assert.equal(sched.length, 1);
  assert.equal(sched[0].how, 'week');
  assert.equal(sched[0].value, 3);
  const back = answersFromTracker(t, SETTINGS, false);
  assert.deepEqual(back.schedule, { kind: 'times', n: 3, per: 'week' });
  // editing to 4 a month replaces it; an unrelated goal the person added is kept
  const withOther: Tracker = { ...t, goals: [...(t.goals ?? []), { id: 'mine', measure: 'days', agg: 'days', how: 'week', cmp: 'min', value: 1, from: dayKeyOf(Date.now()) }] };
  const edited = draftFromAnswers({ ...back, schedule: { kind: 'times', n: 4, per: 'month' } }, SETTINGS, withOther);
  assert.equal((edited.goals ?? []).filter((g) => g.id === 'sched').length, 1);
  assert.equal((edited.goals ?? []).find((g) => g.id === 'sched')?.how, 'month');
  assert.ok((edited.goals ?? []).some((g) => g.id === 'mine'));
  // switching away from times removes the goal
  const away = draftFromAnswers({ ...back, schedule: { kind: 'daily' } }, SETTINGS, withOther);
  assert.ok(!(away.goals ?? []).some((g) => g.id === 'sched'));
});

test('the window survives editing', () => {
  const t = make({ ...answersFromPreset('check-in'), window: { from: '2026-11-16', until: '2026-11-22' } });
  assert.deepEqual(answersFromTracker(t, SETTINGS, false).window, { from: '2026-11-16', until: '2026-11-22' });
});

test('the days are chosen in one place: the schedule decides the plan\'s training days', () => {
  const a = tpl('gym-split');
  assert.ok(!('days' in a), 'setup answers no longer carry a second list of days');
  const t = make({ ...a, schedule: { kind: 'weekdays', days: [2, 5] } });
  const live = t.plan[t.plan.length - 1].days;
  assert.ok(live.every((d) => d.label !== 'Rest' && !('rest' in d)), 'unchosen days carry no rest flag or label');
  assert.deepEqual(t.schedule, { kind: 'weekdays', days: [2, 5] });
});

test('switching kind starts from a sensible setting and weekdays are tidied', () => {
  const today = '2026-11-17';
  assert.deepEqual(startingSchedule('weekdays', { kind: 'daily' }, today), { kind: 'daily' }); // all seven days stays all seven
  assert.deepEqual(startingSchedule('weekdays', { kind: 'monthly', day: 1 }, today), { kind: 'weekdays', days: [1, 3, 5] });
  assert.deepEqual(startingSchedule('weekdays', { kind: 'weekdays', days: [2] }, today), { kind: 'weekdays', days: [2] }); // keeps what was chosen
  assert.deepEqual(startingSchedule('interval', { kind: 'daily' }, today), { kind: 'interval', n: 2, from: today });
  assert.deepEqual(startingSchedule('times', { kind: 'daily' }, today), { kind: 'times', n: 3, per: 'week' });
  assert.deepEqual(startingSchedule('monthly', { kind: 'daily' }, today), { kind: 'monthly', day: 1 });
  assert.deepEqual(normalizeSchedule({ kind: 'weekdays', days: [5, 1, 1, 3] }), { kind: 'weekdays', days: [1, 3, 5] });
  assert.deepEqual(normalizeSchedule({ kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] }), { kind: 'daily' });
  assert.deepEqual(weekdaysOf({ kind: 'daily' }), [0, 1, 2, 3, 4, 5, 6]);
});

test('editing a planned tracker shows the names its days already have', () => {
  const a = { ...tpl('gym-split'), planMode: 'example' as const, schedule: { kind: 'weekdays', days: [1, 3, 5] } as Schedule };
  const t = make(a);
  const back = answersFromTracker(t, SETTINGS, false);
  assert.deepEqual([back.dayNames[1], back.dayNames[3], back.dayNames[5]], ['Push', 'Pull', 'Legs']);
  assert.equal(back.dayNames[0], undefined);
});

test('a plan with one shared list can run on any rhythm, not just set weekdays', () => {
  const base = { ...tpl('full-body'), planMode: 'example' as const, samePlan: true };
  const monthly = make({ ...base, schedule: { kind: 'monthly', day: 'last' } });
  assert.ok(expectedOn(monthly, day(2026, 11, 30)), 'due on the last day, with the list');
  assert.ok(!expectedOn(monthly, day(2026, 11, 16)));
  const everyOther = make({ ...base, schedule: { kind: 'interval', n: 2, from: '2026-11-10' } });
  assert.ok(expectedOn(everyOther, day(2026, 11, 12)) && !expectedOn(everyOther, day(2026, 11, 13)));
  // every day of the plan carries the shared list, so whichever day it lands on the list is there
  const live = monthly.plan[monthly.plan.length - 1].days;
  assert.ok(live.every((d) => d.slots.length > 0));
});
