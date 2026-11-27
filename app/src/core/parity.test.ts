// Templates and Build your own are one system: a template is only a set of answers Build your own could have given.
// These are the settings setup has no control for (goals, targets, end dates, sample lists); no template may use them,
// so anything a template does can be found, checked and changed from Build your own, and a fix there reaches every template.
import assert from 'node:assert/strict';
import test from 'node:test';
import { TEMPLATES } from './templates';

test('no template sets anything Build your own cannot', () => {
  for (const t of TEMPLATES) {
    const a = t.make();
    assert.equal(a.goal, 'none', `${t.id}: goal`);
    assert.deepEqual(a.goals, [], `${t.id}: goals`);
    assert.equal(a.finishPlan, false, `${t.id}: finish the plan`);
    assert.equal(a.window, undefined, `${t.id}: end date`);
    assert.deepEqual(a.extraTargets, [], `${t.id}: targets`);
    assert.deepEqual(a.startGoals, [], `${t.id}: starting goals`);
    assert.equal(a.sample, undefined, `${t.id}: sample list`);
  }
});

import { answersFromPreset, answersFromTracker, draftFromAnswers, summaryLines } from './setup';
import { fieldUnit, toDisplay } from './units';
import type { Settings, Tracker } from './types';

test('a counter can follow the units and add decimals, and reads back the same', () => {
  const metric = { units: 'metric' } as Settings;
  const imperial = { units: 'imperial' } as Settings;
  const a = { ...answersFromPreset('counter'), name: 'Juice', countKind: 'volume' as const, countStep: 250, countUnit: '' };
  const t = { ...draftFromAnswers(a, metric), id: 'j', systemId: null, createdAt: 0 } as Tracker;
  const f = t.fields.find((x) => x.id === 'n')!;
  assert.equal(fieldUnit(f, metric), 'ml');
  assert.equal(Math.round(toDisplay(f, f.step!, metric)), 250, '250 ml a tap');
  assert.notEqual(fieldUnit(f, imperial), 'ml', 'the same counter shows imperial units for an imperial person');
  assert.equal(answersFromTracker(t, metric, false).countStep, 250, 'reads back as 250');
  const half = draftFromAnswers({ ...answersFromPreset('counter'), name: 'Half', countStep: 0.5, countUnit: '' }, metric);
  assert.equal(half.fields[0].step, 0.5, 'a tap can add half');
  assert.ok(summaryLines(a, metric).some((l) => l.value === 'Tap to count, 250 ml a tap'));
});
