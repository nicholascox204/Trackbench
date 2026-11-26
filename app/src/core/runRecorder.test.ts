import assert from 'node:assert/strict';
import test from 'node:test';
import { fitView, tilesFor, toBox } from './mapTiles';
import { addFix, averagePace, cueText, decodeRoute, elapsedMs, encodeRoute, finish, newRun, pause, start, type Fix, type RunState } from './runRecorder';

const KM = 1000;
// Heading north at 0.0009 degrees of latitude (~100 m) every 30 s: 5:00 per km.
const step = (i: number, t0: number, lat0 = 51.5): Fix => ({ lat: lat0 + i * 0.0009, lon: -0.12, t: t0 + i * 30000, acc: 5 });

function runFor(n: number, t0 = 0, s: RunState = start(newRun(), 0)): RunState {
  for (let i = 0; i <= n; i++) s = addFix(s, step(i, t0), KM);
  return s;
}

test('distance and splits add up, about 100 m a fix, 5:00 a km', () => {
  const s = runFor(22); // 22 steps of ~100 m
  assert.ok(Math.abs(s.meters - 2200) < 30, `metres ${s.meters}`);
  assert.equal(s.splits.length, 2);
  assert.ok(Math.abs(s.splits[0].seconds - 300) < 10, `split ${s.splits[0].seconds}`);
  const avg = averagePace(s, 22 * 30000, KM)!;
  assert.ok(Math.abs(avg - 300) < 10, `pace ${avg}`);
});

test('inaccurate fixes and impossible jumps are ignored', () => {
  let s = runFor(3);
  const m = s.meters;
  s = addFix(s, { lat: 51.6, lon: -0.12, t: 4 * 30000, acc: 5 }, KM); // 10 km in 30 s
  s = addFix(s, { lat: 51.5036, lon: -0.12, t: 4 * 30000, acc: 80 }, KM);
  assert.equal(s.meters, m);
});

test('a pause leaves out its time and the distance across the gap', () => {
  let s = runFor(5); // 0..150 s
  s = pause(s, 150000);
  s = addFix(s, step(6, 0), KM); // ignored while paused
  s = start(s, 600000); // resume after a long stop, 300 m further on
  const before = s.meters;
  s = addFix(s, { lat: 51.5 + 8 * 0.0009, lon: -0.12, t: 600000, acc: 5 }, KM);
  assert.equal(s.meters, before, 'the first fix after a pause starts a new stretch');
  s = addFix(s, { lat: 51.5 + 9 * 0.0009, lon: -0.12, t: 630000, acc: 5 }, KM);
  assert.ok(s.meters - before > 90 && s.meters - before < 110);
  assert.equal(elapsedMs(finish(s, 630000), 630000), 150000 + 30000);
});

test('the spoken update says distance, time and pace', () => {
  const s = runFor(11);
  const text = cueText(s, 11 * 30000, 'km', KM);
  assert.match(text, /^1 kilometre\. time 5 minutes/);
  assert.match(text, /average pace (5 minutes|4 minutes 5\d) per kilometre/);
});

test('a route survives encoding to text and back', () => {
  const pts = [{ lat: 38.5, lon: -120.2 }, { lat: 40.7, lon: -120.95 }, { lat: 43.252, lon: -126.453 }];
  assert.equal(encodeRoute(pts), '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(decodeRoute(encodeRoute(pts)), pts);
});

test('the map fits the route in its box and covers it with tiles', () => {
  const pts = Array.from({ length: 23 }, (_, i) => step(i, 0));
  const v = fitView(pts, 320, 200)!;
  for (const p of pts) {
    const b = toBox(v, p.lat, p.lon);
    assert.ok(b.x >= 0 && b.x <= 320 && b.y >= 0 && b.y <= 200);
  }
  const tiles = tilesFor(v);
  assert.ok(tiles.length >= 2 && tiles.length <= 9);
  assert.ok(v.z >= 12 && v.z <= 15, `zoom ${v.z}`);
});
