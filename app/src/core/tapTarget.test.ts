// A tapped notification names the tracker to open, once.
import assert from 'node:assert/strict';
import test from 'node:test';
import { peekTapTarget, setTapTarget, subscribeTap, takeTapTarget } from './tapTarget';

test('a tap is remembered until it is taken, and taken only once', () => {
  assert.equal(takeTapTarget(), null);
  setTapTarget('gym');
  assert.equal(peekTapTarget(), 'gym');
  assert.equal(takeTapTarget(), 'gym');
  assert.equal(takeTapTarget(), null);
});

test('a missing tracker is ignored, and listeners hear a real tap', () => {
  let heard = 0;
  const off = subscribeTap(() => { heard++; });
  setTapTarget(undefined);
  setTapTarget(null);
  assert.equal(heard, 0);
  setTapTarget('run');
  assert.equal(heard, 1);
  takeTapTarget();
  off();
  setTapTarget('run');
  assert.equal(heard, 1);
  takeTapTarget();
});
