import assert from 'node:assert/strict';
import { test } from 'node:test';
import { versionFor } from './plan';
import { answersFromPreset, answersFromTracker, draftFromAnswers, previewText, stepsFor, planWords, summaryLines } from './setup';
import type { Settings, Tracker } from './types';

const imperial: Settings = { units: 'imperial' };

function asTracker(d: ReturnType<typeof draftFromAnswers>): Tracker {
  return { ...d, id: 't', systemId: null, createdAt: 0 };
}

test('a counter builds a tap tracker, and sets no goal of its own', () => {
  const a = answersFromPreset('counter');
  assert.deepEqual(stepsFor(a, false), ['start', 'summary']);
  const d = draftFromAnswers(a, imperial);
  assert.equal(d.input, 'tap');
  assert.equal(d.targets.length, 0);
  assert.equal(d.success.mode, 'logged');
});

test('building your own is three screens, with the goal one tap away on the summary', () => {
  assert.deepEqual(stepsFor(answersFromPreset('check-in'), false), ['start', 'summary']);
});

test('training builds a plan tracker on the chosen days with weight and reps', () => {
  const a = { ...answersFromPreset('set-plan'), planMode: 'asigo' as const };
  assert.deepEqual(stepsFor({ ...a, templateId: 'gym-split' }, false), ['start', 'summary']);
  assert.deepEqual(stepsFor({ ...answersFromPreset('blank'), record: 'numbers', log: 'plan' }, false), ['start', 'summary']);
  assert.deepEqual(stepsFor(a, true), ['summary']);
  const d = draftFromAnswers(a, imperial);
  assert.equal(d.input, 'plan');
  assert.deepEqual(d.fields.map((f) => f.id), ['weight', 'reps']);
  assert.deepEqual(d.measures.map((m) => m.id), ['sets', 'weight', 'reps']);
  assert.equal(d.success.mode, 'logged'); // no goal by default
  const withPlan = draftFromAnswers({ ...a, finishPlan: true }, imperial);
  assert.equal(withPlan.success.mode, 'plan');
  const days = d.plan[0].days;
  assert.ok(days.every((x) => !('rest' in x)), 'no day carries a rest flag');
  assert.equal(days[1].slots.length, 0); // built as you go: nothing planned yet
});

test('changing the days keeps the slots already built', () => {
  const a = answersFromPreset('set-plan');
  const t = asTracker(draftFromAnswers(a, imperial));
  const mon = versionFor(t.plan, Date.now())!.days;
  mon[1].slots = [{ id: 'x', name: 'Squat', sets: 3 }];
  const edited = { ...answersFromTracker(t, imperial, false), schedule: { kind: 'weekdays' as const, days: [2, 4] } };
  const d2 = draftFromAnswers(edited, imperial, t);
  const days = versionFor(d2.plan, Date.now())!.days;
  assert.equal(days[1].slots.length, 1); // plan kept, even though Monday is no longer a scheduled day
  assert.ok(days.every((x) => !('rest' in x)));
});

test('example plans fill the chosen days', () => {
  const d = draftFromAnswers({ ...answersFromPreset('checklist-totals'), planMode: 'example' }, imperial);
  assert.equal(d.input, 'plan');
  assert.ok(d.plan[0].days.every((day) => day.slots.length > 0));
});

test('measurement gets a rolling average only when asked', () => {
  const a = answersFromPreset('measurement');
  assert.equal(draftFromAnswers(a, imperial).derived.length, 1);
  assert.equal(draftFromAnswers({ ...a, extras: { ...a.extras, average: false } }, imperial).derived.length, 0);
});

test('editing reopens the same answers, goals set elsewhere included', async () => {
  const { newGoal } = await import('./setup');
  const a = { ...answersFromPreset('time-blocks'), goal: 'number' as const, goals: [newGoal('minutes', 'min', 60)] };
  const t = asTracker(draftFromAnswers(a, imperial));
  const back = answersFromTracker(t, imperial, false);
  assert.equal(back.record, 'numbers');
  assert.deepEqual(back.custom.map((f) => f.id), ['minutes', 'note']); // held as the fields themselves, in the order the form shows them
  assert.equal(back.goal, 'number');
  assert.equal(back.goals[0].value, 60);
});

test('descriptions read as plain language', () => {
  const a = answersFromPreset('set-plan');
  assert.match(previewText(a, imperial), /weight · reps · plan Mon Wed Fri/);
  assert.ok(planWords(a).includes('A list per weekday'));
});

test('a range goal and a show-up goal together need both to count as a good day', async () => {
  const { newGoal } = await import('./setup');
  const { trackerSuccess } = await import('./measures');
  const a = { ...answersFromPreset('measurement'), name: 'Weight', record: 'numbers' as const, chips: ['weight'], log: 'free' as const };
  a.goal = 'number';
  a.goals = [newGoal('weight', 'range', 78, 82), newGoal('count', 'min', 1)];
  const d = draftFromAnswers(a, { units: 'metric' });
  assert.equal(d.success.mode, 'targets');
  assert.equal(d.targets.length, 2);
  const t = { ...d, id: 'x', createdAt: 0, systemId: null } as never;
  // weight is stored in kg: 80 inside 78..82, one entry logged
  assert.equal(trackerSuccess(t, { done: 1, count: 1, weight: 80 }), true);
  assert.equal(trackerSuccess(t, { done: 1, count: 1, weight: 90 }), false);
  assert.equal(trackerSuccess(t, { done: 0, count: 0, weight: 0 }), false);
});

test('a plan starts on every day by default', () => {
  assert.equal(answersFromPreset('set-plan').planMode, 'asigo'); // empty by default: you enter your own, an example is opt-in
  assert.deepEqual(answersFromPreset('blank').schedule, { kind: 'daily' });
});

test('finishing the plan and a number goal both have to hold', async () => {
  const { newGoal } = await import('./setup');
  const { trackerSuccess } = await import('./measures');
  const a = { ...answersFromPreset('set-plan'), finishPlan: true, goal: 'number' as const, goals: [newGoal('sets', 'min', 3)] };
  const d = draftFromAnswers(a, imperial);
  assert.equal(d.success.mode, 'targets');
  const t = asTracker(d);
  assert.equal(trackerSuccess(t, { done: 1, sets: 4, completion: 90 }), true);
  assert.equal(trackerSuccess(t, { done: 1, sets: 4, completion: 50 }), false);
  assert.equal(trackerSuccess(t, { done: 1, sets: 1, completion: 90 }), false);
});

test('same-every-day copies one list to every training day, different keeps them apart', async () => {
  const { syncSame } = await import('./plan');
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ label: '', slots: i === 1 ? [{ id: 'a', name: 'Squat', sets: 3 }] : [] }));
  syncSame(days, 1, [1, 2, 3, 4, 5, 6]);
  assert.equal(days[3].slots[0].name, 'Squat');
  assert.equal(days[0].slots.length, 0); // a day outside the schedule is untouched
  days[3].slots[0].name = 'changed';
  assert.equal(days[1].slots[0].name, 'Squat'); // copies, not shared references

  const a = { ...answersFromPreset('checklist-totals'), samePlan: true };
  const d = draftFromAnswers(a, imperial);
  const v = d.plan[d.plan.length - 1];
  assert.equal(v.same, true);
  assert.deepEqual(v.days[1].slots.map((x) => x.name), v.days[4].slots.map((x) => x.name));
  const b = { ...answersFromPreset('set-plan'), planMode: 'example' as const, samePlan: false };
  const d2 = draftFromAnswers(b, imperial);
  const ids = new Set(d2.plan[0].days.flatMap((x) => x.slots.map((y) => y.id)));
  assert.ok(ids.size > 3, 'different days keep their own rows');
});
