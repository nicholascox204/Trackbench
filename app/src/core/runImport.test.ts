import assert from 'node:assert/strict';
import test from 'node:test';
import { canImportRun, runFill } from './runImport';
import type { Tracker } from './types';

const run = { fields: [{ id: 'distance', name: 'Distance', type: 'number', unitKind: 'distance' }, { id: 'minutes', name: 'Time', type: 'duration' }] } as unknown as Tracker;
// Three points due north, about 1.11 km apart each, ten minutes between them.
const gpx = `<gpx><trk><trkseg>
<trkpt lat="0" lon="0"><ele>10</ele><time>2026-11-20T07:00:00Z</time></trkpt>
<trkpt lat="0.01" lon="0"><ele>20</ele><time>2026-11-20T07:05:00Z</time></trkpt>
<trkpt lat="0.02" lon="0"><ele>15</ele><time>2026-11-20T07:10:00Z</time></trkpt>
</trkseg></trk></gpx>`;

test('a run file fills distance in km and time in minutes, dated when it started', () => {
  assert.equal(canImportRun(run), true);
  const f = runFill(run, gpx)!;
  assert.ok(Math.abs(f.values.distance - 2.224) < 0.01, `distance ${f.values.distance}`);
  assert.equal(f.values.minutes, 10);
  assert.equal(f.at, Date.parse('2026-11-20T07:00:00Z'));
  assert.equal(f.climb, 10);
});

test('a file with no track, or a tracker without distance and time, is refused', () => {
  assert.equal(runFill(run, '<gpx></gpx>'), undefined);
  assert.equal(canImportRun({ fields: [{ id: 'minutes', type: 'duration' }] } as unknown as Tracker), false);
});
