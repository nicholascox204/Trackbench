import assert from 'node:assert/strict';
import test from 'node:test';
import { DayIndex, rangeFor } from './overview';
import { bestMeasure, dailyValues, limitOf, mainField, pagePanels, panelKind, records, trendOf } from './panels';
import { buildPersona, PERSONAS } from './personas';
import { addDays, startOfDay } from './time';
import type { Settings } from './types';

const SETTINGS = { units: 'metric', weekStart: 'mon' } as unknown as Settings;
const NOW = new Date(2026, 10, 22, 12).getTime();
const TODAY = startOfDay(NOW);
const person = (id: string) => buildPersona(PERSONAS.find((p) => p.id === id)!, SETTINGS, null, NOW);
const indexOf = (id: string) => { const { trackers, entries } = person(id); return new DayIndex(trackers, entries); };
const by = (ix: DayIndex, tpl: string) => ix.trackers.find((t) => t.id.endsWith(tpl))!;

test('each kind of tracker gets the panel that suits it', () => {
  const ix = indexOf('regular');
  assert.equal(panelKind(by(ix, 'weigh-in')), 'reading');
  assert.equal(panelKind(by(ix, 'gym-split')), 'plan');
  assert.equal(panelKind(by(ix, 'water')), 'habit');
  const coffee = indexOf('deep').trackers.find((t) => t.id.endsWith('caffeine'));
  if (coffee) assert.equal(panelKind(coffee), 'limit');
});

test('watch turns any tracker into a reading panel', () => {
  const t = { ...by(indexOf('regular'), 'water'), watch: true };
  assert.equal(panelKind(t), 'reading');
});

test('a trend is first reading to latest, skipping slices with none', () => {
  const pts = [
    { start: 1, end: 1, value: undefined, future: false }, { start: 2, end: 2, value: 80, future: false },
    { start: 3, end: 3, value: undefined, future: false }, { start: 4, end: 4, value: 77, future: false }, { start: 5, end: 5, value: 70, future: true },
  ];
  const t = trendOf(pts)!;
  assert.equal(t.first, 80); assert.equal(t.last, 77); assert.equal(t.change, -3);
  assert.equal(trendOf(pts.slice(0, 2)), undefined, 'one reading is not a trend');
});

test('records only ever step up, and mark the days a new best was set', () => {
  const ix = indexOf('veteran');
  const gym = by(ix, 'gym-split');
  assert.ok(bestMeasure(gym), 'a lifting tracker has a best to track');
  const r = records(gym, ix, rangeFor('all', TODAY, 'mon', ix.first), 'month', TODAY, 'mon');
  const vals = r.points.map((p) => p.value).filter((v): v is number => v !== undefined);
  assert.ok(vals.length > 3);
  for (let i = 1; i < vals.length; i++) assert.ok(vals[i] >= vals[i - 1], 'a running best never drops');
  assert.equal(r.best, vals[vals.length - 1]);
});

test('a limit reads its number and finds the limit', () => {
  const ix = indexOf('deep');
  const coffee = ix.trackers.find((t) => t.id.endsWith('caffeine'));
  if (!coffee) return;
  const lim = limitOf(coffee)!;
  assert.ok(lim.max > 0);
  const days = dailyValues(coffee, ix, lim.measure.id, addDays(TODAY, -13), TODAY, TODAY);
  assert.equal(days.length, 14);
});

test('the page lists a panel for every tracker with recent history, most used first', () => {
  const ix = indexOf('regular');
  const list = pagePanels(ix, TODAY, addDays(TODAY, -89));
  assert.ok(list.length >= 5);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].logged >= list[i].logged);
  assert.ok(mainField(by(ix, 'weigh-in')));
});
