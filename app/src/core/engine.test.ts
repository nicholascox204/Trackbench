import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nickGym, nickNutrition, nickWeight } from '../fixtures/nick';
import { DayInput, defaultConfig, evaluate, simulate } from './engine';
import { completionPct, computeDay, trackerSuccess } from './measures';
import { dayKeyOf, planFor, previousRow, versionFor } from './plan';
import { answersFromPreset, draftFromAnswers } from './setup';
import { addDays, startOfDay } from './time';
import { exportReadable, exportStructure, parseBackup, parseStructure, exportBackup } from './transfer';
import type { AppState, Entry, SystemConfig, Tracker } from './types';
import { fieldUnit, formatMeasure, fromDisplay, toDisplay } from './units';

function tracker(id: string, presetId = 'check-in'): Tracker {
  return { ...draftFromAnswers(answersFromPreset(presetId), { units: 'metric' }), id, name: id, systemId: 's', createdAt: 0 };
}

function fromDraft(draft: ReturnType<typeof nickGym>, id: string): Tracker {
  return { ...draft, id, systemId: null, createdAt: 0 };
}

// pattern: 'h' hit, 'm' miss, 'p' today pending
function days(ids: string[], pattern: string): DayInput[] {
  const base = 1_700_000_000_000;
  return pattern.split('').map((c, i) => {
    const results: DayInput['results'] = {};
    for (const id of ids) {
      results[id] = { expected: true, success: c === 'h', measures: { done: c === 'h' ? 1 : 0 } };
    }
    return { day: addDays(base, i), closed: c !== 'p', results };
  });
}

function cfg(patch: Partial<SystemConfig> = {}): SystemConfig {
  return { ...defaultConfig('standard'), allClear: { on: false, bonus: 10 }, ...patch };
}

// ---------- system engine ----------

test('strict streak counts consecutive hits and resets on a miss', () => {
  const r = evaluate(cfg({ consistency: 'strict' }), [tracker('a')], days(['a'], 'hhmhh'));
  assert.equal(r.perTracker.a.streak, 2);
});

test('grace streak survives one miss but breaks on two in a row', () => {
  assert.equal(evaluate(cfg({ consistency: 'grace' }), [tracker('a')], days(['a'], 'hhmhh')).perTracker.a.streak, 4);
  assert.equal(evaluate(cfg({ consistency: 'grace' }), [tracker('a')], days(['a'], 'hhmmhh')).perTracker.a.streak, 2);
});

test('points reward hits, penalize closed misses, and never go below zero', () => {
  assert.equal(evaluate(cfg(), [tracker('a')], days(['a'], 'mmh')).points, 10);
  assert.equal(evaluate(cfg(), [tracker('a')], days(['a'], 'hp')).points, 10);
});

test('hearts drop on a missed day and regain on a perfect day', () => {
  const r = evaluate(cfg({ hearts: { on: true, max: 3 } }), [tracker('a')], days(['a'], 'mmh'));
  assert.equal(r.hearts, 2);
});

test('all-clear needs two or more trackers', () => {
  const c = cfg({ allClear: { on: true, bonus: 10 } });
  assert.equal(evaluate(c, [tracker('a'), tracker('b')], days(['a', 'b'], 'h')).points, 30);
  assert.equal(evaluate(c, [tracker('a')], days(['a'], 'h')).points, 10);
});

test('ledger deltas add up to the final points', () => {
  const r = evaluate(cfg({ lucky: { on: true, chance: 50, bonus: 5 } }), [tracker('a')], days(['a'], 'hmhhmhh'));
  assert.equal(r.ledger.filter((l) => l.unit === 'pts').reduce((s, l) => s + l.delta, 0), r.points);
});

test('simulator rewards a better week, for planned trackers too', () => {
  const t = [tracker('a'), fromDraft(nickNutrition(), 'n')];
  assert.ok(simulate(cfg(), t, 1).earned > simulate(cfg(), t, 0.1).earned);
});

// ---------- units ----------

test('units: system default, per-field override, and lossless storage', () => {
  const gym = fromDraft(nickGym(), 'g');
  const w = gym.fields[0];
  assert.equal(fieldUnit(w, { units: 'imperial' }), 'lb');
  assert.equal(fieldUnit(w, { units: 'metric' }), 'kg');
  assert.equal(fieldUnit({ ...w, unitOverride: 'kg' }, { units: 'imperial' }), 'kg');
  const stored = fromDisplay(w, 135, { units: 'imperial' });
  assert.ok(Math.abs(toDisplay(w, stored, { units: 'imperial' }) - 135) < 1e-9);
  assert.ok(Math.abs(toDisplay(w, stored, { units: 'metric' }) - 61.2) < 0.1);
  const fixed = fromDraft(nickNutrition(), 'n').fields[0];
  assert.equal(fieldUnit(fixed, { units: 'imperial' }), 'g');
});

// ---------- plan ----------

test('plan versions: the active version applies on each date', () => {
  const t = fromDraft(nickGym(), 'g');
  const old = nickGym().plan[0].days;
  const newer = old.map((d) => ({ ...d, label: 'changed' }));
  t.plan = [{ from: '2026-01-01', days: old }, { from: '2026-06-01', days: newer }];
  const early = new Date(2026, 2, 2).getTime(); // a Monday in March
  const late = new Date(2026, 8, 7).getTime(); // a Monday in September
  assert.equal(versionFor(t.plan, early)?.from, '2026-01-01');
  assert.equal(planFor(t, late)?.label, 'changed');
  assert.match(planFor(t, early)?.label ?? '', /Push A/);
});

function row(trackerId: string, slotId: string, r: number, day: number, w: number, reps: number): Entry {
  return { id: `${slotId}${r}${day}`, trackerId, at: day + 1000, slotId, row: r, done: true, values: { weight: w, reps } };
}

test('previous values walk back weeks on the same weekday and skip blank weeks', () => {
  const day = startOfDay(new Date(2026, 8, 7).getTime());
  const entries = [row('g', 'bench', 0, addDays(day, -21), 60, 6), row('g', 'bench', 1, addDays(day, -7), 62, 6)];
  assert.equal(previousRow(entries, 'bench', 0, day)?.values.weight, 60); // skips the empty week 1
  assert.equal(previousRow(entries, 'bench', 1, day)?.values.weight, 62);
  assert.equal(previousRow(entries, 'bench', 2, day), null);
});

// ---------- reproducing Nick's tracker from configuration ----------

test("Nick's gym: Monday plan matches his tracker and completion counts sets", () => {
  const gym = fromDraft(nickGym(), 'g');
  const monday = startOfDay(new Date(2026, 8, 7).getTime());
  const pd = planFor(gym, monday)!;
  assert.equal(pd.slots.length, 7);
  assert.equal(pd.slots.reduce((s, x) => s + (x.sets ?? 0), 0), 4 + 4 + 3 + 3 + 3 + 3 + 2);
  const sunday = startOfDay(new Date(2026, 8, 6).getTime());
  assert.equal(planFor(gym, sunday)?.slots.length, 0, 'a day he does not train has nothing planned');
  const done: Entry[] = [];
  for (let r = 0; r < 4; r++) done.push(row('g', 'bench', r, monday, 80, 6));
  assert.equal(completionPct(pd, done), Math.round((4 / 22) * 100));
  const m = computeDay(gym, done, pd);
  assert.equal(m.sets, 4);
  assert.ok(Math.abs(m.volume - 4 * 80 * 6) < 1e-9);
  assert.equal(formatMeasure(gym, gym.measures[1], m.volume, { units: 'metric' }), '1,920 kg');
  assert.equal(trackerSuccess(gym, m), false);
});

test("Nick's nutrition: variants, totals against targets, success on protein", () => {
  const n = fromDraft(nickNutrition(), 'n');
  const monday = startOfDay(new Date(2026, 8, 7).getTime());
  const pd = planFor(n, monday)!;
  const pick = (slotId: string, variant?: number): Entry => {
    const s = pd.slots.find((x) => x.id === slotId)!;
    const values = variant !== undefined ? s.variants![variant].values : s.values!;
    return { id: slotId, trackerId: 'n', at: monday + 1000, slotId, variant, done: true, values };
  };
  const all = [pick('e1'), pick('e2'), pick('p1', 0), pick('p2'), pick('a1'), pick('a2'), pick('d1', 1), pick('n1')];
  const m = computeDay(n, all, pd);
  assert.equal(m.protein, 30 + 3 + 46 + 9 + 24 + 1 + 58 + 19);
  assert.equal(m.kcal, 350 + 85 + 330 + 378 + 196 + 80 + 481 + 180);
  assert.equal(trackerSuccess(n, m), false); // 190 < 195
  assert.equal(trackerSuccess(n, computeDay(n, [...all, { ...pick('e1'), id: 'x', values: { protein: 10, kcal: 0 } }], pd)), true);
});

test("Nick's weight: three-day average is a derived measure on the tracker", () => {
  const w = fromDraft(nickWeight(), 'w');
  assert.equal(w.derived[0].days, 3);
});

// ---------- transfer ----------

test('structure export round-trips through validation', () => {
  const t = fromDraft(nickGym(), 'g');
  const res = parseStructure(exportStructure(t));
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.value.name, 'Workout');
    assert.equal(res.value.plan[0].days.length, 7);
    assert.equal(res.value.fields.length, 2);
  }
});

test('structure import rejects bad input with readable errors', () => {
  const bad = parseStructure('{"format":"tracker-structure","tracker":{"name":"","input":"nope","fields":[{"id":1}]}}');
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.errors.length >= 2);
  assert.equal(parseStructure('hello').ok, false);
});

test('backup round-trips and the readable export mentions the plan', () => {
  const t = fromDraft(nickGym(), 'g');
  const state: AppState = { trackers: [t], entries: [row('g', 'bench', 0, startOfDay(Date.now()), 80, 6)], systems: [], settings: { units: 'imperial' }, onboarded: true };
  const res = parseBackup(exportBackup(state));
  assert.ok(res.ok);
  if (res.ok) assert.equal(res.value.entries.length, 1);
  const text = exportReadable(state, null, 3);
  assert.match(text, /# TRACKER DATA EXPORT/);
  assert.match(text, /Workout/);
  assert.ok(dayKeyOf(Date.now()).length === 10);
});
