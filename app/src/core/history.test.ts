import assert from 'node:assert/strict';
import test from 'node:test';
import { trackerOn, withHistory } from './history';
import { dayKeyOf } from './plan';
import type { Field, Tracker } from './types';

const DAY = 86400000;
const now = new Date(2026, 10, 27, 12).getTime();
const weight: Field = { id: 'w', name: 'Weight', type: 'number' };
const reps: Field = { id: 'r', name: 'Reps', type: 'number' };
const base = (fields: Field[], createdAt = now - 10 * DAY): Tracker => ({
  id: 't', name: 'Lifts', icon: 'barbell-outline', presetId: 'blank', input: 'form', fields, measures: [], primaryMeasure: 'done',
  targets: [], derived: [], success: { mode: 'any' } as never, plan: [], tools: { previous: true, lockPast: false }, systemId: null, createdAt,
});

test('an edit applies from today; earlier days keep the setup they had', () => {
  const before = base([weight, reps]);
  const after = withHistory(before, base([weight]), now);
  assert.equal(after.fields.length, 1);
  assert.equal(after.past?.[0].until, dayKeyOf(now));
  assert.deepEqual(trackerOn(after, now - 2 * DAY).fields.map((f) => f.id), ['w', 'r'], 'two days ago still shows Reps');
  assert.deepEqual(trackerOn(after, now - DAY).fields.map((f) => f.id), ['w', 'r'], 'yesterday too');
  assert.deepEqual(trackerOn(after, now).fields.map((f) => f.id), ['w'], 'today follows the edit');
});

test('several edits in one day keep only the setup from before the first', () => {
  const one = withHistory(base([weight, reps]), base([weight]), now);
  const two = withHistory(one, base([reps]), now);
  assert.equal(two.past?.length, 1);
  assert.deepEqual(trackerOn(two, now - DAY).fields.map((f) => f.id), ['w', 'r']);
});

test('saving with nothing changed, or on the day it was made, keeps no history', () => {
  const t = base([weight]);
  assert.equal(withHistory(t, { ...t, name: 'Renamed' }, now).past, undefined, 'a new name is not a new setup');
  const fresh = base([weight], now);
  assert.equal(withHistory(fresh, base([reps], now), now).past, undefined, 'nothing before today to keep');
});

test('edits on different days stack, each covering its own stretch', () => {
  const a = withHistory(base([weight]), base([weight, reps]), now - 5 * DAY);
  const b = withHistory(a, base([reps]), now);
  assert.deepEqual(trackerOn(b, now - 7 * DAY).fields.map((f) => f.id), ['w']);
  assert.deepEqual(trackerOn(b, now - 3 * DAY).fields.map((f) => f.id), ['w', 'r']);
  assert.deepEqual(trackerOn(b, now).fields.map((f) => f.id), ['r']);
});
