import assert from 'node:assert/strict';
import test from 'node:test';
import { importSlotId, liftEntries, parseCsv, parseWhen, readLiftFile } from './liftImport';
import type { Tracker } from './types';

const gym = {
  id: 'g', fields: [{ id: 'weight', name: 'Weight', type: 'number', unitKind: 'weight' }, { id: 'reps', name: 'Reps', type: 'number' }],
  plan: [{ from: '2026-01-01', days: [{ label: 'Push', slots: [{ id: 'bench', name: 'Bench Press', sets: 3 }] }] }],
} as unknown as Tracker;
let n = 0;
const id = () => `e${n++}`;

const STRONG = [
  'Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE',
  '2026-11-20 07:00:00;"Push";45m;"Bench Press";W;40;10;0;0;;;',
  '2026-11-20 07:00:00;"Push";45m;"Bench Press";1;80;5;0;0;;;',
  '2026-11-20 07:00:00;"Push";45m;"Bench Press";2;80;5;0;0;;;',
  '2026-11-20 07:00:00;"Push";45m;"Rest Timer";;0;0;0;90;;;',
].join('\n');

const HEVY = [
  '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"',
  '"Push","22 Nov 2026, 18:05","22 Nov 2026, 19:00","","Bench Press","","","0","warmup","40","10","","",""',
  '"Push","22 Nov 2026, 18:05","22 Nov 2026, 19:00","","Bench Press","","","1","normal","82.5","5","","",""',
  '"Push","22 Nov 2026, 18:05","22 Nov 2026, 19:00","","Lateral Raise, Cable","","","0","normal","10","12","","",""',
].join('\n');

test('a CSV with quotes, commas and semicolons reads into cells', () => {
  assert.deepEqual(parseCsv('a,"b, c","d ""e"""\n1,2,3'), [['a', 'b, c', 'd "e"'], ['1', '2', '3']]);
  assert.equal(parseWhen('22 Nov 2026, 18:05'), new Date(2026, 10, 22, 18, 5).getTime());
});

test('a Strong export: warm-ups marked, rest timers skipped, pounds converted', () => {
  const f = readLiftFile(STRONG, 'lb')!;
  assert.equal(f.app, 'Strong');
  assert.equal(f.sets.length, 3);
  assert.equal(f.sets[0].warm, true);
  assert.equal(f.sets[1].weight, 36.29);
});

test('a Hevy export: kilograms, warm-ups from the set type', () => {
  const f = readLiftFile(HEVY)!;
  assert.equal(f.app, 'Hevy');
  assert.equal(f.unit, 'kg');
  assert.equal(f.sets[0].warm, true);
  assert.equal(f.sets[1].weight, 82.5);
});

test('sets join the exercise of the same name; others keep a name id; importing twice adds nothing', () => {
  const f = readLiftFile(HEVY)!;
  const a = liftEntries(gym, f, [], id);
  assert.deepEqual(a.matched, ['Bench Press']);
  assert.deepEqual(a.unmatched, ['Lateral Raise, Cable']);
  assert.equal(a.entries.filter((e) => e.slotId === 'bench').length, 2);
  assert.equal(a.entries.find((e) => e.slotId !== 'bench')?.slotId, importSlotId('Lateral Raise, Cable'));
  assert.deepEqual(a.entries.map((e) => e.row), [0, 1, 0]);
  assert.equal(liftEntries(gym, f, a.entries, id).entries.length, 0);
});
