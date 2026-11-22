import assert from 'node:assert/strict';
import test from 'node:test';
import { clampNumber, clampTyped } from './limits';

test('a number over the limit becomes the limit and says so', () => {
  assert.deepEqual(clampTyped('75', 59), { value: 59, text: '59', clamped: true });
  assert.deepEqual(clampTyped('59', 59), { value: 59, text: '59', clamped: false });
  assert.deepEqual(clampTyped('7', 59), { value: 7, text: '7', clamped: false });
});

test('clearing is allowed and leaves the box empty', () => {
  assert.deepEqual(clampTyped('', 59), { value: null, text: '', clamped: false });
});

test('letters and points are dropped and flagged', () => {
  assert.deepEqual(clampTyped('7.', 59), { value: 7, text: '7', clamped: true });
  assert.deepEqual(clampTyped('a', 59), { value: null, text: '', clamped: true });
});

test('a stepper value is held between its limits', () => {
  assert.deepEqual(clampNumber(120, 0, 99), { value: 99, clamped: true });
  assert.deepEqual(clampNumber(-3, 0, 99), { value: 0, clamped: true });
  assert.deepEqual(clampNumber(50, 0, 99), { value: 50, clamped: false });
});

import { cleanDecimal } from './limits';

test('a typed decimal keeps to six whole digits and two decimals, and refuses what goes past', () => {
  assert.equal(cleanDecimal('70.5'), '70.5');
  assert.equal(cleanDecimal('70,5'), '70.5');
  assert.equal(cleanDecimal('6.'), '6.');
  assert.equal(cleanDecimal(''), '');
  assert.equal(cleanDecimal('1234567'), null);
  assert.equal(cleanDecimal('12.345'), null);
  assert.equal(cleanDecimal('1.2.3'), null);
  assert.equal(cleanDecimal('-5'), '5');
});

import { decimalRoom } from './limits';

test('the box is told how much it may hold, so a character past the limit never appears', () => {
  assert.equal(decimalRoom('70'), 6);
  assert.equal(decimalRoom('70.5'), 5);
  assert.equal(decimalRoom('1234.'), 7);
});

import { firstKey } from './limits';

test('the first key over a selected number replaces it; deleting clears it', () => {
  assert.equal(firstKey('45', '457'), '7');
  assert.equal(firstKey('45', '745'), '7');
  assert.equal(firstKey('45.5', '45.57'), '7');
  assert.equal(firstKey('45', '4'), '');
  assert.equal(firstKey('45', ''), '');
  assert.equal(firstKey('45', '7'), '7'); // the phone already replaced it
  assert.equal(firstKey('45', '4x5'), '4x5'); // the caret was moved first: taken as typed
});
