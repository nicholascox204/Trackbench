import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uniqueName, uniqueNames } from './names';

test('a free name is kept; a taken one gets the next number, ignoring capitals', () => {
  assert.equal(uniqueName('Water', ['Gym']), 'Water');
  assert.equal(uniqueName('Water', ['water ']), 'Water 2');
  assert.equal(uniqueName('Water', ['Water', 'Water 2']), 'Water 3');
});

test('a long taken name is shortened so the number still fits 24 letters', () => {
  const long = 'Morning stretch routine!'; // 24
  const out = uniqueName(long, [long]);
  assert.ok(out.length <= 24);
  assert.ok(out.endsWith(' 2'));
});

test('several added at once never collide with each other', () => {
  const out = uniqueNames([{ name: 'Gym' }, { name: 'Gym' }], ['Gym']).map((t) => t.name);
  assert.deepEqual(out, ['Gym 2', 'Gym 3']);
});
