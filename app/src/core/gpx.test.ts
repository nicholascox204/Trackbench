// Reading a GPX file into distance, time, pace, elevation and splits, and showing pace the way runners read it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { elevationChange, haversine, paceText, parseGpx, runStats, simplifyRoute, splitsOf } from './gpx';
import { computeMeasure } from './measures';
import { draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import { formatMeasure } from './units';

// A straight run north at a steady pace: 1 km takes 5 minutes, one point every 10 seconds (3.333 m/s = 33.3 m).
const KM_DEG = 1000 / 111195; // about one km of latitude, in degrees
const file = (n: number, climb = 0): string => {
  const pts = Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(2026, 10, 21, 7, 0, i * 10)).toISOString();
    return `<trkpt lat="${(40 + (i * KM_DEG) / 30).toFixed(7)}" lon="-105.0000000"><ele>${(1600 + i * climb).toFixed(1)}</ele><time>${t}</time></trkpt>`;
  });
  return `<?xml version="1.0"?><gpx version="1.1"><trk><name>Morning run</name><trkseg>${pts.join('\n')}</trkseg></trk></gpx>`;
};

test('a GPX file is read into points with position, elevation and time', () => {
  const pts = parseGpx(file(5));
  assert.equal(pts.length, 5);
  assert.equal(pts[0].ele, 1600);
  assert.equal(pts[1].t! - pts[0].t!, 10000);
});

test('attribute order, single quotes and self-closing points are all fine; bad points are skipped', () => {
  const pts = parseGpx(`<gpx><trk><trkseg><trkpt lon='-1.5' lat='51.5'/><trkpt lat="200" lon="0"></trkpt><trkpt lat="x" lon="1"/><trkpt lat="51.6" lon="-1.5"><ele>12</ele></trkpt></trkseg></trk></gpx>`);
  assert.equal(pts.length, 2);
  assert.deepEqual(pts.map((p) => p.lat), [51.5, 51.6]);
});

test('a planned route with no track is used when there is nothing else', () => {
  assert.equal(parseGpx('<gpx><rte><rtept lat="1" lon="2"/><rtept lat="1.1" lon="2"/></rte></gpx>').length, 2);
  assert.equal(parseGpx('not a gpx file').length, 0);
});

test('distance between two points is right to within a metre or so', () => {
  assert.ok(Math.abs(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111195) < 100);
  assert.equal(haversine({ lat: 40, lon: -105 }, { lat: 40, lon: -105 }), 0);
});

test('a steady 5k works out to its distance, time and pace', () => {
  const s = runStats(parseGpx(file(151)));
  assert.ok(Math.abs(s.meters - 5000) < 30, String(s.meters));
  assert.equal(s.elapsedSeconds, 1500);
  assert.equal(s.movingSeconds, 1500);
  assert.equal(s.startedAt, Date.UTC(2026, 10, 21, 7, 0, 0));
});

test('splits come out at each kilometre, with a short last one kept', () => {
  const sp = splitsOf(parseGpx(file(172)), 1000); // about 5.7 km
  assert.equal(sp.length, 6);
  assert.ok(sp.slice(0, 5).every((x) => Math.abs(x.seconds - 300) < 3), JSON.stringify(sp.map((x) => x.seconds)));
  assert.ok(sp[5].meters < 1000 && sp[5].meters > 600);
  assert.equal(paceText(sp[0].paceSecPerKm), '5:00');
});

test('a stop in the middle does not count as moving time', () => {
  const pts = parseGpx(file(31));
  const paused = [...pts.slice(0, 15), ...pts.slice(15).map((p) => ({ ...p, t: p.t! + 600000 }))]; // ten minutes standing
  const s = runStats(paused);
  assert.equal(s.elapsedSeconds, 900);
  assert.equal(s.movingSeconds, 290);
});

test('elevation gain ignores small wobble and counts real climbs', () => {
  const wobble = [0, 1, 0, 2, 1, 2].map((e, i) => ({ lat: 0, lon: i * 0.0001, ele: 100 + e }));
  assert.equal(elevationChange(wobble).gain, 0);
  const climb = [0, 5, 10, 8, 20, 12].map((e, i) => ({ lat: 0, lon: i * 0.0001, ele: 100 + e }));
  const c = elevationChange(climb);
  assert.equal(c.gain, 20);
  assert.equal(c.loss, 8);
});

test('a long route is simplified to a few hundred points and keeps its start and end', () => {
  const pts = Array.from({ length: 5000 }, (_, i) => ({ lat: 40 + Math.sin(i / 200) * 0.01, lon: -105 + i * 0.00001 }));
  const r = simplifyRoute(pts, 300);
  assert.ok(r.length <= 300 && r.length > 20, String(r.length));
  assert.deepEqual(r[0], pts[0]);
  assert.deepEqual(r[r.length - 1], pts[pts.length - 1]);
  assert.equal(simplifyRoute(pts.slice(0, 10)).length, 10);
});

test('pace reads as minutes and seconds', () => {
  assert.equal(paceText(510), '8:30');
  assert.equal(paceText(359.7), '6:00', 'seconds carry into the minute');
  assert.equal(paceText(0), '–');
});

test('a Running tracker shows its pace as minutes per distance, not a decimal', () => {
  const settings = { units: 'metric' as const };
  const t = { ...draftFromAnswers(TEMPLATES.find((x) => x.id === 'running')!.make(), settings), id: 'r', systemId: null, createdAt: 0 };
  const m = t.measures.find((x) => x.name === 'Pace')!;
  const entry = { id: 'e', trackerId: 'r', at: 1, done: true, values: { minutes: 50, distance: 5 } };
  assert.equal(formatMeasure(t, m, computeMeasure(m, [entry]), settings), '10:00 /km');
  assert.equal(formatMeasure(t, m, 0, settings), '–');
});
