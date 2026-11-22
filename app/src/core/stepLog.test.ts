import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLog, stepsInRange, withLive } from './stepLog';

const H = 3600000;
const day = new Date(2026, 10, 23).getTime();

test('the saved log is read back, ignoring broken lines', () => {
  assert.deepEqual(parseLog('1000,50\nnonsense\n2000,80\n,\n'), [{ t: 1000, c: 50 }, { t: 2000, c: 80 }]);
});

test('a day is the growth of the total between readings', () => {
  const pts = [{ t: day + 8 * H, c: 1000 }, { t: day + 12 * H, c: 3000 }, { t: day + 20 * H, c: 4500 }];
  assert.equal(stepsInRange(pts, day, day + 24 * H), 3500);
  assert.equal(stepsInRange(pts, day, day + 10 * H), 1000, 'a stretch is shared out by time');
});

test('steps across midnight are split between the two days by time', () => {
  const pts = [{ t: day + 22 * H, c: 1000 }, { t: day + 26 * H, c: 1400 }];
  assert.equal(stepsInRange(pts, day, day + 24 * H), 200);
  assert.equal(stepsInRange(pts, day + 24 * H, day + 48 * H), 200);
});

test('a restart of the phone starts the total again without losing the day', () => {
  const pts = [{ t: day + 8 * H, c: 9000 }, { t: day + 12 * H, c: 9500 }, { t: day + 16 * H, c: 300 }];
  assert.equal(stepsInRange(pts, day, day + 24 * H), 800, '500 before the restart, 300 after');
});

test('nothing is known before the first reading, and a lone reading counts nothing', () => {
  assert.equal(stepsInRange([], day, day + 24 * H), 0);
  assert.equal(stepsInRange([{ t: day + 8 * H, c: 5000 }], day, day + 24 * H), 0);
});

test('a reading taken now is added to the log only if it is newer', () => {
  const pts = [{ t: 1000, c: 10 }];
  assert.equal(withLive(pts, 2000, 20).length, 2);
  assert.equal(withLive(pts, 1000, 20).length, 1);
  assert.equal(withLive(pts, 2000, null).length, 1);
});
