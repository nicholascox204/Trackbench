// A set row: ticking done fills the empty numbers from last time (and only from last time), and unticking takes
// back only what the tick filled in, so the ghost values come back and anything you typed stays.
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRow } from './rows';
import type { Entry, Field } from './types';

const fields: Field[] = [
  { id: 'weight', name: 'Weight', type: 'number', step: 1, default: 0 },
  { id: 'reps', name: 'Reps', type: 'number', step: 1, default: 0 },
];
const entry = (values: Entry['values'], done = true): Entry => ({ id: 'e', trackerId: 't', at: 1, slotId: 's', row: 0, done, values });
const prev = entry({ weight: 80, reps: 6 });

test('ticking done fills the empty numbers from last time', () => {
  const r = applyRow(undefined, { done: true }, { fields, prev });
  assert.deepEqual(r.values, { weight: 80, reps: 6 });
  assert.equal(r.done, true);
  assert.deepEqual(r.auto, ['weight', 'reps']);
});

test('unticking takes back what the tick filled in, so the ghost values return', () => {
  const ticked = applyRow(undefined, { done: true }, { fields, prev });
  const undone = applyRow({ ...entry(ticked.values), auto: ticked.auto }, { done: false }, { fields, prev });
  assert.deepEqual(undone.values, {});
  assert.equal(undone.done, false);
  assert.deepEqual(undone.auto, []);
});

test('what you typed stays, even when you untick', () => {
  const typed = applyRow(undefined, { values: { weight: 85 } }, { fields, prev });
  assert.equal(typed.done, false);
  const ticked = applyRow({ ...entry(typed.values, false), auto: typed.auto }, { done: true }, { fields, prev });
  assert.deepEqual(ticked.values, { weight: 85, reps: 6 }, 'weight is yours, reps came from last time');
  assert.deepEqual(ticked.auto, ['reps']);
  const undone = applyRow({ ...entry(ticked.values), auto: ticked.auto }, { done: false }, { fields, prev });
  assert.deepEqual(undone.values, { weight: 85 }, 'only the filled-in reps are taken back');
});

test('changing a filled-in number makes it yours', () => {
  const ticked = applyRow(undefined, { done: true }, { fields, prev });
  const edited = applyRow({ ...entry(ticked.values), auto: ticked.auto }, { values: { reps: 8 } }, { fields, prev });
  assert.deepEqual(edited.auto, ['weight'], 'reps is no longer automatic');
  const undone = applyRow({ ...entry(edited.values), auto: edited.auto }, { done: false }, { fields, prev });
  assert.deepEqual(undone.values, { reps: 8 }, 'your 8 stays; the filled-in weight goes');
});

test('with nothing from last time, ticking done leaves the boxes empty (no zeros, no copying)', () => {
  const r = applyRow(undefined, { done: true }, { fields, prev: null });
  assert.deepEqual(r.values, {});
  assert.equal(r.done, true, 'the set is still ticked');
  assert.deepEqual(r.auto, []);
  const undone = applyRow({ ...entry(r.values), auto: r.auto }, { done: false }, { fields, prev: null });
  assert.deepEqual(undone.values, {});
});

test('a set last time that had only one of the numbers fills only that one', () => {
  const partial = entry({ weight: 60 });
  assert.deepEqual(applyRow(undefined, { done: true }, { fields, prev: partial }).values, { weight: 60 });
});

test('clearing a box by hand is not a filled-in value either', () => {
  const ticked = applyRow(undefined, { done: true }, { fields, prev });
  const cleared = applyRow({ ...entry(ticked.values), auto: ticked.auto }, { values: { weight: '' } }, { fields, prev });
  assert.ok(!(cleared.auto ?? []).includes('weight'));
});

test('ticking again after an untick fills again', () => {
  const t1 = applyRow(undefined, { done: true }, { fields, prev });
  const u = applyRow({ ...entry(t1.values), auto: t1.auto }, { done: false }, { fields, prev });
  const t2 = applyRow({ ...entry(u.values, false), auto: u.auto }, { done: true }, { fields, prev });
  assert.deepEqual(t2.values, { weight: 80, reps: 6 });
});
