import assert from 'node:assert/strict';
import test from 'node:test';
import { fillFor, healthKind, newFills, type HealthItem } from './healthImport';
import { draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import type { Entry, Settings, Tracker } from './types';

const settings = { units: 'metric', weekStart: 'mon' } as unknown as Settings;
const make = (id: string): Tracker => ({ ...draftFromAnswers(TEMPLATES.find((x) => x.id === id)!.make(), settings), id, systemId: null, createdAt: 0 } as Tracker);
const at = (d: number, h: number) => new Date(2026, 10, d, h).getTime();

test('each health preset takes its kind; a habit takes none', () => {
  assert.equal(healthKind(make('weigh-in')), 'weight');
  assert.equal(healthKind(make('sleep')), 'sleep');
  assert.equal(healthKind(make('running')), 'runs');
  assert.equal(healthKind(make('blood-pressure')), 'bloodPressure');
  assert.equal(healthKind(make('blood-sugar')), 'bloodSugar');
  assert.equal(healthKind(make('habit')), undefined);
});

test('a night of sleep lands on the day you woke, as bedtime and wake time', () => {
  const f = fillFor(make('sleep'), { kind: 'sleep', id: 's1', start: at(25, 23), end: at(26, 7) })!;
  assert.equal(f.day, new Date(2026, 10, 26).getTime());
  assert.equal(f.values.bed, 23 * 60);
  assert.equal(f.values.wake, 7 * 60);
  assert.equal(fillFor(make('sleep'), { kind: 'sleep', id: 'nap', start: at(26, 14), end: at(26, 14) + 1800000 }), undefined, 'a half-hour nap is left out');
});

test('a run from a watch fills distance, time and exact seconds; a walk does not', () => {
  const f = fillFor(make('running'), { kind: 'runs', id: 'r1', start: at(24, 7), end: at(24, 7) + 1530000, meters: 5012, type: 56 })!;
  assert.equal(f.values.distance, 5.012);
  assert.equal(f.values.minutes, 26);
  assert.equal(f.values.secs, 1530);
  assert.equal(fillFor(make('running'), { kind: 'runs', id: 'w', start: 0, end: 1, meters: 900, type: 79 }), undefined);
});

test('blood pressure and sugar fill their fields, with the meal timing when the meter gives it', () => {
  const bp = fillFor(make('blood-pressure'), { kind: 'bloodPressure', id: 'b', at: at(26, 8), top: 121.4, bottom: 79.6 })!;
  assert.deepEqual([bp.values.top, bp.values.bottom], [121, 80]);
  const sugar = fillFor(make('blood-sugar'), { kind: 'bloodSugar', id: 'g', at: at(26, 8), mgdl: 98.2, relation: 2 })!;
  assert.equal(sugar.values.level, 98);
  assert.equal(sugar.values.when, 'Fasting');
});

test('weights: one a day (the latest), nothing twice, and a day weighed by hand is left alone', () => {
  const t = make('weigh-in');
  const items: HealthItem[] = [
    { kind: 'weight', id: 'a', at: at(24, 7), kg: 80.2 }, { kind: 'weight', id: 'b', at: at(24, 21), kg: 81 },
    { kind: 'weight', id: 'c', at: at(25, 7), kg: 80 }, { kind: 'weight', id: 'd', at: at(26, 7), kg: 79.8 },
  ];
  const hand: Entry = { id: 'h', trackerId: 'weigh-in', at: at(25, 8), done: true, values: { weight: 79.5 } };
  const fills = newFills(t, items, [hand]);
  assert.deepEqual(fills.map((f) => f.values.hc), ['b', 'd']);
  const done: Entry[] = fills.map((f, i) => ({ id: `x${i}`, trackerId: 'weigh-in', at: f.at, done: true, values: f.values }));
  assert.equal(newFills(t, items, [hand, ...done]).length, 0, 'bringing the same days in again adds nothing');
});
