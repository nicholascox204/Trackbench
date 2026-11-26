import assert from 'node:assert/strict';
import test from 'node:test';
import { EXERCISES, suggestExercises } from './exercises';

test('typing the start of a lift suggests it, shortest and word-start matches first', () => {
  const s = suggestExercises('bench');
  assert.equal(s[0].name, 'Bench Press');
  assert.ok(s.some((x) => x.name === 'Incline Bench Press'));
  assert.equal(suggestExercises('curl').length, 6);
});

test('your own names come before the library, and nothing shows once a name is complete', () => {
  assert.equal(suggestExercises('ben', ['Bench (paused)'])[0].name, 'Bench (paused)');
  assert.deepEqual(suggestExercises('Bench Press'), []);
  assert.deepEqual(suggestExercises(''), []);
});

test('the library has no repeated names', () => {
  const names = EXERCISES.map(([n]) => n.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});
