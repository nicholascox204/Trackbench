import assert from 'node:assert/strict';
import test from 'node:test';
import { elapsedMs, newStopwatch, pauseWatch, resetWatch, startWatch, watchClock, watchStatus } from './stopwatch';

const T0 = 5_000_000;

test('a new timer is idle at zero', () => {
  const t = newStopwatch();
  assert.equal(watchStatus(t), 'idle');
  assert.equal(elapsedMs(t, T0), 0);
  assert.equal(watchClock(0), '0:00');
});

test('start counts up from a start time, so it survives a reload', () => {
  const running = startWatch(newStopwatch(), T0);
  assert.equal(watchStatus(running), 'running');
  assert.equal(elapsedMs(running, T0 + 42_000), 42_000);
  const saved = JSON.parse(JSON.stringify(running));
  assert.equal(elapsedMs(saved, T0 + 90_000), 90_000);
});

test('pause banks what has run, and resume adds to it', () => {
  const paused = pauseWatch(startWatch(newStopwatch(), T0), T0 + 30_000);
  assert.equal(watchStatus(paused), 'paused');
  assert.equal(elapsedMs(paused, T0 + 999_000), 30_000, 'time does not move while paused');
  const again = startWatch(paused, T0 + 100_000);
  assert.equal(elapsedMs(again, T0 + 110_000), 40_000);
});

test('start on a running timer and pause on an idle one change nothing', () => {
  const running = startWatch(newStopwatch(), T0);
  assert.deepEqual(startWatch(running, T0 + 5000), running);
  assert.deepEqual(pauseWatch(newStopwatch(), T0), newStopwatch());
});

test('reset returns to idle', () => {
  const r = resetWatch();
  assert.equal(watchStatus(r), 'idle');
  assert.equal(elapsedMs(r, T0), 0);
});

test('the clock shows whole seconds, and hours once past the hour', () => {
  assert.equal(watchClock(7_900), '0:07');
  assert.equal(watchClock(725_000), '12:05');
  assert.equal(watchClock(3_729_000), '1:02:09');
  assert.equal(watchClock(-5), '0:00');
});
