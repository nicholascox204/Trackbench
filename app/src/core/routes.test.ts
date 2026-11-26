import assert from 'node:assert/strict';
import test from 'node:test';
import { sameRoute } from './routes';
import { encodeRoute } from './runRecorder';
import type { Entry } from './types';

const loop = (dLat = 0) => [{ lat: 51.5 + dLat, lon: -0.12 }, { lat: 51.51, lon: -0.11 }, { lat: 51.5 + dLat, lon: -0.12 }];
const run = (id: string, at: number, km: number, min: number, route = loop()): Entry => ({ id, trackerId: 't', at, done: true, values: { distance: km, minutes: min, route: encodeRoute(route) } });

test('runs that start and end in the same places and are about as long are the same route', () => {
  const past = [run('a', 1, 5, 26), run('b', 2, 5.2, 25), run('c', 3, 8, 40), run('d', 4, 5, 24, loop(0.01))];
  const r = sameRoute(loop(), 5.1, past, 'distance', 'minutes');
  assert.equal(r.count, 2, 'a longer run and one starting a kilometre away are not the same route');
  assert.equal(r.best?.minutes, 25);
  assert.equal(r.last?.at, 2);
});

test('the run itself is left out, and a run with no route matches nothing', () => {
  assert.equal(sameRoute(loop(), 5, [run('a', 1, 5, 26)], 'distance', 'minutes', 'a').count, 0);
  assert.equal(sameRoute([], 5, [run('a', 1, 5, 26)], 'distance', 'minutes').count, 0);
});
