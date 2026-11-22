// Has the setup changed from how it was opened? Compared by value, so changing something and changing it back counts as no change.
import assert from 'node:assert/strict';
import test from 'node:test';
import { isChanged } from './dirty';

test('the same answers are not a change', () => {
  assert.equal(isChanged({ name: 'Gym', chips: ['a', 'b'] }, { name: 'Gym', chips: ['a', 'b'] }), false);
});

test('a different value is a change', () => {
  assert.equal(isChanged({ name: 'Gym' }, { name: 'Gyms' }), true);
});

test('changing something and changing it back is not a change', () => {
  const opened = { name: 'Gym', extras: { timer: false } };
  const edited = { ...opened, name: 'Gymx' };
  assert.equal(isChanged(opened, edited), true);
  const reverted = { ...edited, name: 'Gym' };
  assert.equal(isChanged(opened, reverted), false);
});

test('the order of keys does not matter', () => {
  assert.equal(isChanged({ a: 1, b: { x: 1, y: 2 } }, { b: { y: 2, x: 1 }, a: 1 }), false);
});

test('the order of a list does matter', () => {
  assert.equal(isChanged({ list: ['a', 'b'] }, { list: ['b', 'a'] }), true);
});

test('adding or removing an item is a change', () => {
  assert.equal(isChanged({ list: ['a'] }, { list: ['a', 'b'] }), true);
  assert.equal(isChanged({ list: ['a', 'b'] }, { list: ['a'] }), true);
});

test('a key set to undefined is the same as a missing key', () => {
  assert.equal(isChanged({ a: 1, b: undefined }, { a: 1 }), false);
});

test('nested changes are found', () => {
  assert.equal(isChanged({ plan: [{ label: 'A', slots: [{ n: 1 }] }] }, { plan: [{ label: 'A', slots: [{ n: 2 }] }] }), true);
});

test('empty text is a change from missing text', () => {
  assert.equal(isChanged({ name: '' }, {}), true);
});
