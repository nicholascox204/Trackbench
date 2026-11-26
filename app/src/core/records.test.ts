import assert from 'node:assert/strict';
import test from 'node:test';
import { bestsBefore, oneRepMax, recordOf } from './records';
import type { Entry, Tracker } from './types';

const t = { fields: [{ id: 'weight', name: 'Weight', type: 'number', unitKind: 'weight' }, { id: 'reps', name: 'Reps', type: 'number' }] } as unknown as Tracker;
const D = 86400000;
const day = (n: number) => new Date(2026, 0, 1).getTime() + n * D;
const set = (n: number, w: number, r: number, done = true): Entry => ({ id: `${n}-${w}-${r}`, trackerId: 't', slotId: 'bench', row: 0, at: day(n) + 3600000, done, values: { weight: w, reps: r } });

test('estimated one-rep max follows Epley, and one rep is the weight', () => {
  assert.equal(oneRepMax(100, 1), 100);
  assert.equal(Math.round(oneRepMax(100, 5)), 117);
  assert.equal(oneRepMax(0, 5), 0);
});

test('the first session sets no record; a heavier set later does', () => {
  const first = [set(0, 60, 8)];
  assert.equal(recordOf(t, set(0, 60, 8), bestsBefore(t, [], 'bench', day(0))), null);
  assert.equal(recordOf(t, set(1, 65, 5), bestsBefore(t, first, 'bench', day(1))), 'weight');
});

test('more reps at the same weight is a record by estimated max; less is not', () => {
  const past = [set(0, 60, 8)];
  const b = bestsBefore(t, past, 'bench', day(1));
  assert.equal(recordOf(t, set(1, 60, 10), b), 'e1rm');
  assert.equal(recordOf(t, set(1, 60, 6), b), null);
  assert.equal(recordOf(t, set(1, 60, 10, false), b), null, 'a set not ticked done is not counted');
});

test('sets from the same day are not compared with each other', () => {
  const today = [set(1, 70, 5)];
  assert.equal(bestsBefore(t, today, 'bench', day(1)).seen, false);
});

import { platesFor } from './records';

test('plates load heaviest first on each side, and say what cannot be made', () => {
  assert.deepEqual(platesFor(100, 'kg'), { perSide: [25, 15], left: 0, bar: 20 });
  assert.deepEqual(platesFor(135, 'lb').perSide, [45]);
  assert.deepEqual(platesFor(20, 'kg').perSide, []);
  assert.equal(platesFor(101, 'kg').left, 1);
});

test('a warm-up set is never a record and never sets the bar', () => {
  const warm: Entry = { ...set(0, 100, 5), values: { weight: 100, reps: 5, warm: 1 } };
  const b = bestsBefore(t, [set(0, 60, 8), warm], 'bench', day(1));
  assert.equal(b.weight, 60, 'the heavy warm-up is left out');
  assert.equal(recordOf(t, { ...set(1, 70, 5), values: { weight: 70, reps: 5, warm: 1 } }, b), null);
});
