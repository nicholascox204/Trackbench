import assert from 'node:assert/strict';
import test from 'node:test';
import { derive } from './derive';
import { weekEvents } from './goals';
import { addDays } from './time';
import { defaultConfig, evaluate } from './engine';
import { MOTIVATION_PRESETS, allGoals, gameRows, payText, presetOf } from './motivation';
import { answersFromPreset, draftFromAnswers } from './setup';
import type { DayInput } from './engine';
import type { Entry, Quest, Settings, System, Tracker } from './types';

const settings: Settings = { units: 'imperial' };
const day = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getTime();
const habit = (id: string, name: string, systemId: string | null): Tracker => ({ ...draftFromAnswers({ ...answersFromPreset('check-in'), name }, settings), id, systemId, createdAt: day(2026, 1, 1) });
const log = (trackerId: string, d: number): Entry => ({ id: `${trackerId}${d}`, trackerId, at: d + 9 * 3600000, done: true, values: {} });
const today = day(2026, 11, 18);

const closedDay = (d: number, hits: Record<string, boolean>): DayInput => ({
  day: d, closed: true,
  results: Object.fromEntries(Object.entries(hits).map(([id, ok]) => [id, { expected: true, success: ok, measures: {} }])),
});

// Days the engine walks, with nothing due, so only goal events move the score.
const quiet = (...ds: number[]): DayInput[] => ds.map((d) => ({ day: d, closed: true, results: { a: { expected: false, success: false, measures: {} } } }));

test('a goal pays what it says; unset parts use the game default', () => {
  const t = [habit('a', 'A', 's')];
  const cfg = { ...defaultConfig('standard'), hearts: { on: true, max: 3 } };
  const ev = (success: boolean, pay?: object) => [{ day: day(2026, 11, 10), trackerId: '', title: 'Goal', success, weight: 3, pay }];
  const run = (c: typeof cfg, e: ReturnType<typeof ev>) => evaluate(c, t, quiet(day(2026, 11, 10)), e);
  assert.equal(run(cfg, ev(true)).points, 30, 'default: base reward times weight');
  assert.equal(run(cfg, ev(true, { reward: 50 })).points, 50, 'the goal sets its own reward');
  assert.equal(run({ ...cfg, defaultPay: { reward: 7 } }, ev(true)).points, 7, 'the blanket default replaces the weighted one');
  assert.equal(run({ ...cfg, defaultPay: { reward: 7 } }, ev(true, { reward: 2 })).points, 2, 'the goal beats the blanket');
  const missed = run(cfg, ev(false, { heart: true, penalty: 4 }));
  assert.equal(missed.hearts, 2, 'a missed goal costs a heart when it says so');
  assert.equal(run(cfg, ev(false)).hearts, 3, 'and nothing otherwise');
  assert.equal(run({ ...cfg, hearts: { on: false, max: 3 } }, ev(false, { heart: true })).hearts, 3, 'hearts off: nothing to lose');
});

test('penalties only take points you have', () => {
  const t = [habit('a', 'A', 's')];
  const cfg = defaultConfig('standard');
  const r = evaluate(cfg, t, quiet(day(2026, 11, 3), day(2026, 11, 5)), [
    { day: day(2026, 11, 3), trackerId: '', title: 'Won', success: true, weight: 1, pay: { reward: 10 } },
    { day: day(2026, 11, 5), trackerId: '', title: 'Lost', success: false, weight: 1, pay: { penalty: 25 } },
  ]);
  assert.equal(r.points, 0);
  assert.equal(r.earned, 10);
});

test('what costs a heart is a setting: any, half or all missed', () => {
  const t = [habit('a', 'A', 's'), habit('b', 'B', 's'), habit('c', 'C', 's'), habit('d', 'D', 's')];
  const days = [closedDay(day(2026, 11, 10), { a: true, b: true, c: true, d: false })]; // one of four missed
  const hearts = (loseOn: 'any' | 'half' | 'all') => evaluate({ ...defaultConfig('standard'), hearts: { on: true, max: 3, loseOn } }, t, days).hearts;
  assert.equal(hearts('any'), 2);
  assert.equal(hearts('half'), 3, 'one of four is under half');
  assert.equal(hearts('all'), 3);
  const half = [closedDay(day(2026, 11, 10), { a: true, b: true, c: false, d: false })];
  assert.equal(evaluate({ ...defaultConfig('standard'), hearts: { on: true, max: 3, loseOn: 'half' } }, t, half).hearts, 2);
});

test('hearts can be set not to come back', () => {
  const t = [habit('a', 'A', 's')];
  const days = [closedDay(day(2026, 11, 10), { a: false }), closedDay(day(2026, 11, 11), { a: true })];
  assert.equal(evaluate({ ...defaultConfig('standard'), hearts: { on: true, max: 3 } }, t, days).hearts, 3, 'regained by default');
  assert.equal(evaluate({ ...defaultConfig('standard'), hearts: { on: true, max: 3, regain: false } }, t, days).hearts, 2);
});

test('how fast levels come is a setting', () => {
  const t = [habit('a', 'A', 's')];
  const days = Array.from({ length: 12 }, (_, i) => closedDay(day(2026, 11, 1 + i), { a: true }));
  const level = (perLevel?: number) => evaluate({ ...defaultConfig('standard'), levels: { on: true, perLevel } }, t, days).level;
  assert.ok(level(10) > level() && level() > level(100), 'a smaller step is faster');
});

test('trackers belong to one game each, and games score separately; a tracker in none is only a log', () => {
  const g1: System = { id: 'g1', name: 'Default', config: defaultConfig('standard'), createdAt: 0 };
  const g2: System = { id: 'g2', name: 'Strict', config: MOTIVATION_PRESETS.find((p) => p.id === 'strict')!.make(), createdAt: 0 };
  const trackers = [habit('a', 'A', 'g1'), habit('b', 'B', 'g2'), habit('c', 'C', null)];
  const es = [log('a', today), log('b', today), log('c', today)];
  const d = derive(trackers, es, [g1, g2], today, settings);
  assert.equal(d.games.length, 2);
  assert.deepEqual(d.games[0].inSystem.map((t) => t.id), ['a']);
  assert.deepEqual(d.games[1].inSystem.map((t) => t.id), ['b']);
  assert.equal(d.result, d.games[0].result, 'the default game stays the one the rest of the app reads');
  assert.equal(d.games[1].result.maxHearts, 3);
  assert.equal(derive(trackers, es, [], today, settings).games.length, 0);
});

test('a quest pay is used by the game that holds it', () => {
  const quest: Quest = { id: 'q', trackers: 'all', metric: 'entries', how: 'week', value: 2, from: '2026-11-02', pay: { reward: 99 } };
  const g: System = { id: 'g', name: 'G', config: defaultConfig('standard'), createdAt: 0, quests: [quest] };
  const t = [habit('a', 'A', 'g')];
  const es = [log('a', day(2026, 11, 3)), log('a', day(2026, 11, 4))];
  const withPay = derive(t, es, [g], today, settings).games[0].result.ledger.find((l) => l.reason.startsWith('Goal met'));
  assert.equal(withPay?.delta, 99);
});

test('presets are plain settings of the same fields, and read back as themselves', () => {
  for (const p of MOTIVATION_PRESETS) assert.equal(presetOf(p.make()), p.id);
  assert.equal(presetOf({ ...defaultConfig('standard'), points: { on: true, reward: 11, penalty: 5 } }), 'custom');
  const off = MOTIVATION_PRESETS.find((p) => p.id === 'off')!.make();
  assert.equal(off.points.on || off.hearts.on || off.levels.on, false);
});

test('a goal reads as a sentence of what it does', () => {
  const cfg = { ...defaultConfig('standard'), hearts: { on: true, max: 3 } };
  assert.equal(payText(undefined, cfg), 'points when met; nothing if missed' .replace('nothing if missed', 'nothing if missed'));
  assert.equal(payText({ reward: 20, penalty: 5, heart: true }, cfg), '+20 points when met; lose 5 points and lose a heart if missed');
  assert.equal(payText({ reward: 20 }, { ...cfg, points: { ...cfg.points, on: false } }), 'nothing when met; nothing if missed');
});

test('every goal of a game shows in one list', () => {
  const t = habit('a', 'Water', 'g');
  t.goals = [{ id: 'g1', measure: 'days', how: 'week', cmp: 'min', value: 4, from: '2026-11-01', field: 'days', agg: 'days', pay: { reward: 5 } }];
  const g: System = { id: 'g', name: 'G', config: defaultConfig('standard'), createdAt: 0, quests: [{ id: 'q', trackers: 'all', metric: 'trackersDone', how: 'day', value: 1, from: '2026-11-01' }] };
  const rows = allGoals(g, [t], settings);
  assert.deepEqual(rows.map((r) => r.kind), ['game', 'tracker']);
  assert.equal(rows[1].pay?.reward, 5);
});

test('every style carries its alert volume, and a plain blurb that says so', () => {
  for (const p of MOTIVATION_PRESETS) {
    const c = p.make();
    assert.ok(c.alerts, `${p.id} sets its alerts`);
    assert.ok(p.blurb.length <= 48, `${p.id} blurb is short`);
  }
  const on = (id: string) => Object.values(MOTIVATION_PRESETS.find((p) => p.id === id)!.make().alerts!.on).filter(Boolean).length;
  assert.equal(on('off'), 0, 'Just track is silent');
  assert.ok(on('light') < on('standard') && on('standard') < on('strict'), 'more pressure means more nudges');
});

test('a good week pays per tracker when enough of its due days were good', () => {
  const t = habit('a', 'A', 's');
  const MON = day(2026, 11, 2);
  const week = (hits: number): DayInput[] => Array.from({ length: 7 }, (_, i) => ({ day: addDays(MON, i), closed: true, results: { [t.id]: { expected: true, success: i < hits, measures: {} } } }));
  const ev = (hits: number, pct: number) => weekEvents([t], week(hits), pct, 'mon');
  assert.equal(ev(5, 70)[0].success, true);
  assert.equal(ev(4, 70)[0].success, false);
  assert.equal(ev(7, 100)[0].success, true);
  assert.equal(ev(6, 100)[0].success, false);
  assert.equal(weekEvents([t], week(7).slice(0, 5), 50, 'mon').length, 0, 'an unfinished week is not judged');
});

test('the summary rows say what each part is set to, alerts included', () => {
  const rows = gameRows(MOTIVATION_PRESETS.find((p) => p.id === 'standard')!.make());
  assert.deepEqual(rows.map((r) => r.key), ['goals', 'points', 'levels', 'hearts', 'streaks', 'alerts', 'rewards']);
  assert.equal(rows.find((r) => r.key === 'alerts')!.value, 'Reminders, cheers');
  assert.equal(gameRows(MOTIVATION_PRESETS.find((p) => p.id === 'off')!.make()).find((r) => r.key === 'alerts')!.value, 'Off');
});
