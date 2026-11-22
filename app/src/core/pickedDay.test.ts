import assert from 'node:assert/strict';
import test from 'node:test';
import { forgetPickedDay, pickedDayFor, rememberPickedDay } from './pickedDay';

const D = new Date(2026, 10, 19, 9).getTime();
const day = (n: number) => new Date(2026, 10, n).getTime();

test('a day you switched to is remembered for that tracker only', () => {
  rememberPickedDay('a', day(17), D);
  assert.equal(pickedDayFor('a', D), day(17));
  assert.equal(pickedDayFor('b', D), null);
});

test('it is forgotten when a new day begins', () => {
  rememberPickedDay('a', day(17), D);
  assert.equal(pickedDayFor('a', D + 16 * 3600000), null, 'the next morning');
});

test('opening the tracker by itself forgets it', () => {
  rememberPickedDay('a', day(17), D);
  forgetPickedDay('a');
  assert.equal(pickedDayFor('a', D), null);
});
