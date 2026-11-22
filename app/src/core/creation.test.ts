import assert from 'node:assert/strict';
import test from 'node:test';
import { dayResult, entriesOnDay } from './derive';
import { answersFromPreset, draftFromAnswers, nameProblem, summaryLines, type Answers } from './setup';
import { TEMPLATES } from './templates';
import { unitsForLocale } from './units';
import type { Entry, GoalDef, Schedule, Settings, Tracker } from './types';

const settings: Settings = { units: 'imperial' };
const day = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
const make = (a: Answers): Tracker => ({ ...draftFromAnswers(a, settings), id: 't', systemId: null, createdAt: day(2026, 1, 1) });
const tpl = (id: string): Answers => (TEMPLATES.find((t) => t.id === id) as (typeof TEMPLATES)[number]).make();
const log = (at: number, values: Entry['values'] = {}): Entry => ({ id: String(at), trackerId: 't', at, done: true, values });

test('a tracker with no particular days still shows as done on a day you logged it, but is never owed', () => {
  const t = make(tpl('spending'));
  const d = day(2026, 11, 17);
  const none = dayResult(t, [], d);
  assert.equal(none.expected, false);
  assert.equal(none.success, false, 'nothing logged, nothing to show');
  const logged = dayResult(t, [log(d + 3600000, { amount: 5 })], d);
  assert.equal(logged.expected, false, 'still not owed, so no points or streak');
  assert.equal(logged.success, true, 'but the day shows it was used');
});

test('an avoid tracker with set days is not shown as done on days it does not ask for', () => {
  const t = make({ ...answersFromPreset('check-in'), avoid: true, schedule: { kind: 'weekdays', days: [1] } });
  const tuesday = day(2026, 11, 17);
  assert.equal(dayResult(t, [], tuesday).expected, false);
  assert.equal(dayResult(t, [], tuesday).success, false);
  void entriesOnDay;
});

test('a tracker carries its own target (what a good day is); anything beyond that happens on the Overview', () => {
  // A starting target is visible in the summary's Target row and can be changed or cleared there. Caffeine starts with a daily limit, because a limit is what people track it for; planned lifting starts with finishing most of the plan. Most presets start with none: any entry counts.
  const caffeine = draftFromAnswers(TEMPLATES.find((x) => x.id === 'caffeine')!.make(), settings);
  assert.deepEqual(caffeine.targets.map((x) => x.max), [4], 'caffeine starts at most 4 cups a day');
  for (const t of TEMPLATES.filter((x) => x.id !== 'caffeine')) {
    const d = draftFromAnswers(t.make(), settings);
    assert.equal(d.targets.length, 0, `${t.id} has no daily number target`);
    const lifting = t.id === 'gym-split' || t.id === 'full-body';
    assert.ok(lifting ? d.success.mode === 'plan' : d.success.mode === 'logged' || d.success.mode === 'clean', `${t.id} counts a day by its starting target`);
    assert.ok((d.goals ?? []).every((g) => g.id === 'sched'), `${t.id} has no goal of its own, only the one its rhythm implies`);
  }
  for (const id of ['habit', 'running', 'spending', 'gym-split']) assert.ok(!summaryLines(tpl(id), settings).some((l) => l.label === 'Goals') && summaryLines(tpl(id), settings).some((l) => l.label === 'Target'), `${id} summary has a Target row and no Goals row`);
});

test('names: empty and already used are problems, case and spaces ignored', () => {
  assert.equal(nameProblem('  ', ['Water']), 'empty');
  assert.equal(nameProblem('water ', ['Water', 'Sleep']), 'taken');
  assert.equal(nameProblem('Water 2', ['Water']), '');
  assert.equal(nameProblem('Anything', []), '');
});

test('a goal on something that was removed is dropped; one on something still recorded is kept', () => {
  const g: GoalDef = { id: 'g1', measure: 'minutes', field: 'minutes', agg: 'sum', how: 'week', cmp: 'min', value: 60, from: '2026-01-01' };
  const base = tpl('running');
  const kept = draftFromAnswers({ ...base, startGoals: [g] }, settings);
  assert.ok((kept.goals ?? []).some((x) => x.id === 'g1'));
  const noMinutes = draftFromAnswers({ ...base, chips: ['distance'], custom: [], startGoals: [g] }, settings);
  assert.ok(!(noMinutes.goals ?? []).some((x) => x.id === 'g1'));
  const days: GoalDef = { id: 'g2', measure: 'days', agg: 'days', how: 'week', cmp: 'min', value: 2, from: '2026-01-01' };
  assert.ok((draftFromAnswers({ ...base, startGoals: [days] }, settings).goals ?? []).some((x) => x.id === 'g2'), 'days-logged goals never depend on a field');
});

test('units default from the region', () => {
  assert.equal(unitsForLocale('en-US'), 'imperial');
  assert.equal(unitsForLocale('en_US'), 'imperial');
  assert.equal(unitsForLocale('en-GB'), 'metric');
  assert.equal(unitsForLocale('de-DE'), 'metric');
  assert.equal(unitsForLocale('en-AU'), 'metric');
assert.equal(unitsForLocale('en-CA'), 'imperial', 'Canada: pounds at the gym and on the scale');  assert.equal(unitsForLocale('fr-CA'), 'imperial');
  assert.equal(unitsForLocale('en'), 'imperial', 'no region to go on');
  assert.equal(unitsForLocale(undefined), 'imperial');
});

test('starting points have the rhythm their description promises', () => {
  const sched = (id: string) => make(tpl(id)).schedule;
  assert.deepEqual(sched('language'), { kind: 'daily' }, 'a short daily routine');
  assert.deepEqual(sched('plants'), { kind: 'weekdays', days: [0, 3] }, 'watered twice a week, not every day');
  assert.deepEqual(sched('chores'), { kind: 'daily' });
  assert.deepEqual(sched('meals'), { kind: 'daily' });
});

test('the thing you enter most is first in the logging form', () => {
  const first = (id: string, n = 1) => make(tpl(id)).fields.slice(0, n).map((f) => f.name);
  assert.deepEqual(first('spending', 3), ['Amount', 'Category', 'Note']);
  assert.deepEqual(first('symptoms', 3), ['Symptoms', 'Severity', 'Note']);
  assert.deepEqual(first('study', 2), ['Subject', 'Time']);
});

test('the starting points added for coverage have sensible rhythms and name their entries', () => {
  const t = (id: string) => make(tpl(id));
  assert.deepEqual(t('bills').schedule, { kind: 'monthly', day: 1 });
  assert.deepEqual(t('balance').schedule, { kind: 'weekdays', days: [0] });
  assert.deepEqual(t('workout-log').schedule, { kind: 'times', n: 3, per: 'week' });
  assert.deepEqual(t('food-log').schedule, { kind: 'daily' });
  for (const id of ['time-log', 'blood-pressure', 'blood-sugar', 'cycle']) assert.deepEqual(t(id).schedule, { kind: 'whenever' }, id);
  for (const id of ['food-log', 'workout-log', 'time-log']) assert.equal(t(id).fields[0].label, true, `${id} names each entry`);
  assert.equal(t('balance').fields[0].reading, true, 'the latest balance, not a sum');
});

test('every starting point reads on one line in the list', () => {
  for (const t of TEMPLATES) assert.ok(t.blurb.length <= 44, `${t.name}: ${t.blurb.length} characters`);
});

test('the summary rows say what it shows, which tools are on and which options are set', () => {
  const row = (a: Answers, label: string) => summaryLines(a, settings).find((l) => l.label === label || (label === 'Options' && l.step === 'options'));
  const gym = tpl('gym-split');
  assert.equal(row(gym, 'It shows')?.step, 'shows');
  assert.equal(row(gym, 'Tools')?.step, 'tools');
  assert.equal(row(gym, 'Options')?.step, 'options');
  assert.equal(row({ ...gym, system: false, extras: { previous: true, lockPast: false, average: false } }, 'It shows')?.value, 'Previous numbers');
  assert.equal(row({ ...gym, system: false, extras: { previous: false, lockPast: false, average: false }, combos: [] }, 'It shows')?.value, 'Nothing extra');
  assert.equal(row({ ...gym, system: true, extras: { previous: true, lockPast: true, average: false } }, 'Options')?.value, 'Locked, lb');
  assert.equal(row({ ...tpl('plants'), system: false, extras: { previous: false, lockPast: false, average: false } }, 'Options')?.value, 'Editable');
  assert.equal(row(tpl('plants'), 'It shows'), undefined, 'a check-in has nothing to show, so there is no row');
  assert.equal(row({ ...gym, extras: { ...gym.extras, countdown: true } }, 'Tools')?.value, 'Countdown');
  const weigh = tpl('weigh-in');
  assert.ok(row({ ...weigh, system: false, extras: { previous: true, lockPast: false, average: true } }, 'It shows')?.value.includes('3-day average'));
});
