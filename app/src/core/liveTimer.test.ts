// What the live notification for a running timer says.
import assert from 'node:assert/strict';
import test from 'node:test';
import { liveSpec } from './liveSpec';

test('a stopwatch counts up from a moment placed so the clock reads the time already counted', () => {
  const now = 1_000_000;
  const s = liveSpec('timer', 'run', 'Running', now - 125_000, now); // two minutes five seconds already counted
  assert.equal(s.id, 'live-run');
  assert.equal(s.title, 'Running');
  assert.equal(s.android.chronometerDirection, 'up');
  assert.equal(s.android.timestamp, now - 125_000);
  assert.equal(s.android.timeoutAfter, undefined, 'a stopwatch has no end');
  assert.equal(s.android.ongoing, true);
  assert.equal(s.android.visibility, 1, 'content shows on the lock screen, which live notifications need');
});

test('a countdown counts down to its end and goes away then', () => {
  const now = 1_000_000;
  const s = liveSpec('countdown', 'sit', 'Meditate', now + 600_000, now);
  assert.equal(s.android.chronometerDirection, 'down');
  assert.equal(s.android.timestamp, now + 600_000);
  assert.equal(s.android.timeoutAfter, 600_000);
});

test('a countdown that has just run out still gets a positive timeout, and a nameless one gets a plain title', () => {
  const s = liveSpec('countdown', 'x', '', 5, 100);
  assert.equal(s.android.timeoutAfter, 1000);
  assert.equal(s.title, 'Countdown');
  assert.equal(liveSpec('timer', 'x', '', 0, 0).title, 'Stopwatch');
});

test('a countdown says how long it was set for, and a tap can find its tracker', async () => {
  const { lengthText } = await import('./liveSpec');
  assert.equal(lengthText(120), '2 min');
  assert.equal(lengthText(90), '1 min 30 s');
  assert.equal(lengthText(45), '45 s');
  assert.equal(lengthText(3900), '1 h 5 min');
  assert.equal(lengthText(3600), '1 h');
  const s = liveSpec('countdown', 'gym', 'Gym split', 1000, 0, 120);
  assert.equal(s.title, 'Gym split');
  assert.equal(s.body, '2 min countdown');
  assert.deepEqual(s.data, { trackerId: 'gym' });
  assert.equal(liveSpec('timer', 'gym', 'Gym split', 0, 0).body, 'Stopwatch running');
});
