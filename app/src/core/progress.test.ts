// Progress toward a tracker's target, 0 to 1, by rule type: one scale for every shape, and exactly 1 whenever the day counts as met.
import assert from 'node:assert/strict';
import test from 'node:test';
import { successSpec, targetProgress, trackerProgress, trackerSuccess } from './measures';
import { DayIndex, periodShare, systemShare } from './overview';
import { buildPersona, PERSONAS } from './personas';
import { draftFromAnswers } from './setup';
import { TEMPLATES } from './templates';
import { addDays, startOfDay } from './time';
import type { Settings, Target, Tracker } from './types';

const SETTINGS = { units: 'metric', weekStart: 'mon' } as unknown as Settings;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
const m = (v: number, logged = true) => ({ n: v, count: v, done: logged ? 1 : 0 });

test('at least: progress is the share of the target reached, capped at one', () => {
  const t: Target = { id: 't', measure: 'n', min: 8 };
  near(targetProgress(t, m(6)), 0.75);
  near(targetProgress(t, m(8)), 1);
  near(targetProgress(t, m(12)), 1);
  near(targetProgress(t, m(0, false)), 0);
});

test('at most: within the limit is 1; over it, the share that stayed within; nothing logged is not a day', () => {
  const t: Target = { id: 't', measure: 'n', max: 4 };
  near(targetProgress(t, m(4)), 1);
  near(targetProgress(t, m(5)), 0.8);
  near(targetProgress(t, m(8)), 0.5);
  near(targetProgress(t, m(0, false)), 0);
});

test('between: inside is 1, below is the share of the low end, above is the share of the high end', () => {
  const t: Target = { id: 't', measure: 'n', min: 2, max: 4 };
  near(targetProgress(t, m(3)), 1);
  near(targetProgress(t, m(1)), 0.5);
  near(targetProgress(t, m(6)), 4 / 6);
});

test('strict credit gives nothing for anything short, and 1 for met', () => {
  const t: Target = { id: 't', measure: 'n', min: 8 };
  assert.equal(targetProgress(t, m(6), 'strict'), 0);
  assert.equal(targetProgress(t, m(8), 'strict'), 1);
});

test('a plan: the share of the way to the threshold; logged and clean are all or nothing', () => {
  const base = draftFromAnswers({ ...TEMPLATES.find((x) => x.id === 'gym-split')!.make(), finishPlan: true }, SETTINGS) as unknown as Tracker; // finishing the plan is set by the person (goals), not the template
  assert.equal(base.success.mode, 'plan');
  near(trackerProgress(base, { completion: 60 }), 0.75);
  near(trackerProgress(base, { completion: 80 }), 1);
  near(trackerProgress(base, { completion: 0 }), 0);
  const logged = { ...base, success: { mode: 'logged' } } as Tracker;
  assert.equal(trackerProgress(logged, { done: 0 }), 0);
  assert.equal(trackerProgress(logged, { done: 1 }), 1);
  const clean = { ...base, success: { mode: 'clean' } } as Tracker;
  assert.equal(trackerProgress(clean, { done: 0 }), 1);
  assert.equal(trackerProgress(clean, { done: 1 }), 0, 'a slip is not a clean day');
});

test('for every preset: a day that meets its rule is exactly 1, and an empty day is below 1 unless nothing is asked', () => {
  for (const t of TEMPLATES) {
    const tr = draftFromAnswers(t.make(), SETTINGS) as unknown as Tracker;
    const spec = successSpec(tr);
    const met = { done: 1, count: 1, completion: 100, [spec.measure]: spec.value };
    assert.ok(trackerSuccess(tr, met), `${t.id}: the simulated good day counts as met`);
    assert.equal(trackerProgress(tr, met), 1, `${t.id}: met is exactly 1`);
    const empty = { done: 0, count: 0, completion: 0 };
    if (tr.success.mode === 'clean') continue; // an empty day is the good one
    assert.ok(trackerProgress(tr, empty) < 1, `${t.id}: an empty day is short of its rule`);
    assert.ok(trackerProgress(tr, empty) >= 0, `${t.id}: never negative`);
  }
});

test('strict never reads higher than partial on the same history, and partial can read higher', () => {
  const p = buildPersona(PERSONAS.find((x) => x.id === 'regular')!, SETTINGS, null, new Date(2026, 10, 22, 12).getTime());
  const today = startOfDay(new Date(2026, 10, 22, 12).getTime());
  const soft = new DayIndex(p.trackers, p.entries, 'partial');
  const hard = new DayIndex(p.trackers, p.entries, 'strict');
  let higher = 0;
  for (let i = 1; i <= 200; i++) {
    const d = addDays(today, -i);
    const a = systemShare(soft, d); const b = systemShare(hard, d);
    if (a === undefined || b === undefined) continue;
    assert.ok(a + 1e-9 >= b, `day ${i}: partial ${a} at least strict ${b}`);
    if (a > b + 1e-9) higher++;
  }
  assert.ok(higher >= 0);
  const wk = addDays(today, -13);
  assert.ok((periodShare(soft, wk, addDays(wk, 6), today, 'mon') ?? 0) + 1e-9 >= (periodShare(hard, wk, addDays(wk, 6), today, 'mon') ?? 0));
});
