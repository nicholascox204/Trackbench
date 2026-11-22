import assert from 'node:assert/strict';
import test from 'node:test';
import { changeTotal } from './tapTotal';
import type { Entry } from './types';

const e = (id: string, n?: number): Entry => ({ id, trackerId: 't', at: 0, done: true, values: n === undefined ? {} : { n } });

test('a higher total adds one entry for the difference', () => {
  assert.deepEqual(changeTotal([e('a', 1), e('b', 1)], 5, true), { remove: [], shrink: [], add: [3] });
});

test('a lower total takes from the newest entries first', () => {
  assert.deepEqual(changeTotal([e('a', 1), e('b', 1), e('c', 1)], 1, true), { remove: ['c', 'b'], shrink: [], add: [] });
});

test('an entry bigger than what must come off is shrunk, not removed', () => {
  assert.deepEqual(changeTotal([e('a', 250), e('b', 500)], 400, true), { remove: [], shrink: [{ id: 'b', n: 150 }], add: [] });
});

test('the same total changes nothing, and zero clears the day', () => {
  assert.deepEqual(changeTotal([e('a', 2)], 2, true), { remove: [], shrink: [], add: [] });
  assert.deepEqual(changeTotal([e('a', 2), e('b', 3)], 0, true), { remove: ['b', 'a'], shrink: [], add: [] });
});

test('a plain count adds or removes whole taps', () => {
  assert.deepEqual(changeTotal([e('a'), e('b')], 4, false), { remove: [], shrink: [], add: [1, 1] });
  assert.deepEqual(changeTotal([e('a'), e('b'), e('c')], 1, false), { remove: ['c', 'b'], shrink: [], add: [] });
});

test('a negative total is treated as zero', () => {
  assert.deepEqual(changeTotal([e('a', 2)], -3, true), { remove: ['a'], shrink: [], add: [] });
});
