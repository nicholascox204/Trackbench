import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDuration, joinDuration, minutesFromMs, splitDuration } from './duration';

test('minutes split into hours and minutes and join back', () => {
  assert.deepEqual(splitDuration(442), { h: 7, m: 22 });
  assert.equal(joinDuration(7, 22), 442);
  assert.deepEqual(splitDuration(45), { h: 0, m: 45 });
  assert.deepEqual(splitDuration(-5), { h: 0, m: 0 });
  assert.deepEqual(splitDuration(Number.NaN), { h: 0, m: 0 });
});

test('a duration reads as hours and minutes', () => {
  assert.equal(formatDuration(442), '7 h 22 m');
  assert.equal(formatDuration(420), '7 h');
  assert.equal(formatDuration(45), '45 m');
  assert.equal(formatDuration(0), '0 m');
  assert.equal(formatDuration(60), '1 h');
});

test('a timer rounds to the nearest minute', () => {
  assert.equal(minutesFromMs(7 * 3600000 + 22 * 60000 + 29000), 442);
  assert.equal(minutesFromMs(7 * 3600000 + 22 * 60000 + 31000), 443);
  assert.equal(minutesFromMs(20000), 0);
  assert.equal(minutesFromMs(-5), 0);
});

import { upgradeSleepHours } from './duration';

test('a Sleep tracker kept in hours moves to minutes, with its entries, once', () => {
  const t = { id: 's', presetId: 'sleep', fields: [{ id: 'slept', name: 'Hours slept', type: 'number', unit: 'h' }, { id: 'quality', type: 'rating' }], tools: { previous: true } };
  const other = { id: 'o', presetId: 'weigh-in', fields: [{ id: 'slept', type: 'number' }], tools: {} };
  const entries = [{ trackerId: 's', values: { slept: 7.5, quality: 4 } }, { trackerId: 'o', values: { slept: 7.5 } }];
  const r = upgradeSleepHours([t, other], entries);
  assert.equal(r.trackers[0].fields[0].type, 'duration');
  assert.equal(r.trackers[0].tools.timerInto, 'slept');
  assert.equal(r.entries[0].values.slept, 450);
  assert.equal(r.entries[0].values.quality, 4);
  assert.equal(r.entries[1].values.slept, 7.5, 'another tracker is untouched');
  assert.equal(r.trackers[1].fields[0].type, 'number');
  const again = upgradeSleepHours(r.trackers, r.entries);
  assert.equal(again.entries[0].values.slept, 450, 'running it again changes nothing');
});

import { canTimerFill } from './duration';

test('a timer can fill an hours-and-minutes field or a number in minutes, nothing else', () => {
  assert.equal(canTimerFill({ type: 'duration', unit: 'min' }), true);
  assert.equal(canTimerFill({ type: 'number', unit: 'min' }), true);
  assert.equal(canTimerFill({ type: 'number', unit: 'kg' }), false);
  assert.equal(canTimerFill({ type: 'number' }), false);
  assert.equal(canTimerFill({ type: 'rating' }), false);
});

import { upgradeReadingMinutes } from './duration';

test('a Reading tracker kept in plain minutes becomes hours and minutes with the timer, once', () => {
  const t = { id: 'r', presetId: 'reading', fields: [{ id: 'minutes', name: 'Minutes', type: 'number', unit: 'min', step: 5, default: 25 }], tools: { previous: true } };
  const other = { id: 'o', presetId: 'weigh-in', fields: [{ id: 'minutes', type: 'number', unit: 'min' }], tools: {} };
  const r = upgradeReadingMinutes([t, other]);
  assert.equal(r[0].fields[0].type, 'duration');
  assert.equal(r[0].tools.timerInto, 'minutes');
  assert.equal(r[1].fields[0].type, 'number', 'another preset is untouched');
  assert.equal(upgradeReadingMinutes(r)[0].fields[0].type, 'duration');
});
