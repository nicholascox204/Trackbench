import assert from 'node:assert/strict';
import test from 'node:test';
import { labelField, labelSuggestions } from './labels';
import { answersFromPreset, draftFromAnswers, stepsFor, summaryLines } from './setup';
import { applyMeasure } from './fieldKinds';
import type { Entry, Field, Settings } from './types';

const settings: Settings = { units: 'imperial' };
const what: Field = { id: 'what', name: 'Exercise', type: 'text', label: true };
const weight = applyMeasure({ id: 'w', name: 'Weight', type: 'number', step: 1, default: 0 }, 'weight');
const reps: Field = { id: 'r', name: 'Reps', type: 'number', step: 1, default: 8 };
const entry = (at: number, name: string, tracker = 't'): Entry => ({ id: `${at}${name}`, trackerId: tracker, at, done: true, values: { what: name, w: 20, r: 8 } });

test('past names come back most used first, once each, with the latest spelling', () => {
  const es = [entry(1, 'bench press'), entry(2, 'Squat'), entry(3, 'Bench Press'), entry(4, 'Row'), entry(5, 'Squat'), entry(6, 'Bench Press')];
  assert.deepEqual(labelSuggestions(es, 't', 'what'), ['Bench Press', 'Squat', 'Row']);
});

test('suggestions come only from this tracker, only from logged entries, and are capped', () => {
  const es = [entry(1, 'Other', 'x'), { ...entry(2, 'Skipped'), done: false }, ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n, i) => entry(10 + i, n))];
  const out = labelSuggestions(es, 't', 'what');
  assert.equal(out.length, 6);
  assert.ok(!out.includes('Other') && !out.includes('Skipped'));
  assert.deepEqual(labelSuggestions([], 't', 'what'), []);
});

test('a named-entry tracker keeps the name first and out of the numbers', () => {
  const a = { ...answersFromPreset('blank'), record: 'numbers' as const, log: 'free' as const, custom: [what, weight, reps] };
  const d = draftFromAnswers(a, settings);
  assert.deepEqual(d.fields.map((f) => f.id), ['what', 'w', 'r']);
  assert.equal(labelField(d)?.id, 'what');
  assert.ok(!d.measures.some((m) => m.id === 'what'), 'a name is not a number to add up');
  assert.deepEqual(d.measures.map((m) => m.id).sort(), ['r', 'w']);
});

test('setup has one You log line that says how it is logged and what is written down', () => {
  const base = { ...answersFromPreset('blank'), record: 'numbers' as const, custom: [what, weight, reps] };
  const line = (a: typeof base) => summaryLines(a, settings).find((l) => l.label === 'You log by')?.value;
  assert.equal(line({ ...base, log: 'free', daily: false }), 'Writing down details, any number: Exercise, Weight, Reps');
  assert.equal(line({ ...base, custom: [weight], log: 'free', daily: true }), 'Writing down details, one a day: Weight');
  assert.equal(line({ ...base, custom: [weight, reps], log: 'plan', planStyle: 'sets' }), 'Following a plan, the same list each time: Weight, Reps');
  assert.equal(line({ ...answersFromPreset('check-in') } as typeof base), 'Ticking things off');
  assert.equal(line({ ...answersFromPreset('check-in'), avoid: true } as typeof base), 'Avoiding something');
  assert.equal(line({ ...answersFromPreset('counter') } as typeof base), 'Counting something, 1 a tap');
  assert.equal(summaryLines(base, settings).filter((l) => l.label === 'You log by').length, 1, 'one line, not two');
});

test('building your own opens the same summary as a template: start, summary', () => {
  const steps = stepsFor({ ...answersFromPreset('blank'), record: 'numbers', log: 'plan' }, false);
  assert.deepEqual(steps, ['start', 'summary']);
  assert.ok(!(steps as string[]).includes('log'));
});

test('a goal can count one named thing, whatever its capitals', async () => {
  const { goalProgress } = await import('./goals');
  const a = { ...answersFromPreset('blank'), record: 'numbers' as const, log: 'free' as const, custom: [what, weight, reps] };
  const t = { ...draftFromAnswers(a, settings), id: 't', systemId: null, createdAt: new Date(2026, 0, 1).getTime() };
  const today = new Date(2026, 10, 18).getTime(); // a Wednesday
  const at = (d: number, name: string): Entry => ({ id: `${d}${name}`, trackerId: 't', at: new Date(2026, 10, d, 9).getTime(), done: true, values: { what: name, w: 20, r: 8 } });
  const goal = { id: 'g', measure: 'count', agg: 'count' as const, how: 'week' as const, cmp: 'min' as const, value: 2, from: '2026-01-01', where: { field: 'what', equals: 'Bench Press' } };
  const p = goalProgress(t, goal, [at(16, 'bench press'), at(17, 'Squat'), at(18, 'BENCH PRESS ')], today, settings, 'mon');
  assert.equal(p.value, 2, 'two bench entries, the squat is not counted');
  assert.equal(p.status, 'met');
});
