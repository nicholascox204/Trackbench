import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey, DAYS_MEASURE, describeGoal, goalEvents, goalProgress, periodOf } from './goals';
import { defaultConfig, evaluate } from './engine';
import { draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import { startOfDay } from './time';
import type { Entry, GoalDef, Tracker } from './types';

const settings = { units: 'metric' as const };
const make = (id: string): Tracker => ({ ...draftFromAnswers(TEMPLATES.find((t) => t.id === id)!.make(), settings), id: 't', systemId: 's', createdAt: 0 });
const day = (m: number, d: number): number => startOfDay(new Date(2026, m - 1, d).getTime());
const entry = (at: number, values: Entry['values'] = {}): Entry => ({ id: `e${at}`, trackerId: 't', at: at + 3600000, done: true, values });
const today = day(11, 20); // a Friday

test('calendar weeks start on Monday or Sunday, months follow the calendar', () => {
  const mon = periodOf('week', today, 'mon');
  assert.equal(dayKey(mon.start), '2026-11-16');
  assert.equal(dayKey(mon.end), '2026-11-22');
  assert.equal(dayKey(periodOf('week', today, 'sun').start), '2026-11-15');
  const month = periodOf('month', today, 'mon');
  assert.equal(dayKey(month.start), '2026-11-01');
  assert.equal(dayKey(month.end), '2026-11-30');
});

test('a weekly "days" goal shows progress and turns met', () => {
  const t = make('meditate');
  const g: GoalDef = { id: 'g', measure: DAYS_MEASURE, how: 'week', cmp: 'min', value: 4, from: '2026-11-01' };
  const three = [entry(day(11, 16)), entry(day(11, 17)), entry(day(11, 19))];
  const p = goalProgress(t, g, three, today, settings, 'mon');
  assert.equal(p.value, 3);
  assert.equal(p.fraction, 0.75);
  assert.equal(p.status, 'active');
  assert.match(p.detail, /1 to go/);
  assert.match(describeGoal(t, g, settings), /At least 4 days a week/);
  const four = goalProgress(t, g, [...three, entry(day(11, 20))], today, settings, 'mon');
  assert.equal(four.status, 'met');
  assert.equal(four.fraction, 1);
});

test('a reach goal moves from where you started toward the target', () => {
  const t = make('weigh-in');
  const g: GoalDef = { id: 'g', measure: 'weight', how: 'latest', cmp: 'reach', value: 80, start: 90, from: '2026-11-01', until: '2026-12-31' };
  const half = goalProgress(t, g, [entry(day(11, 2), { weight: 90 }), entry(day(11, 15), { weight: 85 })], today, settings, 'mon');
  assert.equal(half.fraction, 0.5);
  assert.equal(half.status, 'active');
  assert.match(half.detail, /to go/);
  assert.equal(typeof half.onTrack, 'boolean');
  const done = goalProgress(t, g, [entry(day(11, 15), { weight: 79 })], today, settings, 'mon');
  assert.equal(done.status, 'met');
  assert.equal(done.fraction, 1);
  const late = goalProgress(t, g, [entry(day(11, 15), { weight: 88 })], startOfDay(new Date(2027, 0, 5).getTime()), settings, 'mon');
  assert.equal(late.status, 'missed');
});

test('a limit goal turns over when you pass it', () => {
  const t = make('spending');
  const g: GoalDef = { id: 'g', measure: 'amount', how: 'month', cmp: 'max', value: 100, from: '2026-11-01' };
  const ok = goalProgress(t, g, [entry(day(11, 3), { amount: 40 })], today, settings, 'mon');
  assert.equal(ok.status, 'active');
  assert.equal(ok.fraction, 0.4);
  const over = goalProgress(t, g, [entry(day(11, 3), { amount: 90 }), entry(day(11, 9), { amount: 30 })], today, settings, 'mon');
  assert.equal(over.status, 'over');
  assert.match(over.detail, /over/);
});

test('finished weeks become events, the first partial week is skipped, and events earn points', () => {
  const t = make('meditate');
  const g: GoalDef = { id: 'g', measure: DAYS_MEASURE, how: 'week', cmp: 'min', value: 2, from: '2026-10-26' };
  const tr: Tracker = { ...t, goals: [g] };
  const entries = [entry(day(10, 27)), entry(day(10, 29)), entry(day(11, 3)), entry(day(11, 10)), entry(day(11, 12))];
  const ev = goalEvents([tr], entries, today, settings, 'mon');
  assert.deepEqual(ev.map((e) => e.success), [true, false, true]);
  assert.equal(dayKey(ev[0].day), '2026-11-01');

  const midweek: Tracker = { ...t, goals: [{ ...g, from: '2026-10-28' }] }; // started mid-week: that week is not judged
  assert.equal(goalEvents([midweek], entries, today, settings, 'mon').length, 2);

  const cfg = defaultConfig();
  const result = evaluate(cfg, [tr], [{ day: ev[0].day, closed: true, results: { t: { expected: false, success: false, measures: {} } } }], ev);
  assert.ok(result.ledger.some((l) => l.reason.startsWith('Goal met')));
  assert.equal(result.earned, Math.round(cfg.points.reward * 3));
});

test('a one-time goal rewards once, on the day it is reached', () => {
  const t = make('weigh-in');
  const g: GoalDef = { id: 'g', measure: 'weight', how: 'latest', cmp: 'reach', value: 80, start: 90, from: '2026-11-01' };
  const tr: Tracker = { ...t, goals: [g] };
  const ev = goalEvents([tr], [entry(day(11, 5), { weight: 88 }), entry(day(11, 12), { weight: 79 }), entry(day(11, 14), { weight: 78 })], today, settings, 'mon');
  assert.equal(ev.length, 1);
  assert.equal(dayKey(ev[0].day), '2026-11-12');
  assert.equal(ev[0].success, true);
});

test('goals count what you record: a field combined by total, highest, average or latest', () => {
  const gym = make('gym-split');
  const hi: GoalDef = { id: 'g', measure: 'weight', field: 'weight', agg: 'max', how: 'total', cmp: 'min', value: 100, from: '2026-11-01' };
  const sets = [entry(day(11, 3), { weight: 80, reps: 8 }), entry(day(11, 5), { weight: 95, reps: 5 }), entry(day(11, 9), { weight: 90, reps: 6 })];
  const p = goalProgress(gym, hi, sets, today, settings, 'mon');
  assert.equal(p.value, 95); // the highest weight, with no special "top weight" measure involved
  assert.equal(p.fraction, 0.95);
  assert.match(describeGoal(gym, hi, settings), /Highest weight at least 100/);
  const beat = goalProgress(gym, hi, [...sets, entry(day(11, 12), { weight: 102 })], today, settings, 'mon');
  assert.equal(beat.status, 'met');

  const run = make('running');
  const km: GoalDef = { id: 'g', measure: 'distance', field: 'distance', agg: 'sum', how: 'month', cmp: 'min', value: 20, from: '2026-11-01' };
  const runs = [entry(day(11, 2), { distance: 5, minutes: 30 }), entry(day(11, 9), { distance: 8, minutes: 50 }), entry(day(10, 28), { distance: 40 })];
  const rp = goalProgress(run, km, runs, today, settings, 'mon');
  assert.equal(rp.value, 13); // only this month
  assert.match(describeGoal(run, km, settings), /At least 20 km a month/);

  const mood = make('mood');
  const avg: GoalDef = { id: 'g', measure: 'mood', field: 'mood', agg: 'avg', how: 'week', cmp: 'min', value: 4, from: '2026-11-01' };
  const ap = goalProgress(mood, avg, [entry(day(11, 16), { mood: 3 }), entry(day(11, 17), { mood: 5 })], today, settings, 'mon');
  assert.equal(ap.value, 4);
  assert.equal(ap.status, 'met');
  assert.match(describeGoal(mood, avg, settings), /Average mood at least 4\/5 a week/);

  const latest: GoalDef = { id: 'g', measure: 'mood', field: 'mood', agg: 'latest', how: 'total', cmp: 'reach', value: 5, start: 2, from: '2026-11-01' };
  assert.equal(goalProgress(mood, latest, [entry(day(11, 3), { mood: 2 }), entry(day(11, 9), { mood: 4 })], today, settings, 'mon').fraction, 2 / 3);
});

test('entries and days logged need no special measure either', () => {
  const water = make('water');
  const taps: GoalDef = { id: 'g', measure: 'count', agg: 'count', how: 'week', cmp: 'min', value: 10, from: '2026-11-01' };
  const p = goalProgress(water, taps, [entry(day(11, 16)), entry(day(11, 16)), entry(day(11, 18))], today, settings, 'mon');
  assert.equal(p.value, 3);
  assert.equal(goalProgress(water, { ...taps, agg: 'days', measure: DAYS_MEASURE, value: 3 }, [entry(day(11, 16)), entry(day(11, 16)), entry(day(11, 18))], today, settings, 'mon').value, 2);
});

test('the name of a repeat in a goal follows the tracker\'s own wording', () => {
  const gym = make('gym-split');
  const rows: GoalDef = { id: 'g', measure: 'count', agg: 'count', how: 'week', cmp: 'min', value: 20, from: '2026-11-01' };
  assert.match(describeGoal(gym, rows, settings), /At least 20 sets a week/);
  const lang = make('language'); // wording: Skill, Round, Goal
  assert.match(describeGoal(lang, { ...rows, value: 10 }, settings), /At least 10 rounds a week/);
  const reworded: Tracker = { ...gym, terms: { row: 'Lap' } };
  assert.match(describeGoal(reworded, rows, settings), /laps a week/);
});
