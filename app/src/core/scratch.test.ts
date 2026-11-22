import assert from 'node:assert/strict';
import test from 'node:test';
import { answersFromPreset, draftFromAnswers, newGoal, type Answers } from './setup';
import { TEMPLATES } from './templates';

// Starting points are only configuration. Anything one does, a person can build from scratch with the same
// general options, and the result is the same tracker structure. These tests compare the structure only
// (what is recorded, how it counts, the goal, the wording), not the name, icon or sample content.

const settings = { units: 'imperial' as const };
const scratch = (patch: Partial<Answers>): Answers => ({ ...answersFromPreset('blank'), name: 'Mine', ...patch });
const fromTemplate = (id: string) => draftFromAnswers(TEMPLATES.find((t) => t.id === id)!.make(), settings);

function structure(d: ReturnType<typeof draftFromAnswers>) {
  return JSON.parse(JSON.stringify({
    input: d.input, fields: d.fields, measures: d.measures, primaryMeasure: d.primaryMeasure, targets: d.targets, success: d.success,
    derived: d.derived, tools: d.tools, daily: d.daily, avoid: d.avoid, planStyle: d.planStyle, terms: d.terms,
  }));
}
const same = (id: string, patch: Partial<Answers>) => assert.deepEqual(structure(draftFromAnswers(scratch(patch), settings)), structure(fromTemplate(id)), id);

test('a gym plan from scratch matches the gym template', () => {
  same('gym-split', {
    record: 'numbers', chips: ['weight', 'reps'], log: 'plan', planStyle: 'sets', schedule: { kind: 'weekdays', days: [1, 3, 5] }, finishPlan: true, // the target is the person's own choice on the Target screen
    terms: { item: 'Exercise', row: 'Set', target: 'Range' }, // rewording is the person's own choice in the plan editor
    extras: { previous: true, lockPast: false, average: false, countdown: true }, // the countdown is a switch any tracker can turn on
  });
});

test('a meal plan from scratch matches the meals template', () => {
  same('meals', {
    record: 'numbers', chips: ['protein', 'kcal'], log: 'plan', planStyle: 'items', samePlan: true,
    extras: { previous: false, lockPast: false, average: false },
  });
});

test('a daily weigh-in, a mood rating and a sleep log from scratch match their templates', () => {
  same('weigh-in', { record: 'numbers', chips: ['weight'], log: 'free', daily: true, extras: { previous: true, lockPast: false, average: true } });
  same('mood', { record: 'numbers', log: 'free', daily: true, custom: [{ id: 'mood', name: 'Mood', type: 'rating', max: 5 }, { id: 'activities', name: 'What was going on', type: 'choice', multi: true, options: [] }, { id: 'note', name: 'Note', type: 'text', default: '', optional: true }], extras: { previous: true, lockPast: false, average: true } });
  same('sleep', {
    record: 'numbers', log: 'free', daily: true, extras: { previous: true, lockPast: false, average: false, timer: true, timerInto: 'slept' },
    custom: [{ id: 'slept', name: 'Hours slept', type: 'duration', unit: 'min', default: 450 }, { id: 'quality', name: 'Quality', type: 'rating', max: 5 }],
  });
});

test('counters, check-ins, avoiding and timed logs from scratch match theirs', () => {
  same('water', { record: 'count', countUnit: 'glasses' });
  same('quit-smoking', { record: 'done', avoid: true });
});

test('nothing is keyed to a starting point: the same fields behave the same everywhere', () => {
  // Two fields called weight and reps no longer create a volume or a top weight on their own.
  const plain = draftFromAnswers(scratch({ record: 'numbers', chips: ['weight', 'reps'], log: 'plan', planStyle: 'sets' }), settings);
  assert.deepEqual(plain.measures.map((m) => m.id), ['sets', 'weight', 'reps']);
  // A combined number is something you add on purpose, and it can be called anything.
  const combo = draftFromAnswers(scratch({ record: 'numbers', chips: ['weight', 'reps'], log: 'plan', planStyle: 'sets', combos: [{ id: 'lifted', name: 'Total lifted', a: 'weight', b: 'reps' }] }), settings);
  assert.equal(combo.primaryMeasure, 'lifted');
  assert.equal(combo.measures.find((m) => m.id === 'lifted')?.calc.op, 'sumProduct');
  // A custom number can be a reading or add up, the same choice weight gets.
  const reading = draftFromAnswers(scratch({ record: 'numbers', log: 'free', custom: [{ id: 'bp', name: 'Systolic', type: 'number', step: 1, default: 120, reading: true }] }), settings);
  assert.equal(reading.measures[0].calc.op, 'latest');
  const adds = draftFromAnswers(scratch({ record: 'numbers', log: 'free', custom: [{ id: 'pages', name: 'Pages', type: 'number', step: 1, default: 10 }] }), settings);
  assert.equal(adds.measures[0].calc.op, 'sum');
});
