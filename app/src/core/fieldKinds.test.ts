import assert from 'node:assert/strict';
import test from 'node:test';
import { FIXED, applyMeasure, measuresKey } from './fieldKinds';
import { answersFromPreset, draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import { fieldUnit } from './units';
import type { Field, Settings } from './types';

const metric: Settings = { units: 'metric' };
const imperial: Settings = { units: 'imperial' };
const num = (name: string): Field => ({ id: 'x', name, type: 'number', step: 1, default: 0 });

test('any number can measure something that follows the units: weight, distance, height, volume', () => {
  for (const kind of ['weight', 'distance', 'length', 'volume'] as const) {
    const f = applyMeasure(num('Thing'), kind);
    assert.equal(f.unitKind, kind);
    assert.equal(f.unit, undefined, 'a converting kind has no fixed label');
    assert.equal(measuresKey(f, false), kind);
  }
});

test('a number named Height follows the metric or imperial choice', () => {
  const a = { ...answersFromPreset('blank'), record: 'numbers' as const, custom: [applyMeasure(num('Height'), 'length')] };
  const f = draftFromAnswers(a, metric).fields[0];
  assert.equal(fieldUnit(f, metric), 'cm');
  assert.equal(fieldUnit(f, imperial), 'in');
});

test('fixed labels never convert, and switching measure clears the old one', () => {
  const minutes = applyMeasure(applyMeasure(num('Time spent'), 'weight'), 'min');
  assert.equal(minutes.unitKind, undefined);
  assert.equal(minutes.unit, FIXED.min.unit);
  assert.equal(measuresKey(minutes, false), 'min');
  const own = applyMeasure(num('Pages'), 'own');
  assert.equal(measuresKey(own, true), 'own');
  assert.equal(measuresKey({ ...own, unit: 'pages' }, false), 'own');
  const none = applyMeasure(minutes, 'none');
  assert.equal(none.unit, undefined);
  assert.equal(measuresKey(none, false), 'none');
});

test('a weight or a height is a reading (the day shows the latest) unless already decided', () => {
  assert.equal(applyMeasure(num('Weight'), 'weight').reading, true);
  assert.equal(applyMeasure(num('Height'), 'length').reading, true);
  assert.equal(applyMeasure({ ...num('Lifted'), reading: false }, 'weight').reading, false);
  assert.equal(applyMeasure(num('Pages'), 'own').reading, undefined);
});

test('holding a starting point\'s things as plain fields changes nothing about the tracker it makes', () => {
  for (const id of ['gym-split', 'running', 'sleep', 'spending', 'weigh-in', 'meals', 'symptoms']) {
    const a = (TEMPLATES.find((t) => t.id === id) as (typeof TEMPLATES)[number]).make();
    const before = draftFromAnswers(a, imperial);
    const after = draftFromAnswers({ ...a, chips: [], custom: before.fields }, imperial);
    assert.deepEqual(after.fields, before.fields, `${id} fields`);
    assert.deepEqual(after.measures, before.measures, `${id} measures`);
    assert.equal(after.primaryMeasure, before.primaryMeasure, `${id} primary`);
  }
});

test('a thing left without a name is saved with its type as the name, or numbered when several are blank', () => {
  const one = { ...answersFromPreset('blank'), record: 'numbers' as const, custom: [num(''), { id: 'r', name: 'Mood', type: 'rating' as const, max: 5 }] };
  assert.deepEqual(draftFromAnswers(one, imperial).fields.map((f) => f.name), ['Number', 'Mood']);
  const many = { ...answersFromPreset('blank'), record: 'numbers' as const, custom: [num(''), { id: 'r', name: '  ', type: 'rating' as const, max: 5 }, { ...num(''), id: 'z' }] };
  assert.deepEqual(draftFromAnswers(many, imperial).fields.map((f) => f.name), ['Unnamed 1', 'Unnamed 2', 'Unnamed 3']);
});
